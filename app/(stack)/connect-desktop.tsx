/**
 * ConnectDesktopScreen — the viewfinder, for both QR codes the app reads.
 *
 * `?mode=matter` scans a Matter device's setup code for the commissioning
 * screen; without it, the pairing QR shown on the Pond's dashboard or the QR on
 * a Pond's printed setup card, for the pairing wizard. One screen rather than two because everything around the
 * decode is the same problem: camera permission with its no-second-prompt case,
 * the hold-to-confirm rule, and a viewfinder that owns the whole screen.
 *
 * This screen only decodes. It performs no networking and never holds a token:
 * what it reads is handed to the screen that asked for it, which runs the same
 * path as manual entry -- so there is one crypto path and one token store
 * rather than two, and one commissioning call rather than two.
 *
 * Both codes are credentials. Neither is ever logged, and the scanner's own
 * error copy never echoes one back.
 */

import { useTranslation } from 'react-i18next';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking, StyleSheet, Text, View } from 'react-native';
import { InkButton } from '@/components/ui/ink';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';

import { GIcon } from '@/components/ui/g-icon';
import { AccentIcon } from '@/components/ui/accent-icon';
import { GPressable } from '@/components/ui/g-pressable';
import {
  InvalidPairingCodeError,
  isPairingPayload,
  looksLikeMatterSetupCode,
  parsePairingPayload,
  type PairingPayload,
} from '@/models/pairing';
import {
  InvalidSetupCardError,
  isSetupCardLink,
  parseSetupCard,
  type SetupCard,
} from '@/models/setup-card';
import { offerPairingPayload, offerSetupCard, offerSetupCode } from '@/services/pairing-handoff';
import { advanceHold, HOLD_STEADY_MS, LOST_AFTER_MS, type Hold } from '@/models/scan-hold';
import { Brand } from '@/constants/colors';
import { FontSize, face } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useTheme } from '@/providers/theme-provider';
import type { ThemeColors } from '@/constants/colors';

const FRAME_SIZE = 240;
const CORNER_SIZE = 28;

/**
 * The hold rule itself lives in `models/scan-hold.ts` and is unit tested there:
 * a rule embedded in a camera callback can only be exercised by pointing a real
 * phone at a real QR, which is how a hold that did not hold reached a device.
 */

export default function ConnectDesktopScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const matter = mode === 'matter';
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);

  /**
   * The camera keeps firing while a frame is in view, so scanning is disabled
   * the moment a code decodes. Without that, one QR in front of the lens hands
   * the wizard the same payload dozens of times.
   */
  const [scanning, setScanning] = useState(true);
  /** True while a valid code is being held in frame, before it is accepted. */
  const [holding, setHolding] = useState(false);

  // Which code is being held, and since when. A ref rather than state: it
  // changes on every camera frame and none of it belongs in a render.
  const held = useRef<Hold | null>(null);
  const lostTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [progress] = useState(() => new Animated.Value(0));

  const abandonHold = useCallback(() => {
    held.current = null;
    setHolding(false);
    progress.stopAnimation();
    progress.setValue(0);
  }, [progress]);

  useEffect(() => () => {
    if (lostTimer.current) clearTimeout(lostTimer.current);
  }, []);

  const handleScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (!scanning) return;

      // Judged immediately rather than after the hold: a QR that is the wrong
      // kind will never become the right one by being held longer, and each
      // wrong kind is worth naming at once.
      const reject = (message: string) => {
        setScanning(false);
        abandonHold();
        setError(message);
      };

      let payload: PairingPayload | null = null;
      let card: SetupCard | null = null;
      if (matter) {
        if (!looksLikeMatterSetupCode(data)) {
          // The mirror of the message below. Somebody who opened this from Add
          // device and pointed it at the Pond's own dashboard is holding a code
          // that is valid, just for the other flow.
          if (isSetupCardLink(data)) return reject(t('commission.isPondSetupCard'));
          return reject(
            t(isPairingPayload(data) ? 'commission.isPondCode' : 'commission.notSetupCode'),
          );
        }
      } else if (isSetupCardLink(data)) {
        try {
          card = parseSetupCard(data);
        } catch (e) {
          // A card printed for a later app scans as a card, so it is the app that needs updating.
          const newer = e instanceof InvalidSetupCardError && e.problem === 'unsupported_version';
          return reject(t(newer ? 'scanErrors.setupCardNewer' : 'scanErrors.setupCardUnreadable'));
        }
      } else {
        try {
          payload = parsePairingPayload(data);
        } catch (e) {
          if (!(e instanceof InvalidPairingCodeError)) {
            return reject(t('pairing.codeUnreadable'));
          }
          // Name the mistake rather than just rejecting it: a Matter device's
          // code is valid, only in a different part of the app, and sending the
          // user back to hunt for "the right QR" is the unhelpful outcome here.
          return reject(
            looksLikeMatterSetupCode(data)
              ? t('scanErrors.matterCode')
              : t('scanErrors.notPondCode'),
          );
        }
      }

      const now = Date.now();
      const step = advanceHold(held.current, data, now);
      const restarted = step.hold.since !== held.current?.since;
      held.current = step.hold;

      if (restarted) {
        setHolding(true);
        progress.setValue(0);
        Animated.timing(progress, {
          toValue: 1,
          duration: HOLD_STEADY_MS,
          easing: Easing.linear,
          useNativeDriver: false,
        }).start();
      }

      // The rule notices a code leaving the frame from the gap between frames,
      // but nothing arrives once it is gone — so a timer is still what clears
      // the indicator rather than leaving it filling against a blank view.
      if (lostTimer.current) clearTimeout(lostTimer.current);
      lostTimer.current = setTimeout(abandonHold, LOST_AFTER_MS);

      if (!step.accept) return;

      if (lostTimer.current) clearTimeout(lostTimer.current);
      setScanning(false);
      abandonHold();
      if (card) offerSetupCard(card);
      else if (payload) offerPairingPayload(payload);
      else offerSetupCode(data.trim());
      router.back();
    },
    [router, scanning, abandonHold, progress, matter, t],
  );

  const retry = useCallback(() => {
    setError(null);
    abandonHold();
    setScanning(true);
  }, [abandonHold]);

  // Permission not yet determined — the hook answers on the next render.
  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    // Once `canAskAgain` is false the OS will not show the prompt again, so the
    // only route back is the Settings app. Calling requestPermission there does
    // nothing at all, which leaves a user who denied once with no way forward.
    const canPrompt = permission.canAskAgain;
    return (
      <View style={styles.permissionContainer}>
        <AccentIcon name="camera" size={32} />
        <Text style={styles.permissionTitle}>{t('desktop.cameraNeeded')}</Text>
        <Text style={styles.permissionDesc}>
          {matter ? t('commission.camera') : t('pairing.cameraDesc')}
        </Text>
        <InkButton
          variant="primary"
          onPress={canPrompt ? requestPermission : () => void Linking.openSettings()}
        >
          {canPrompt ? t('pairing.enableCamera') : t('pairing.openSettings')}
        </InkButton>
        <GPressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.cancel}>
            {matter ? t('commission.type') : t('desktop.enterCode')}
          </Text>
        </GPressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanning ? handleScanned : undefined}
      />
      {/* The screen owns its dismiss control now that it draws full bleed, and
          it sits below the status bar rather than under it. */}
      <GPressable
        accessibilityRole="button"
        accessibilityLabel={t('pairing.closeScanner')}
        onPress={() => router.back()}
        hitSlop={12}
        style={[styles.close, { top: insets.top + Spacing.sm }]}
      >
        {/* Sits on a semi-black overlay over the live camera feed, so the icon is
            white in either scheme rather than the theme's foreground. */}
        <GIcon name="arrow" size={22} color={Brand.white} />
      </GPressable>

      <View style={styles.overlay}>
        <View style={styles.frame}>
          <View style={[styles.corner, styles.cornerTL, holding && styles.cornerHolding]} />
          <View style={[styles.corner, styles.cornerTR, holding && styles.cornerHolding]} />
          <View style={[styles.corner, styles.cornerBL, holding && styles.cornerHolding]} />
          <View style={[styles.corner, styles.cornerBR, holding && styles.cornerHolding]} />
        </View>

        {/* The hold made visible, so waiting reads as progress, not as a stall. */}
        {holding && !error ? (
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        ) : null}

        {error ? (
          <View style={styles.statusCard}>
            <GIcon name="warn" size={28} color={colors.danger} />
            <Text style={styles.statusTitle}>{t('desktop.badCode')}</Text>
            <Text style={styles.statusDesc}>{error}</Text>
            <InkButton variant="primary" onPress={retry}>
              {t('common.scanAgain')}
            </InkButton>
          </View>
        ) : (
          <Text style={styles.hint}>
            {holding
              ? t('pairing.holdSteady')
              : matter
                ? t('commission.aim')
                : t('pairing.aimAtPond')}
          </Text>
        )}

        <GPressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.cancel}>
            {matter ? t('commission.type') : t('desktop.enterCode')}
          </Text>
        </GPressable>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: Brand.charcoal },
  close: {
    position: 'absolute',
    left: Spacing.md,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    // Legible over whatever the camera happens to be pointed at.
    backgroundColor: 'rgba(0,0,0,0.45)',
    // The registry's arrow points right; this is the only place that needs it
    // pointing back, which is not worth a second path in the icon set.
    transform: [{ rotate: '180deg' }],
  },

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
  progressTrack: {
    width: FRAME_SIZE,
    height: 3,
    marginTop: Spacing.md,
    borderRadius: Radii.sm,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: c.success,
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: c.borderBrand,
  },
  // Brightens the moment a valid code is held, so the frame itself confirms the
  // aim before any text does.
  cornerHolding: { borderColor: c.success },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: Radii.md },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: Radii.md },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: Radii.md },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: Radii.md },

  hint: {
    ...face('body', 'semibold'),
    fontSize: FontSize.base,
    color: Brand.white,
    textAlign: 'center',
  },
  cancel: {
    ...face('body', 'semibold'),
    fontSize: FontSize.base,
    color: Brand.white,
    textDecorationLine: 'underline',
  },

  statusCard: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: c.card,
    borderRadius: Radii.xl,
    paddingVertical: Spacing['2xl'],
    paddingHorizontal: Spacing.xl,
  },
  statusTitle: {
    ...face('display', 'bold'),
    fontSize: FontSize.lg,
    color: c.text,
  },
  statusDesc: {
    ...face('body', 'regular'),
    fontSize: FontSize.base,
    color: c.textSecondary,
    textAlign: 'center',
  },
  cancelText: {
    ...face('body', 'semibold'),
    fontSize: FontSize.sm,
    color: c.textTertiary,
  },

  /* Permission request */
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing['2xl'],
    backgroundColor: c.background,
  },
  permissionTitle: {
    ...face('display', 'bold'),
    fontSize: FontSize.xl,
    color: c.text,
    textAlign: 'center',
  },
  permissionDesc: {
    ...face('body', 'regular'),
    fontSize: FontSize.base,
    color: c.textTertiary,
    textAlign: 'center',
    lineHeight: FontSize.base * 1.5,
  },
});
