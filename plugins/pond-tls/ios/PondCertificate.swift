import CryptoKit
import Foundation
import Security

/// Reads only the bounded DER fields needed for SPKI pinning and validity.
/// Security.framework remains responsible for certificate/hostname validation.
enum PondCertificate {
  struct DER {
    let bytes: Data
    var cursor = 0
    mutating func next() throws -> (tag: UInt8, body: Data, encoded: Data) {
      let start = cursor
      guard cursor + 2 <= bytes.count else { throw URLError(.serverCertificateUntrusted) }
      let tag = bytes[cursor]
      cursor += 1
      var length = Int(bytes[cursor])
      cursor += 1
      if length & 128 != 0 {
        let count = length & 127
        guard count > 0, count <= 4, cursor + count <= bytes.count else {
          throw URLError(.serverCertificateUntrusted)
        }
        length = 0
        for _ in 0..<count {
          length = length * 256 + Int(bytes[cursor])
          cursor += 1
        }
      }
      guard length <= bytes.count - cursor else { throw URLError(.serverCertificateUntrusted) }
      let body = bytes.subdata(in: cursor..<cursor + length)
      cursor += length
      return (tag, body, bytes.subdata(in: start..<cursor))
    }
  }

  static func date(_ field: (tag: UInt8, body: Data, encoded: Data)) throws -> Date {
    guard var text = String(data: field.body, encoding: .ascii) else {
      throw URLError(.serverCertificateUntrusted)
    }
    if field.tag == 0x17, text.count == 13, let year = Int(text.prefix(2)) {
      text = (year >= 50 ? "19" : "20") + text
    } else if field.tag != 0x18 || text.count != 15 {
      throw URLError(.serverCertificateUntrusted)
    }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyyMMddHHmmss'Z'"
    formatter.isLenient = false
    guard let value = formatter.date(from: text), formatter.string(from: value) == text else {
      throw URLError(.serverCertificateUntrusted)
    }
    return value
  }

  static func pin(_ certificate: SecCertificate, now: Date = Date()) throws -> String {
    var der = DER(bytes: SecCertificateCopyData(certificate) as Data)
    let outer = try der.next()
    guard outer.tag == 0x30, der.cursor == der.bytes.count else {
      throw URLError(.serverCertificateUntrusted)
    }
    var sequence = DER(bytes: outer.body)
    let tbs = try sequence.next()
    guard tbs.tag == 0x30 else { throw URLError(.serverCertificateUntrusted) }
    var fields = DER(bytes: tbs.body)
    let first = try fields.next()
    if first.tag == 0xa0 { _ = try fields.next() }  // optional version, then serial
    _ = try fields.next()  // signature algorithm
    _ = try fields.next()  // issuer
    let validity = try fields.next()
    guard validity.tag == 0x30 else { throw URLError(.serverCertificateUntrusted) }
    var times = DER(bytes: validity.body)
    let from = try date(times.next())
    let until = try date(times.next())
    guard from <= now, now < until else { throw URLError(.serverCertificateHasBadDate) }
    _ = try fields.next()  // subject
    let spki = try fields.next()
    guard spki.tag == 0x30 else { throw URLError(.serverCertificateUntrusted) }
    return "sha256/" + Data(SHA256.hash(data: spki.encoded)).base64EncodedString()
  }

  static func verify(_ trust: SecTrust, host: String, pin expected: String) -> Bool {
    guard let certificates = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
      let leaf = certificates.first, (try? pin(leaf)) == expected
    else { return false }
    // A QR-pinned certificate becomes an anchor only for this request's trust object.
    guard SecTrustSetPolicies(trust, SecPolicyCreateSSL(true, host as CFString)) == errSecSuccess,
      SecTrustSetAnchorCertificates(trust, [leaf] as CFArray) == errSecSuccess,
      SecTrustSetAnchorCertificatesOnly(trust, true) == errSecSuccess
    else { return false }
    SecTrustSetNetworkFetchAllowed(trust, false)
    return SecTrustEvaluateWithError(trust, nil)
  }
}
