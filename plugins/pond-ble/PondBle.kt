package io.jarida.pondble

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.os.SystemClock
import android.util.Base64
import androidx.core.content.ContextCompat
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ViewManager
import java.util.UUID

/**
 * A byte pipe to one Pond over its BLE setup service, and nothing more: scanning, one connection,
 * notifications in, writes with response out. Framing, the exchange and sealing are JavaScript's
 * (services/setup-channel). No call here ever bonds: the Pond's channel is secured above GATT.
 */
@SuppressLint("MissingPermission")
class PondBleModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "PondBle"

  private val main = Handler(Looper.getMainLooper())
  private val manager: BluetoothManager? get() = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager?
  private val adapter: BluetoothAdapter? get() = manager?.adapter
  private var scanning: ScanCallback? = null
  private val lastSeen = HashMap<String, Long>()
  private val names = HashMap<String, String>()
  private val services = HashMap<String, List<String>>()
  private var scanBase: UUID? = null
  private var scanMask: UUID? = null
  private var link: Link? = null
  private var stateReceiver: BroadcastReceiver? = null

  private class Link(val address: String, val serviceUuid: UUID, val rxUuid: UUID, val txUuid: UUID) {
    var gatt: BluetoothGatt? = null
    var rx: BluetoothGattCharacteristic? = null
    var mtu = 23
    var connecting: Promise? = null
    var writing: Promise? = null
    var closed = false
  }

  private fun emit(event: String, body: WritableMap) {
    if (!context.hasActiveReactInstance()) return
    context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(event, body)
  }

  private fun granted(permission: String) =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

  private fun permitted(): Boolean = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
    granted(Manifest.permission.BLUETOOTH_SCAN) && granted(Manifest.permission.BLUETOOTH_CONNECT)
  } else {
    granted(Manifest.permission.ACCESS_FINE_LOCATION)
  }

  private fun currentState(): String {
    val a = adapter ?: return "unsupported"
    if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)) return "unsupported"
    if (!permitted()) return "unauthorized"
    return if (a.isEnabled) "on" else "off"
  }

  @ReactMethod fun addListener(@Suppress("UNUSED_PARAMETER") event: String) {
    if (stateReceiver != null) return
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context, intent: Intent) {
        emit("PondBleState", Arguments.createMap().apply { putString("state", currentState()) })
      }
    }
    ContextCompat.registerReceiver(context, receiver, IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED)
    stateReceiver = receiver
  }

  @ReactMethod fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Double) {}

  @ReactMethod fun state(promise: Promise) = promise.resolve(currentState())

  // With a mask, every UUID matching `serviceUuid` under it: how one scan hears every card id.
  @ReactMethod fun startScan(serviceUuid: String, mask: String?, promise: Promise) {
    val scanner = adapter?.bluetoothLeScanner
    if (currentState() != "on" || scanner == null) { promise.reject("pond_ble_unavailable", currentState()); return }
    stopScanning()
    lastSeen.clear()
    names.clear()
    services.clear()
    val base = UUID.fromString(serviceUuid)
    val bits = mask?.let(UUID::fromString)
    scanBase = base
    scanMask = bits
    val callback = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) = report(result)
      override fun onBatchScanResults(results: MutableList<ScanResult>) = results.forEach(::report)
      override fun onScanFailed(errorCode: Int) {
        scanning = null
        emit("PondBleScanFailed", Arguments.createMap().apply { putInt("code", errorCode) })
      }
    }
    val filter = ScanFilter.Builder().apply {
      if (bits == null) setServiceUuid(ParcelUuid(base)) else setServiceUuid(ParcelUuid(base), ParcelUuid(bits))
    }.build()
    val settings = ScanSettings.Builder().apply {
      setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) setLegacy(false)
    }.build()
    try {
      scanner.startScan(listOf(filter), settings, callback)
      scanning = callback
      promise.resolve(null)
    } catch (e: Exception) { promise.reject("pond_ble_scan", "Scan could not start", e) }
  }

  private fun matches(uuid: UUID): Boolean {
    val base = scanBase ?: return false
    val mask = scanMask ?: return uuid == base
    return (uuid.mostSignificantBits and mask.mostSignificantBits) == (base.mostSignificantBits and mask.mostSignificantBits) &&
      (uuid.leastSignificantBits and mask.leastSignificantBits) == (base.leastSignificantBits and mask.leastSignificantBits)
  }

  // Each Pond reports several times a second; once a second is plenty for a list.
  private fun report(result: ScanResult) {
    val address = result.device.address
    val now = SystemClock.elapsedRealtime()
    val heard = result.scanRecord?.serviceUuids?.map { it.uuid }?.filter(::matches)?.map { it.toString() }
    if (!heard.isNullOrEmpty()) services[address] = heard
    val uuids = services[address] ?: return
    val name = result.scanRecord?.deviceName ?: names[address]
    val named = name != null && names[address] == null
    if (!named && (now - (lastSeen[address] ?: 0L)) < 1000) return
    lastSeen[address] = now
    if (name != null) names[address] = name
    emit("PondBleDiscovered", Arguments.createMap().apply {
      putString("id", address)
      if (name != null) putString("name", name) else putNull("name")
      putArray("services", Arguments.fromList(uuids))
      putInt("rssi", result.rssi)
    })
  }

  private fun stopScanning() {
    val callback = scanning ?: return
    scanning = null
    try { adapter?.bluetoothLeScanner?.stopScan(callback) } catch (_: Exception) {}
  }

  @ReactMethod fun stopScan(promise: Promise) { stopScanning(); promise.resolve(null) }

  @ReactMethod fun connect(address: String, serviceUuid: String, rxUuid: String, txUuid: String, promise: Promise) {
    if (currentState() != "on") { promise.reject("pond_ble_unavailable", currentState()); return }
    stopScanning()
    link?.let { close(it, "replaced") }
    val device: BluetoothDevice = try { adapter!!.getRemoteDevice(address) } catch (e: Exception) {
      promise.reject("pond_ble_connect", "Unknown device", e); return
    }
    val next = Link(address, UUID.fromString(serviceUuid), UUID.fromString(rxUuid), UUID.fromString(txUuid))
    next.connecting = promise
    link = next
    main.postDelayed({ if (next.connecting != null) fail(next, "timeout") }, CONNECT_TIMEOUT_MS)
    next.gatt = device.connectGatt(context, false, callbackFor(next), BluetoothDevice.TRANSPORT_LE)
  }

  @ReactMethod fun write(address: String, base64: String, promise: Promise) {
    val current = link
    val gatt = current?.gatt
    val rx = current?.rx
    if (current == null || current.address != address || gatt == null || rx == null || current.closed) {
      promise.reject("pond_ble_closed", "Not connected"); return
    }
    if (current.writing != null) { promise.reject("pond_ble_busy", "A write is in flight"); return }
    val bytes = Base64.decode(base64, Base64.NO_WRAP)
    current.writing = promise
    val started = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      gatt.writeCharacteristic(rx, bytes, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT) == BluetoothGatt.GATT_SUCCESS
    } else {
      @Suppress("DEPRECATION")
      rx.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
      @Suppress("DEPRECATION")
      rx.value = bytes
      @Suppress("DEPRECATION")
      gatt.writeCharacteristic(rx)
    }
    if (!started) { current.writing = null; promise.reject("pond_ble_write", "Write could not start") }
  }

  @ReactMethod fun disconnect(address: String, promise: Promise) {
    link?.takeIf { it.address == address }?.let { close(it, "closed") }
    promise.resolve(null)
  }

  private fun callbackFor(l: Link) = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
      if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
        // The Pond chunks to ATT_MTU - 3; a larger MTU only means fewer notifications.
        if (!gatt.requestMtu(MTU)) gatt.discoverServices()
      } else if (newState == BluetoothProfile.STATE_DISCONNECTED || status != BluetoothGatt.GATT_SUCCESS) {
        fail(l, if (status == BluetoothGatt.GATT_SUCCESS) "disconnected" else "gatt_$status")
      }
    }

    override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
      if (status == BluetoothGatt.GATT_SUCCESS) l.mtu = mtu
      if (l.connecting != null) gatt.discoverServices()
    }

    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
      val service = gatt.getService(l.serviceUuid)
      val rx = service?.getCharacteristic(l.rxUuid)
      val tx = service?.getCharacteristic(l.txUuid)
      if (status != BluetoothGatt.GATT_SUCCESS || rx == null || tx == null) { fail(l, "no_setup_service"); return }
      l.rx = rx
      gatt.setCharacteristicNotification(tx, true)
      val cccd = tx.getDescriptor(CCCD) ?: run { fail(l, "no_notify"); return }
      val value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
      val started = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        gatt.writeDescriptor(cccd, value) == BluetoothGatt.GATT_SUCCESS
      } else {
        @Suppress("DEPRECATION")
        cccd.value = value
        @Suppress("DEPRECATION")
        gatt.writeDescriptor(cccd)
      }
      if (!started) fail(l, "no_notify")
    }

    override fun onDescriptorWrite(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
      val promise = l.connecting ?: return
      if (status != BluetoothGatt.GATT_SUCCESS) { fail(l, "no_notify"); return }
      l.connecting = null
      // A write with response carries at most 512 bytes whatever the MTU.
      promise.resolve(Arguments.createMap().apply { putInt("writeSize", minOf(l.mtu - 3, 512)) })
    }

    override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
      val promise = l.writing ?: return
      l.writing = null
      if (status == BluetoothGatt.GATT_SUCCESS) promise.resolve(null) else promise.reject("pond_ble_write", "gatt_$status")
    }

    override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
      deliver(l, characteristic, value)
    }

    @Deprecated("Android 12 and older deliver notifications here")
    override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        @Suppress("DEPRECATION")
        deliver(l, characteristic, characteristic.value ?: ByteArray(0))
      }
    }
  }

  private fun deliver(l: Link, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
    if (l.closed || characteristic.uuid != l.txUuid) return
    emit("PondBleData", Arguments.createMap().apply {
      putString("id", l.address)
      putString("value", Base64.encodeToString(value, Base64.NO_WRAP))
    })
  }

  private fun fail(l: Link, reason: String) {
    l.connecting?.reject("pond_ble_connect", reason)
    l.connecting = null
    close(l, reason)
  }

  private fun close(l: Link, reason: String) {
    if (l.closed) return
    l.closed = true
    l.writing?.reject("pond_ble_closed", reason)
    l.writing = null
    try { l.gatt?.disconnect() } catch (_: Exception) {}
    try { l.gatt?.close() } catch (_: Exception) {}
    if (link === l) link = null
    emit("PondBleDisconnected", Arguments.createMap().apply {
      putString("id", l.address)
      putString("reason", reason)
    })
  }

  override fun invalidate() {
    stopScanning()
    link?.let { close(it, "invalidated") }
    stateReceiver?.let { try { context.unregisterReceiver(it) } catch (_: Exception) {} }
    stateReceiver = null
    super.invalidate()
  }

  companion object {
    private const val MTU = 517
    private const val CONNECT_TIMEOUT_MS = 15_000L
    private val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
  }
}

class PondBlePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(PondBleModule(reactContext))
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
