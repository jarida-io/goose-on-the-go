import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { InkButton, InkNotice, InkSheet, InkSpinner, InkText, InkTitle, inkText, useInkTheme } from '@/components/ui/ink';

import { PasscodePad } from '@/components/setup/passcode-pad';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import { usePairingLock } from '@/view-models/use-pairing-lock';
import { useRemoteAccess } from '@/view-models/use-remote-access';
import type { RemoteProgress } from '@/services/remote-access';

/**
 * One literal key per step, so services/__tests__/i18n.test.ts can see them.
 *
 * Assembling the key from the step reads better and hides a failure: a deleted
 * key leaves the test green and renders "remote.enrolling" to somebody watching
 * a setup they cannot otherwise observe. The switch is exhaustive, so a new step
 * fails the typecheck here rather than at runtime.
 */
function progressLabel(t: TFunction, progress: RemoteProgress): string {
  switch (progress) {
    case 'approval': return t('remote.approval');
    case 'review': return t('remote.review');
    case 'enrolling': return t('remote.enrolling');
    case 'connecting': return t('remote.connecting');
    case 'enabled': return t('remote.enabled');
  }
}

export default function RemoteAccessScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const theme = useInkTheme();
  const router = useRouter();
  const { setupUnavailable, progress, error, busy, enable, recover, reviewId, reviewKey, localOnly, lapse, backgroundPaused } = useRemoteAccess();
  const pairingLock = usePairingLock();
  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const [passcode, setPasscode] = useState('');
  const lock = pairingLock.data.lock;
  // Selectable, because the reader types these into the Pond to approve it.
  const code = inkText(theme, { role: 'mono', size: 'md', weight: theme.weight.semibold }).style;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <InkTitle level={2}>{t('remote.title')}</InkTitle>
        <InkText tone="secondary">{t('remote.description')}</InkText>
        {progress && !error ? (
          <View accessibilityLiveRegion="polite" style={styles.progress}>
            {busy ? <InkSpinner label={progressLabel(t, progress)} /> : null}
            <InkText weight="semibold">{progressLabel(t, progress)}</InkText>
          </View>
        ) : null}
        {reviewId && busy ? <Text selectable style={code}>{t('remote.reviewCode', { id: reviewId })}</Text> : null}
        {reviewKey && busy ? <Text selectable style={code}>{t('remote.reviewKey', { key: reviewKey })}</Text> : null}
        {progress === 'enabled' && backgroundPaused ? (
          <InkNotice tone="warning">{t('remote.backgroundPaused')}</InkNotice>
        ) : null}
        {lapse ? <InkNotice tone="warning">{lapse}</InkNotice> : null}
        {error ? <InkNotice tone="danger">{error}</InkNotice> : null}
      </ScrollView>
      <View style={styles.foot}>
        {progress !== 'enabled' ? (
          <InkButton variant="primary" block loading={busy} onPress={enable}>
            {t('remote.enable')}
          </InkButton>
        ) : null}
        {error && !setupUnavailable && progress !== 'enabled' ? (
          <InkButton
            block
            disabled={busy}
            onPress={() => {
              if (lock?.hasRecoveryPin) {
                setPasscode('');
                setPasscodeOpen(true);
              } else {
                void recover();
              }
            }}
          >
            {t('remote.recover')}
          </InkButton>
        ) : null}
        <InkButton
          variant="quiet"
          block
          onPress={() => router.push('/(stack)/ngrok-tunnel')}
        >
          Ngrok Tunnel
        </InkButton>
        <InkButton
          variant={progress === 'enabled' ? 'primary' : 'quiet'}
          block
          onPress={async () => {
            if (progress === 'enabled' || (await localOnly())) router.replace('/(tabs)');
          }}
        >
          {t(progress === 'enabled' ? 'remote.done' : 'remote.localOnly')}
        </InkButton>
      </View>
      <InkSheet open={passcodeOpen} onClose={() => setPasscodeOpen(false)} title="Security Passcode" scroll>
        <PasscodePad
          title="Enter Passcode"
          subtitle="Verify your Security passcode to recover remote access"
          length={lock?.minPinDigits ?? 4}
          value={passcode}
          busy={busy}
          onChange={setPasscode}
          onSubmit={(code) => {
            setPasscodeOpen(false);
            setPasscode('');
            void recover(code);
          }}
        />
      </InkSheet>
    </SafeAreaView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing['2xl'], gap: Spacing.lg },
    progress: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    foot: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm },
  });
