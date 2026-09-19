import Foundation
import Security

/// Used by both Expo fetch and React Native XHR. Unrelated requests are untouched.
final class PondURLProtocol: URLProtocol, URLSessionDataDelegate, @unchecked Sendable {
  private static let lock = NSRecursiveLock()
  private static var pins: [String: String] = [:]
  private static var failures: Set<String> = []
  private static var generation: UInt64 = 0
  private static let active = NSHashTable<PondURLProtocol>.weakObjects()
  private static let marker = "X-Pond-Transport"
  private var session: URLSession?
  private var transportTask: URLSessionDataTask?
  private var epoch: UInt64 = 0
  private var expected = ""
  private var ended = false

  static func origin(_ url: URL) -> String? {
    guard let host = url.host?.lowercased(), let scheme = url.scheme?.lowercased(),
      url.user == nil, url.password == nil, ["https", "http"].contains(scheme)
    else { return nil }
    return "\(scheme)://\(host):\(url.port ?? (scheme == "https" ? 443 : 80))"
  }

  static func configure(_ entries: [[String: String]]) throws {
    var next: [String: String] = [:]
    for entry in entries {
      guard let text = entry["url"], let url = URL(string: text), url.scheme == "https",
        url.path.isEmpty || url.path == "/", url.query == nil, url.fragment == nil,
        let name = origin(url), let pin = entry["pin"], pin.hasPrefix("sha256/"),
        Data(base64Encoded: String(pin.dropFirst(7)))?.count == 32,
        next[name] == nil || next[name] == pin
      else { throw URLError(.badURL) }
      next[name] = pin
    }
    lock.lock()
    defer { lock.unlock() }
    if next == pins { return }
    pins = next
    generation &+= 1
    failures.removeAll()
    for request in active.allObjects { request.fail(URLError(.cancelled)) }
  }

  static func trustFailed(_ url: URL) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return origin(url).map { failures.contains($0) } ?? true
  }

  static func configuration() -> URLSessionConfiguration {
    let config = URLSessionConfiguration.default
    config.protocolClasses =
      [PondURLProtocol.self] + (config.protocolClasses ?? []).filter { $0 != PondURLProtocol.self }
    return config
  }

  override class func canInit(with request: URLRequest) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if URLProtocol.property(forKey: "PondTLSHandled", in: request) != nil { return false }
    return request.value(forHTTPHeaderField: marker) == "1"
      || request.url.flatMap(origin).map { pins[$0] != nil } == true
  }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    Self.lock.lock()
    defer { Self.lock.unlock() }
    guard let url = request.url, url.scheme == "https", let name = Self.origin(url),
      let pin = Self.pins[name]
    else {
      fail(URLError(.serverCertificateUntrusted))
      return
    }
    epoch = Self.generation
    expected = pin
    Self.active.add(self)
    let forwarded = (request as NSURLRequest).mutableCopy() as! NSMutableURLRequest
    URLProtocol.setProperty(true, forKey: "PondTLSHandled", in: forwarded)
    forwarded.setValue(nil, forHTTPHeaderField: Self.marker)
    // Separate ephemeral sessions avoid pooled connections surviving a trust update.
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = []
    config.urlCache = nil
    config.urlCredentialStorage = nil
    config.httpShouldSetCookies = false
    config.timeoutIntervalForRequest = request.timeoutInterval
    session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
    transportTask = session?.dataTask(with: forwarded as URLRequest)
    transportTask?.resume()
  }

  override func stopLoading() {
    Self.lock.lock()
    defer { Self.lock.unlock() }
    ended = true
    transportTask?.cancel()
    session?.invalidateAndCancel()
    session = nil
    Self.active.remove(self)
  }

  private func fail(_ error: Error) {
    Self.lock.lock()
    defer { Self.lock.unlock() }
    guard !ended else { return }
    client?.urlProtocol(self, didFailWithError: error)
    stopLoading()
  }

  func urlSession(
    _ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    Self.lock.lock()
    defer { Self.lock.unlock() }
    guard !ended, epoch == Self.generation,
      challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
      let host = request.url?.host, let trust = challenge.protectionSpace.serverTrust,
      PondCertificate.verify(trust, host: host, pin: expected)
    else {
      if let name = request.url.flatMap(Self.origin) { Self.failures.insert(name) }
      completionHandler(.cancelAuthenticationChallenge, nil)
      return
    }
    completionHandler(.useCredential, URLCredential(trust: trust))
  }

  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
    fail(URLError(.redirectToNonExistentLocation))
  }

  func urlSession(
    _ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    Self.lock.lock()
    defer { Self.lock.unlock() }
    guard !ended, epoch == Self.generation else {
      completionHandler(.cancel)
      return
    }
    if let code = (response as? HTTPURLResponse)?.statusCode, (300..<400).contains(code) {
      completionHandler(.cancel)
      fail(URLError(.redirectToNonExistentLocation))
      return
    }
    if let name = request.url.flatMap(Self.origin) { Self.failures.remove(name) }
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    Self.lock.lock()
    defer { Self.lock.unlock() }
    if !ended, epoch == Self.generation { client?.urlProtocol(self, didLoad: data) }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    Self.lock.lock()
    defer { Self.lock.unlock() }
    guard !ended else { return }
    if let error {
      fail(error)
    } else {
      client?.urlProtocolDidFinishLoading(self)
      stopLoading()
    }
  }
}
