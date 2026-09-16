/**
 * ConnectDesktopScreen — scans the pairing QR code shown on Goose In A Pond
 * desktop and links this device to it.
 */

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';

import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';

import { GIcon } from '@/components/ui/g-icon';
import { GButton } from '@/components/ui/g-button';
import { useServer } from '@/providers/server-provider';
import { useHaptics } from '@/hooks/use-haptics';
import { Storage } from '@/services/storage';
import { pairDevice } from '@/services/handshake';
import { parsePairingPayload } from '@/models/pairing';
import { Brand, Grey, JaridaPurple, Semantic } from '@/constants/colors';
import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';

type ScanState = 'scanning' | 'connecting' | 'success' | 'error';

/** Stable per-install client ID, created on first pairing. */
async function getClientId(): Promise<string> {
  const existing = await Storage.get('clientId');
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await Storage.set('clientId', id);
  return id;
}

export default function ConnectDesktopScreen() {
  const router = useRouter();
  const haptics = useHaptics();
  const server = useServer();
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<ScanState>('scanning');
  const [message, setMessage] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);

  const reset = useCallback(() => {
    setState('scanning');
    setMessage(null);
  }, []);

  const handleScanned = useCallback(
    async ({ data }: BarcodeScanningResult) => {
      if (state !== 'scanning') return;
      setState('connecting');

      try {
        const payload = parsePairingPayload(data);
        const result = await pairDevice(payload, {
          clientId: await getClientId(),
          clientVersion: Constants.expoConfig?.version ?? '0.0.0',
          deviceName: Constants.deviceName ?? null,
        });

        server.setServerUrl(payload.serverUrl);
        server.setToken(result.sessionToken);
        server.setOnline(true);
        await Storage.set('serverUrl', payload.serverUrl);
        await Storage.set('token', result.sessionToken);
        if (result.refreshToken) {
          await Storage.set('refreshToken', result.refreshToken);
        }

        setDeviceName(result.hostname);
        setState('success');
        haptics.success();
      } catch (err) {
        setMessage(
          err instanceof Error ? err.message : 'Something went wrong while connecting.',
        );
        setState('error');
        haptics.error();
      }
    },
    [state, server, haptics],
  );

  const handleDone = useCallback(() => {
    router.back();
  }, [router]);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <GIcon name="camera" size={32} color={JaridaPurple[500]} />
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionDesc}>
          Goose On The Go needs your camera to scan the pairing code shown on
          Goose In A Pond desktop.
        </Text>
        <GButton variant="primary" size="lg" onPress={requestPermission}>
          {permission.canAskAgain ? 'Enable Camera' : 'Open Settings'}
        </GButton>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={state === 'scanning' ? handleScanned : undefined}
      />

      <View style={styles.overlay} pointerEvents="box-none">
        {state === 'scanning' && (
          <>
            <View style={styles.frame}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <Text style={styles.hint}>
              Point your camera at the QR code on Goose In A Pond desktop
            </Text>
          </>
        )}

        {state === 'connecting' && (
          <View style={styles.statusCard}>
            <ActivityIndicator color={JaridaPurple[500]} />
            <Text style={styles.statusTitle}>Connecting…</Text>
          </View>
        )}

        {state === 'success' && (
          <View style={styles.statusCard}>
            <GIcon name="check" size={28} color={Semantic.success} />
            <Text style={styles.statusTitle}>Connected</Text>
            <Text style={styles.statusDesc}>
              {deviceName ? `Linked to ${deviceName}.` : 'Your desktop is now linked.'}
            </Text>
            <GButton variant="primary" size="lg" onPress={handleDone}>
              Done
            </GButton>
          </View>
        )}

        {state === 'error' && (
          <View style={styles.statusCard}>
            <GIcon name="warn" size={28} color={Semantic.danger} />
            <Text style={styles.statusTitle}>Couldn’t connect</Text>
            <Text style={styles.statusDesc}>{message}</Text>
            <GButton variant="primary" size="lg" onPress={reset}>
              Try Again
            </GButton>
            <Pressable onPress={handleDone}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const FRAME_SIZE = 240;
const CORNER_SIZE = 28;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Brand.charcoal },

  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2xl'],
    paddingHorizontal: Spacing.xl,
  },

  frame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: JaridaPurple[400],
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: Radii.md },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: Radii.md },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: Radii.md },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: Radii.md },

  hint: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Brand.white,
    textAlign: 'center',
  },

  statusCard: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Brand.white,
    borderRadius: Radii.xl,
    paddingVertical: Spacing['2xl'],
    paddingHorizontal: Spacing.xl,
  },
  statusTitle: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Brand.charcoal,
  },
  statusDesc: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Grey[600],
    textAlign: 'center',
  },
  cancelText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Grey[500],
  },

  /* Permission request */
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing['2xl'],
    backgroundColor: Grey[50],
  },
  permissionTitle: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Brand.charcoal,
    textAlign: 'center',
  },
  permissionDesc: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Grey[500],
    textAlign: 'center',
    lineHeight: FontSize.base * 1.5,
  },
});
