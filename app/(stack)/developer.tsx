/**
 * DeveloperScreen — dev-only mock/real backend toggle (issue #21).
 *
 * Lets each migratable screen be flipped between its mock data and the real
 * PondApiClient independently, so backend-wiring work (#9–#15) can land and
 * be tested screen by screen against a live Pond server instead of one
 * coordinated cutover.
 */

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Redirect, useRouter } from 'expo-router';

import { InkSwitch } from '@jarida/ink/native';

import { useTranslation } from 'react-i18next';
import { GIcon } from '@/components/ui/g-icon';
import { ServerStatus } from '@/components/patterns/server-status';
import { useServer, MIGRATION_SCREENS, type MigrationScreen } from '@/providers/server-provider';
import { Grey, JaridaPurple, Brand, Semantic } from '@/constants/colors';
import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';
import { Shadows } from '@/constants/shadows';

const SCREEN_LABELS: Record<MigrationScreen, string> = {
  chat: 'Chat',
  voice: 'Voice / Listening Overlay',
  memory: 'Memories',
  integrations: 'App Integrations & MCP Servers',
  schedule: 'Schedule',
  logs: 'Activity Logs',
};

export default function DeveloperScreen() {
  // Not linked from the You-tab menu in production (see constants/navigation.ts),
  // but the route itself still exists — refuse to render it outside dev builds
  // too, so a direct link/deep link can't reach it either. Kept in a separate
  // component (rather than an early return here) so the hooks below always
  // run in a consistent order for whichever component actually renders.
  if (!__DEV__) {
    return <Redirect href="/(tabs)" />;
  }
  return <DeveloperScreenContent />;
}

function DeveloperScreenContent() {
  const { serverUrl, online, checkHealth, isScreenReal, setScreenMode } = useServer();
  const [checking, setChecking] = useState(false);
  const { t } = useTranslation();
  const router = useRouter();
  const handleTestConnection = useCallback(async () => {
    setChecking(true);
    try { await checkHealth(); } finally { setChecking(false); }
  }, [checkHealth]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Server connection</Text>
      <View style={styles.card}>
        <Text style={styles.screenLabel}>{serverUrl || t('connection.unpaired')}</Text>
        <Pressable onPress={() => router.push('/(stack)/pond-pairing')}>
          <Text style={styles.sectionHint}>{t('connection.changePond')}</Text>
        </Pressable>
        <View style={styles.connectionRow}>
          <ServerStatus online={online} />
          <Pressable style={styles.testButton} onPress={handleTestConnection} disabled={checking}>
            <GIcon name="refresh" size={14} color={Brand.white} />
            <Text style={styles.testButtonText}>{checking ? 'Checking…' : 'Test connection'}</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Per-screen backend mode</Text>
      <Text style={styles.sectionHint}>
        Flip a screen to “Real” once its backend wiring lands (#9–#15). Mock and real
        code paths coexist — nothing needs to be deleted to test either one.
      </Text>
      <View style={styles.card}>
        {MIGRATION_SCREENS.map((screen, i) => (
          <View
            key={screen}
            style={[styles.screenRow, i < MIGRATION_SCREENS.length - 1 && styles.screenRowDivider]}
          >
            <View style={styles.screenRowLeft}>
              <Text style={styles.screenLabel}>{SCREEN_LABELS[screen]}</Text>
              <Text style={styles.screenModeText}>
                {isScreenReal(screen) ? 'Real backend' : 'Mock data'}
              </Text>
            </View>
            <InkSwitch
              checked={isScreenReal(screen)}
              onChange={(value) => setScreenMode(screen, value)}
            />
          </View>
        ))}
      </View>

      <View style={styles.warningBanner}>
        <GIcon name="warn" size={16} color={Semantic.warning} />
        <Text style={styles.warningText}>
          This screen is dev-only. It isn’t linked from Settings in production builds.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Grey[50] },
  content: { padding: Spacing.lg, paddingBottom: Spacing['3xl'] },

  sectionTitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Grey[500],
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },
  sectionHint: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[500],
    marginBottom: Spacing.md,
    marginTop: -Spacing.xs,
    lineHeight: FontSize.sm * 1.5,
  },

  card: {
    backgroundColor: Brand.white,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Grey[200],
    padding: Spacing.md,
    ...Shadows.sm,
  },

  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: JaridaPurple[500],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.md,
  },
  testButtonText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Brand.white,
  },

  screenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  screenRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Grey[100],
  },
  screenRowLeft: { flex: 1, marginRight: Spacing.md },
  screenLabel: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
    color: Brand.charcoal,
  },
  screenModeText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Grey[500],
    marginTop: 2,
  },

  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Semantic.warningSoft,
    borderRadius: Radii.md,
    padding: Spacing.md,
    marginTop: Spacing.xl,
  },
  warningText: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Grey[700],
    lineHeight: FontSize.xs * 1.5,
  },
});
