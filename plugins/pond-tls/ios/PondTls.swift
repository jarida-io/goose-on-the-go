internal import Expo
import Foundation
import React

@objc(PondTls)
final class PondTls: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @MainActor static func install() {
    RCTSetCustomNSURLSessionConfigurationProvider { PondURLProtocol.configuration() }
    ExpoFetchCustomExtension.setCustomURLSessionConfigurationProvider {
      PondURLProtocol.configuration()
    }
  }

  @objc(configure:resolver:rejecter:)
  func configure(
    _ entries: [[String: String]], resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    do {
      try PondURLProtocol.configure(entries)
      resolve(nil)
    } catch { reject("pond_tls_configuration", "Invalid Pond trust configuration", error) }
  }

  @objc(trustFailed:resolver:rejecter:)
  func trustFailed(
    _ text: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(URL(string: text).map(PondURLProtocol.trustFailed) ?? true)
  }
}
