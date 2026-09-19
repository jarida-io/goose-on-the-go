package io.jarida.pondtls

import com.facebook.react.modules.network.OkHttpClientProvider
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import java.security.MessageDigest
import java.util.Base64
import java.util.concurrent.TimeUnit

class PondTlsTest {
  private val servers = mutableListOf<MockWebServer>()
  private fun pin(cert: HeldCertificate) = "sha256/" + Base64.getEncoder().encodeToString(
    MessageDigest.getInstance("SHA-256").digest(cert.certificate.publicKey.encoded))
  private fun server(cert: HeldCertificate): MockWebServer {
    val server = MockWebServer()
    server.useHttps(HandshakeCertificates.Builder().heldCertificate(cert).build().sslSocketFactory(), false)
    server.start(); servers.add(server)
    server.enqueue(MockResponse().setBody("ok"))
    return server
  }
  private fun configure(server: MockWebServer, hash: String) {
    PondTls.configurePins(mapOf("https://localhost:${server.port}" to hash)); PondTls.install()
  }
  private fun request(server: MockWebServer, marker: Boolean = true) = Request.Builder()
    .url(server.url("/api/v1/health")).apply { if (marker) header("X-Pond-Transport", "1") }.build()
  @After fun cleanup() { PondTls.configurePins(emptyMap()); servers.forEach { it.shutdown() } }

  @Test fun correctPinWorksForTwoIndependentClients() {
    val cert = HeldCertificate.Builder().addSubjectAlternativeName("localhost").build()
    val server = server(cert); configure(server, pin(cert))
    server.enqueue(MockResponse().setBody("event"))
    // Expo fetch and RN XHR both request their own client from this factory.
    repeat(2) { OkHttpClientProvider.createClient().newCall(request(server)).execute().use { assertEquals(200, it.code) } }
    assertEquals(2, server.requestCount)
    assertNull(server.takeRequest().getHeader("X-Pond-Transport"))
  }
  @Test fun certificateRenewalRetainsPublicKeyTrust() {
    val first = HeldCertificate.Builder().addSubjectAlternativeName("localhost").build()
    val renewed = HeldCertificate.Builder().keyPair(first.keyPair).addSubjectAlternativeName("localhost")
      .addSubjectAlternativeName("192.168.1.22").build()
    assertEquals(pin(first), pin(renewed))
    val server = server(renewed); configure(server, pin(first))
    OkHttpClientProvider.createClient().newCall(request(server)).execute().use { assertEquals(200, it.code) }
  }
  @Test fun incorrectPinFailsBeforeHttp() {
    val cert = HeldCertificate.Builder().addSubjectAlternativeName("localhost").build()
    val server = server(cert); configure(server, pin(HeldCertificate.Builder().build()))
    repeat(2) { assertThrows(Exception::class.java) { OkHttpClientProvider.createClient().newCall(request(server)).execute() } }
    assertEquals(0, server.requestCount)
  }
  @Test fun matchingPinDoesNotBypassHostname() {
    val cert = HeldCertificate.Builder().addSubjectAlternativeName("different.test").build()
    val server = server(cert); configure(server, pin(cert))
    assertThrows(Exception::class.java) { OkHttpClientProvider.createClient().newCall(request(server)).execute() }
    assertEquals(0, server.requestCount)
  }
  @Test fun matchingPinDoesNotBypassExpiry() {
    val cert = HeldCertificate.Builder().addSubjectAlternativeName("localhost")
      .validityInterval(1, 1000).build()
    val server = server(cert); configure(server, pin(cert))
    assertThrows(Exception::class.java) { OkHttpClientProvider.createClient().newCall(request(server)).execute() }
    assertEquals(0, server.requestCount)
  }
  @Test fun clearingTrustInvalidatesPooledConnections() {
    val cert = HeldCertificate.Builder().addSubjectAlternativeName("localhost").build()
    val server = server(cert); configure(server, pin(cert)); val client = OkHttpClientProvider.createClient()
    client.newCall(request(server)).execute().close(); PondTls.configurePins(emptyMap())
    assertThrows(Exception::class.java) { client.newCall(request(server)).execute() }
    assertEquals(1, server.requestCount)
  }
  @Test fun unrelatedSelfSignedTrafficKeepsPlatformValidation() {
    val cert = HeldCertificate.Builder().addSubjectAlternativeName("localhost").build()
    val first = server(cert); configure(first, pin(cert)); val other = server(cert)
    assertThrows(Exception::class.java) { OkHttpClientProvider.createClient().newCall(request(other, false)).execute() }
    assertEquals(0, other.requestCount)
  }
  @Test fun plaintextAndUnconfiguredOriginsFailBeforeHttp() {
    PondTls.install(); val client = OkHttpClientProvider.createClient()
    val request = Request.Builder().url("http://127.0.0.1:4000/api/v1/health").header("X-Pond-Transport", "1").build()
    assertThrows(Exception::class.java) { client.newCall(request).execute() }
  }
  @Test fun redirectsNeverSendCredentialsToAnotherOrigin() {
    val cert = HeldCertificate.Builder().addSubjectAlternativeName("localhost").build()
    val server = MockWebServer(); servers.add(server)
    server.useHttps(HandshakeCertificates.Builder().heldCertificate(cert).build().sslSocketFactory(), false)
    server.start(); configure(server, pin(cert))
    val destination = MockWebServer(); destination.start(); servers.add(destination)
    server.enqueue(MockResponse().setResponseCode(302).setHeader("Location", destination.url("/stolen")))
    assertThrows(Exception::class.java) { OkHttpClientProvider.createClient().newBuilder().followRedirects(true).build().newCall(request(server)).execute() }
    assertNull(destination.takeRequest(100, TimeUnit.MILLISECONDS))
  }
}
