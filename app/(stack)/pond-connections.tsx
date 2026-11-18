import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import {
  InkBadge,
  InkButton,
  InkCard,
  InkEmptyState,
  InkEyebrow,
  InkInput,
  InkNotice,
  InkSheet,
  InkSpinner,
  InkSwitch,
  InkText,
  useInkTheme,
} from '@/components/ui/ink';

import { SettingsScroll } from '@/components/settings/settings-scroll';
import { GIcon } from '@/components/ui/g-icon';
import { Spacing } from '@/constants/spacing';
import { api } from '@/services/api-client';
import { selectionTick } from '@/services/haptics';
import { showSnackbar } from '@/services/snackbar';

interface WifiNet {
  ssid: string;
  signal: number | null;
  secured: boolean;
  saved: boolean;
  active: boolean;
}

interface BtDevice {
  address: string;
  name: string;
  device_type?: string | null;
  paired: boolean;
  connected: boolean;
}

export default function PondConnectionsScreen() {
  const theme = useInkTheme();
  const [loading, setLoading] = useState(true);
  const [scanningWifi, setScanningWifi] = useState(false);
  const [scanningBt, setScanningBt] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [wifiSsid, setWifiSsid] = useState<string | null>(null);
  const [wifiState, setWifiState] = useState<string>('unknown');
  const [networks, setNetworks] = useState<WifiNet[]>([]);

  const [btState, setBtState] = useState<string>('unknown');
  const [btPowered, setBtPowered] = useState<boolean>(true);
  const [btDiscoverable, setBtDiscoverable] = useState<boolean>(false);
  const [btDevices, setBtDevices] = useState<BtDevice[]>([]);

  const [joiningNet, setJoiningNet] = useState<WifiNet | null>(null);
  const [passphrase, setPassphrase] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [conn, bt] = await Promise.all([
        api.connections(),
        api.bluetoothDevices().catch(() => ({
          powered: undefined,
          discoverable: undefined,
          devices: [],
        })),
      ]);
      setWifiSsid(conn.wifi.ssid);
      setWifiState(conn.wifi.state);
      setBtState(conn.bluetooth.state);
      if (bt.powered !== undefined) setBtPowered(bt.powered);
      if (bt.discoverable !== undefined) setBtDiscoverable(bt.discoverable);
      setBtDevices(bt.devices);
    } catch {
      setError('Could not read Pond Wi-Fi and Bluetooth status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const scanWifi = async () => {
    setScanningWifi(true);
    setError(null);
    try {
      const res = await api.wifiNetworks();
      setNetworks(res.networks ?? []);
    } catch {
      setError('Could not scan Wi-Fi networks on the Pond.');
    } finally {
      setScanningWifi(false);
    }
  };

  const joinWifi = async (ssid: string, password?: string) => {
    setBusy(`wifi:${ssid}`);
    setError(null);
    try {
      await api.wifiJoin(ssid, password);
      showSnackbar({ message: `Connected Pond to ${ssid}`, tone: 'success' });
      setJoiningNet(null);
      setPassphrase('');
      await load();
    } catch {
      setError(`Could not join ${ssid}. Check the password and try again.`);
    } finally {
      setBusy(null);
    }
  };

  const forgetWifi = async (ssid: string) => {
    setBusy(`forget-wifi:${ssid}`);
    try {
      await api.wifiForget(ssid);
      showSnackbar({ message: `Forgot ${ssid}`, tone: 'success' });
      await scanWifi();
    } catch {
      setError(`Could not forget ${ssid}.`);
    } finally {
      setBusy(null);
    }
  };

  const scanBt = async () => {
    setScanningBt(true);
    setError(null);
    try {
      const res = await api.bluetoothScan();
      if (res.powered !== undefined) setBtPowered(res.powered);
      if (res.discoverable !== undefined) setBtDiscoverable(res.discoverable);
      setBtDevices(res.devices ?? []);
    } catch {
      setError('Could not scan Bluetooth devices on the Pond.');
    } finally {
      setScanningBt(false);
    }
  };

  const setBluetoothAdapter = async (patch: { powered?: boolean; discoverable?: boolean; pairable?: boolean }) => {
    setBusy('bt-power');
    setError(null);
    try {
      const res = await api.bluetoothPower(patch);
      setBtPowered(res.powered);
      setBtDiscoverable(res.discoverable);
      if (!res.powered) setBtDevices([]);
      else void api.bluetoothDevices().then((d) => setBtDevices(d.devices ?? [])).catch(() => {});
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not update Pond Bluetooth settings.');
    } finally {
      setBusy(null);
    }
  };

  const toggleBt = async (device: BtDevice) => {
    setBusy(`bt:${device.address}`);
    setError(null);
    try {
      if (device.connected) {
        await api.bluetoothDisconnect(device.address);
        showSnackbar({ message: `Disconnected ${device.name}`, tone: 'success' });
      } else {
        await api.bluetoothConnect(device.address);
        showSnackbar({ message: `Connected ${device.name}`, tone: 'success' });
      }
      const res = await api.bluetoothDevices();
      setBtDevices(res.devices ?? []);
    } catch {
      setError(`Could not ${device.connected ? 'disconnect' : 'connect'} ${device.name}.`);
    } finally {
      setBusy(null);
    }
  };

  const forgetBt = async (device: BtDevice) => {
    setBusy(`bt-del:${device.address}`);
    try {
      await api.bluetoothForget(device.address);
      setBtDevices((prev) => prev.filter((d) => d.address !== device.address));
      showSnackbar({ message: `Removed ${device.name}`, tone: 'success' });
    } catch {
      setError(`Could not remove ${device.name}.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <SettingsScroll refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}>
        <View style={styles.page}>
          {error ? <InkNotice tone="danger">{error}</InkNotice> : null}

          <InkCard contentStyle={styles.card}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitle}>
                <GIcon name="wifi" size={16} color={theme.color.accentLine} />
                <InkEyebrow>POND WI-FI</InkEyebrow>
              </View>
              <InkButton
                variant="primary"
                size="sm"
                loading={scanningWifi}
                onPress={() => {
                  void selectionTick();
                  void scanWifi();
                }}
              >
                Scan
              </InkButton>
            </View>

            <View style={[styles.row, styles.rowPad]}>
              <View style={styles.rowText}>
                <InkText weight="semibold">{wifiSsid ?? 'Not connected'}</InkText>
                <InkText size="sm" tone="secondary">
                  Status: {wifiState}
                </InkText>
              </View>
              {wifiSsid ? <InkBadge tone="success">Connected</InkBadge> : <InkBadge tone="neutral">Offline</InkBadge>}
            </View>

            {scanningWifi ? (
              <View style={styles.spinnerRow}>
                <InkSpinner label="Scanning Wi-Fi networks..." />
              </View>
            ) : null}

            {networks.map((net) => (
              <View
                key={net.ssid}
                style={[styles.row, styles.divided, { borderTopColor: theme.color.chrome }]}
              >
                <View style={styles.rowText}>
                  <InkText weight="semibold" numberOfLines={1}>
                    {net.ssid}
                  </InkText>
                  <InkText size="sm" tone="secondary">
                    {[
                      net.active ? 'Connected' : null,
                      net.secured ? 'Secured' : 'Open',
                      net.signal !== null ? `${net.signal}%` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </InkText>
                </View>
                <View style={styles.actions}>
                  {!net.active ? (
                    <InkButton
                      variant="primary"
                      size="sm"
                      loading={busy === `wifi:${net.ssid}`}
                      onPress={() => {
                        void selectionTick();
                        if (net.secured && !net.saved) {
                          setJoiningNet(net);
                          setPassphrase('');
                        } else {
                          void joinWifi(net.ssid);
                        }
                      }}
                    >
                      Join
                    </InkButton>
                  ) : null}
                  {net.saved && !net.active ? (
                    <InkButton
                      variant="quiet"
                      size="sm"
                      loading={busy === `forget-wifi:${net.ssid}`}
                      onPress={() => {
                        void selectionTick();
                        void forgetWifi(net.ssid);
                      }}
                    >
                      Forget
                    </InkButton>
                  ) : null}
                </View>
              </View>
            ))}
          </InkCard>

          <InkCard contentStyle={styles.card}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitle}>
                <GIcon name="link" size={16} color={theme.color.accentLine} />
                <InkEyebrow>BLUETOOTH & ACCESSORIES</InkEyebrow>
              </View>
              <InkButton
                variant="primary"
                size="sm"
                loading={scanningBt}
                disabled={!btPowered}
                onPress={() => {
                  void selectionTick();
                  void scanBt();
                }}
              >
                Scan
              </InkButton>
            </View>

            <View style={styles.row}>
              <View style={styles.rowText}>
                <InkText weight="semibold">Bluetooth Power</InkText>
                <InkText size="sm" tone="secondary">
                  Adapter: {btPowered ? btState : 'off'}
                </InkText>
              </View>
              <InkSwitch
                checked={btPowered}
                disabled={busy === 'bt-power'}
                onChange={(next) => {
                  void selectionTick();
                  void setBluetoothAdapter({ powered: next, pairable: next });
                }}
                label="Bluetooth Power"
              />
            </View>

            {btPowered ? (
              <View style={[styles.row, styles.divided, { borderTopColor: theme.color.chrome }]}>
                <View style={styles.rowText}>
                  <InkText weight="semibold">Discoverable</InkText>
                  <InkText size="sm" tone="secondary">
                    Allow nearby accessories to find this Pond
                  </InkText>
                </View>
                <InkSwitch
                  checked={btDiscoverable}
                  disabled={busy === 'bt-power'}
                  onChange={(next) => {
                    void selectionTick();
                    void setBluetoothAdapter({ discoverable: next });
                  }}
                  label="Discoverable"
                />
              </View>
            ) : null}

            {scanningBt ? (
              <View style={[styles.spinnerRow, styles.divided, { borderTopColor: theme.color.chrome }]}>
                <InkSpinner label="Scanning for nearby Bluetooth devices..." />
              </View>
            ) : null}

            {btDevices.length === 0 && !scanningBt ? (
              <View style={[styles.divided, { borderTopColor: theme.color.chrome }]}>
                <InkEmptyState icon="link" title="No Bluetooth devices">
                  <InkText size="sm" tone="secondary">
                    {btPowered
                      ? 'Tap Scan to discover nearby speakers, keyboards, and sensors.'
                      : 'Turn on Bluetooth to scan and pair accessories.'}
                  </InkText>
                </InkEmptyState>
              </View>
            ) : null}

            {btDevices.map((dev) => (
              <View
                key={dev.address}
                style={[styles.row, styles.divided, { borderTopColor: theme.color.chrome }]}
              >
                <View style={styles.rowText}>
                  <View style={styles.deviceHead}>
                    <InkText weight="semibold" numberOfLines={1} style={styles.deviceName}>
                      {dev.name || `Unnamed ${dev.device_type || 'Accessory'}`}
                    </InkText>
                    <InkBadge tone={dev.connected ? 'success' : dev.paired ? 'info' : 'neutral'}>
                      {dev.device_type || 'Accessory'}
                    </InkBadge>
                  </View>
                  <InkText size="xs" tone="secondary">
                    {[dev.connected ? 'Connected' : dev.paired ? 'Paired' : 'Available', dev.address].join(' · ')}
                  </InkText>
                </View>
                <View style={styles.actions}>
                  <InkButton
                    variant={dev.connected ? 'quiet' : 'primary'}
                    size="sm"
                    loading={busy === `bt:${dev.address}`}
                    onPress={() => {
                      void selectionTick();
                      void toggleBt(dev);
                    }}
                  >
                    {dev.connected ? 'Disconnect' : dev.paired ? 'Connect' : 'Pair'}
                  </InkButton>
                  {dev.paired ? (
                    <InkButton
                      variant="quiet"
                      size="sm"
                      loading={busy === `bt-del:${dev.address}`}
                      onPress={() => {
                        void selectionTick();
                        void forgetBt(dev);
                      }}
                    >
                      Forget
                    </InkButton>
                  ) : null}
                </View>
              </View>
            ))}
          </InkCard>

          <InkText size="xs" tone="secondary" style={styles.footerNote}>
            Connect speakers, keyboards, sensors, and other Bluetooth accessories to your Pond.
          </InkText>
        </View>
      </SettingsScroll>

      <InkSheet open={joiningNet !== null} onClose={() => setJoiningNet(null)} title={joiningNet?.ssid ?? 'Join Wi-Fi'} scroll>
        <View style={styles.sheet}>
          <InkCard>
            <InkText size="sm" tone="secondary">
              Enter the Wi-Fi password for {joiningNet?.ssid}.
            </InkText>
          </InkCard>
          <InkInput
            label="Password"
            value={passphrase}
            onChange={setPassphrase}
            placeholder="Wi-Fi password"
          />
          <InkButton
            variant="primary"
            block
            loading={joiningNet !== null && busy === `wifi:${joiningNet.ssid}`}
            disabled={!passphrase.trim() || busy !== null}
            onPress={() => joiningNet && void joinWifi(joiningNet.ssid, passphrase)}
          >
            Connect
          </InkButton>
        </View>
      </InkSheet>
    </>
  );
}

const styles = StyleSheet.create({
  page: { gap: Spacing.md, paddingBottom: Spacing['2xl'] },
  card: { padding: Spacing.md, gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  rowPad: { paddingVertical: 4 },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.sm },
  rowText: { flex: 1, gap: 2 },
  deviceHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap' },
  deviceName: { flexShrink: 1 },
  spinnerRow: { paddingVertical: Spacing.sm },
  actions: { flexDirection: 'row', gap: Spacing.xs, alignItems: 'center' },
  footerNote: { paddingHorizontal: Spacing.xs },
  sheet: { gap: Spacing.md, paddingBottom: Spacing.xl },
});
