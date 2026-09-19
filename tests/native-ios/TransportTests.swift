import Foundation
import Security

final class StreamReceiver: NSObject, URLSessionDataDelegate, @unchecked Sendable {
  let first = DispatchSemaphore(value: 0)
  let done = DispatchSemaphore(value: 0)
  private let lock = NSLock()
  private var failed = false
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    first.signal()
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    lock.lock()
    failed = error != nil
    lock.unlock()
    done.signal()
  }
  var wasCancelled: Bool {
    lock.lock()
    defer { lock.unlock() }
    return failed
  }
}

@main struct TransportTests {
  static func main() async throws {
    let directory = URL(fileURLWithPath: CommandLine.arguments[1])
    let base = CommandLine.arguments[2]
    let certificateData = try Data(contentsOf: directory.appendingPathComponent("certificate.der"))
    let certificate = SecCertificateCreateWithData(nil, certificateData as CFData)!
    let pin = try PondCertificate.pin(certificate)
    let expected = try String(
      contentsOf: directory.appendingPathComponent("pin.txt"), encoding: .utf8
    ).trimmingCharacters(in: .whitespacesAndNewlines)
    precondition(pin == expected, "SPKI digest differs from OpenSSL")
    var directTrust: SecTrust?
    precondition(
      SecTrustCreateWithCertificates(
        certificate, SecPolicyCreateSSL(true, "127.0.0.1" as CFString), &directTrust)
        == errSecSuccess)
    if !PondCertificate.verify(directTrust!, host: "127.0.0.1", pin: pin) {
      var error: CFError?
      _ = SecTrustEvaluateWithError(directTrust!, &error)
      throw error ?? URLError(.serverCertificateUntrusted) as CFError
    }
    let renewed = SecCertificateCreateWithData(
      nil, try Data(contentsOf: directory.appendingPathComponent("renewed.der")) as CFData)!
    let renewedPin = try PondCertificate.pin(renewed)
    precondition(renewedPin == pin, "Certificate renewal changed the pin")
    do {
      _ = try PondCertificate.pin(certificate, now: Date().addingTimeInterval(172800))
      fatalError("expired certificate accepted")
    } catch { precondition((error as? URLError)?.code == .serverCertificateHasBadDate) }
    var malformed = PondCertificate.DER(bytes: Data([0x30, 0x84, 0xff, 0xff, 0xff, 0xff]))
    do {
      _ = try malformed.next()
      fatalError("malformed DER accepted")
    } catch {}
    let localhost = base.replacingOccurrences(of: "127.0.0.1", with: "localhost")
    try PondURLProtocol.configure([["url": base, "pin": pin], ["url": localhost, "pin": pin]])
    let fetch = URLSession(configuration: PondURLProtocol.configuration())
    let xhr = URLSession(configuration: PondURLProtocol.configuration())
    defer {
      fetch.invalidateAndCancel()
      xhr.invalidateAndCancel()
    }
    func request(_ path: String, session: URLSession = fetch, origin: String? = nil) async throws
      -> Data
    {
      var request = URLRequest(url: URL(string: (origin ?? base) + path)!)
      request.setValue("1", forHTTPHeaderField: "X-Pond-Transport")
      request.timeoutInterval = 5
      let (data, response) = try await session.data(for: request)
      precondition((response as? HTTPURLResponse)?.statusCode == 200)
      return data
    }
    _ = try await request("/fetch")
    _ = try await request("/xhr", session: xhr)
    let stream = try await request("/sse", session: xhr)
    precondition(String(data: stream, encoding: .utf8)!.contains("second"))
    do {
      _ = try await request("/hostname", origin: localhost)
      fatalError("hostname mismatch accepted")
    } catch {}
    try PondURLProtocol.configure([
      ["url": base, "pin": "sha256/" + Data(repeating: 0, count: 32).base64EncodedString()]
    ])
    do {
      _ = try await request("/wrong-pin")
      fatalError("wrong pin accepted")
    } catch {}
    precondition(PondURLProtocol.trustFailed(URL(string: base)!))
    try PondURLProtocol.configure([["url": base, "pin": pin]])
    do {
      _ = try await request("/redirect")
      fatalError("redirect followed")
    } catch {}
    do {
      _ = try await request(
        "/plaintext", origin: base.replacingOccurrences(of: "https:", with: "http:"))
      fatalError("plaintext accepted")
    } catch {}
    let receiver = StreamReceiver()
    let streaming = URLSession(
      configuration: PondURLProtocol.configuration(), delegate: receiver, delegateQueue: nil)
    var streamRequest = URLRequest(url: URL(string: base + "/hold")!)
    streamRequest.setValue("1", forHTTPHeaderField: "X-Pond-Transport")
    streaming.dataTask(with: streamRequest).resume()
    precondition(
      receiver.first.wait(timeout: .now() + 5) == .success, "SSE data was buffered until EOF")
    try PondURLProtocol.configure([])
    precondition(
      receiver.done.wait(timeout: .now() + 5) == .success && receiver.wasCancelled,
      "Trust change left an old stream active")
    streaming.invalidateAndCancel()
    do {
      _ = try await request("/cleared")
      fatalError("cleared pin accepted")
    } catch {}
    let unrelated = URLSession(configuration: PondURLProtocol.configuration())
    defer { unrelated.invalidateAndCancel() }
    do {
      _ = try await unrelated.data(from: URL(string: base + "/unrelated")!)
      fatalError("unrelated self-signed certificate accepted")
    } catch {}
    print(
      "PASS Apple transport: SPKI, renewal, validity, bounded DER, two clients, incremental SSE, hostname, wrong pin, redirect, plaintext, active-stream cancellation, cleared trust, unrelated traffic"
    )
  }
}
