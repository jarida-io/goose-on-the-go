package io.jarida.pondtls

import com.facebook.react.bridge.*
import com.facebook.react.ReactPackage
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.modules.network.OkHttpClientProvider
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import java.lang.ref.WeakReference
import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.concurrent.CopyOnWriteArrayList
import javax.net.ssl.*
import java.util.Base64

/** The sole trust registry for Expo fetch and React Native XHR (including SSE). */
object PondTls {
  @Volatile private var pins: Map<String, String> = emptyMap()
  private val clients = CopyOnWriteArrayList<Pair<WeakReference<Dispatcher>, WeakReference<ConnectionPool>>>()
  private val trustFailures = java.util.concurrent.ConcurrentHashMap<String, Boolean>()
  internal fun trustFailed(url: String): Boolean = trustFailures[origin(url.toHttpUrl())] == true
  private const val MARKER = "X-Pond-Transport"

  private fun origin(url: HttpUrl): String = "${url.scheme}://${url.host}:${url.port}"
  private fun pin(cert: X509Certificate): String = "sha256/" + Base64.getEncoder().encodeToString(
    MessageDigest.getInstance("SHA-256").digest(cert.publicKey.encoded))

  @Synchronized fun configure(entries: ReadableArray) {
    val next = mutableMapOf<String, String>()
    for (i in 0 until entries.size()) {
      val entry = requireNotNull(entries.getMap(i))
      val url = requireNotNull(entry.getString("url")).toHttpUrl()
      require(url.isHttps && url.username.isEmpty() && url.password.isEmpty() && url.encodedPath == "/" && url.query == null && url.fragment == null)
      val hash = requireNotNull(entry.getString("pin"))
      require(hash.startsWith("sha256/") && Base64.getDecoder().decode(hash.substring(7)).size == 32)
      val name = origin(url)
      require(next[name] == null || next[name] == hash) { "conflicting Pond pins" }
      next[name] = hash
    }
    configurePins(next)
  }

  @Synchronized internal fun configurePins(next: Map<String, String>) {
    if (pins == next) return
    pins = next.toMap()
    trustFailures.clear()
    // Cached TLS sessions and pooled connections must not outlive a trust change.
    clients.forEach { (dispatcher, pool) -> dispatcher.get()?.cancelAll(); pool.get()?.evictAll() }
    clients.removeAll { (dispatcher, pool) -> dispatcher.get() == null && pool.get() == null }
  }

  fun install() {
    OkHttpClientProvider.setOkHttpClientFactory {
      val managerFactory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
      managerFactory.init(null as KeyStore?)
      val platform = managerFactory.trustManagers.filterIsInstance<X509TrustManager>().single()
      val trust = object : X509TrustManager {
        override fun getAcceptedIssuers(): Array<X509Certificate> = platform.acceptedIssuers
        override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = platform.checkClientTrusted(chain, authType)
        override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
          try { platform.checkServerTrusted(chain, authType); return } catch (untrusted: CertificateException) {
            val leaf = chain.firstOrNull() ?: throw untrusted
            if (chain.size != 1 || pin(leaf) !in pins.values) throw untrusted
            leaf.checkValidity()
            if (leaf.subjectX500Principal != leaf.issuerX500Principal) throw untrusted
            leaf.verify(leaf.publicKey)
          }
        }
      }
      val ssl = SSLContext.getInstance("TLS")
      ssl.init(null, arrayOf(trust), null)
      val client = OkHttpClientProvider.createClientBuilder()
        .sslSocketFactory(ssl.socketFactory, trust)
        // Hostname verification remains OkHttp's standard SAN verifier.
        .retryOnConnectionFailure(false)
        .addInterceptor { chain ->
          val request = chain.request()
          if (request.header(MARKER) == "1") {
            if (!request.url.isHttps || pins[origin(request.url)] == null)
              throw SSLPeerUnverifiedException("Pond HTTPS trust is not configured")
          }
          try {
            val result = chain.proceed(request)
            trustFailures.remove(origin(request.url))
            result
          } catch (error: Exception) {
            if (request.header(MARKER) == "1" || pins.containsKey(origin(request.url))) {
              var cause: Throwable? = error
              while (cause != null) {
                if (cause is SSLException || cause is CertificateException) {
                  trustFailures[origin(request.url)] = true
                  break
                }
                cause = cause.cause
              }
            }
            throw error
          }
        }
        .addNetworkInterceptor { chain ->
          val request = chain.request()
          if (request.header(MARKER) != "1" && pins[origin(request.url)] == null) {
            if (request.url.isHttps) {
              val chainCertificates = (chain.connection()?.socket() as? SSLSocket)?.session?.peerCertificates
                ?.map { it as X509Certificate }?.toTypedArray()
                ?: throw SSLPeerUnverifiedException("TLS certificate is missing")
              // The custom self-signed exception must never authorize unrelated traffic.
              val authType = when (chainCertificates[0].publicKey.algorithm) {
                "EC" -> "ECDHE_ECDSA"
                else -> chainCertificates[0].publicKey.algorithm
              }
              platform.checkServerTrusted(chainCertificates, authType)
            }
            return@addNetworkInterceptor chain.proceed(request)
          }
          val expected = pins[origin(request.url)] ?: throw SSLPeerUnverifiedException("Pond trust was cleared")
          val certificate = (chain.connection()?.socket() as? SSLSocket)?.session?.peerCertificates?.firstOrNull() as? X509Certificate
            ?: throw SSLPeerUnverifiedException("Pond TLS certificate is missing")
          certificate.checkValidity()
          if (pin(certificate) != expected) throw SSLPeerUnverifiedException("Pond public key does not match")
          // This runs before request headers or body are written to the socket.
          val response = chain.proceed(request.newBuilder().removeHeader(MARKER).build())
          // Reject before OkHttp's follow-up interceptor can follow a redirect,
          // including clients copied by Expo with different redirect options.
          if (response.code in 300..399) {
            response.close()
            throw java.net.ProtocolException("Pond redirect rejected")
          }
          response
        }.build()
      clients.add(WeakReference(client.dispatcher) to WeakReference(client.connectionPool))
      client
    }
  }
}

class PondTlsModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "PondTls"
  @ReactMethod fun trustFailed(url: String, promise: Promise) {
    try { promise.resolve(PondTls.trustFailed(url)) } catch (_: Exception) { promise.resolve(true) }
  }
  @ReactMethod fun configure(entries: ReadableArray, promise: Promise) {
    try { PondTls.configure(entries); promise.resolve(null) }
    catch (error: Exception) { promise.reject("pond_tls_configuration", "Invalid Pond trust configuration", error) }
  }
}

class PondTlsPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(PondTlsModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
