/**
 * DeveloperScreen — dev-only mock/real backend toggle (issue #21).
 *
 * Lets each migratable screen be flipped between its mock data and the real
 * PondApiClient independently, so backend-wiring work (#9–#15) can land and
 * be tested screen by screen against a live Pond server instead of one
 * coordinated cutover.
 */

import { useTranslation } from 'react-i18next';
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Redirect, useRouter } from 'expo-router';

import { InkSwitch, InkNotice } from '@/components/ui/ink';

import { GIcon } from '@/components/ui/g-icon';
import { AccentIcon } from '@/components/ui/accent-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { ServerStatus } from '@/components/patterns/server-status';
import { useServer, MIGRATION_SCREENS, type MigrationScreen } from '@/providers/server-provider';
import { Brand } from '@/constants/colors';
import { FontSize, face } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';
import { Shadows } from '@/constants/shadows';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/colors';
import type { TranslationKey } from '@/services/i18n';

const SCREEN_LABELS: Record<MigrationScreen, TranslationKey> = {
  chat: 'dev.screens.chat',
  memory: 'dev.screens.memory',
  schedule: 'dev.screens.schedule',
  logs: 'dev.screens.logs',
  webSearch: 'dev.screens.webSearch',
  settings: 'dev.screens.settings',
  agents: 'dev.screens.agents',
  pond: 'dev.screens.pond',
  voice: 'dev.screens.voice',
  myGoose: 'dev.screens.myGoose',
};

export default function DeveloperScreen() {
  return <DeveloperScreenContent />;
}

const DEV_TOOLS = [
  { label: 'Advanced Settings', route: '/(stack)/settings-advanced' },
  { label: 'Tools & Extensions', route: '/(stack)/settings-tools' },
  { label: 'Memory Tuning', route: '/(stack)/settings-memory-tuning' },
  { label: 'Prompt Templates', route: '/(stack)/settings-prompt-templates' },
  { label: 'Ngrok Tunnel', route: '/(stack)/ngrok-tunnel' },
  { label: 'Logs', route: '/(stack)/logs' },
  { label: 'Pond Caches', route: '/(stack)/pond-caches' },
  { label: 'Pond Reliability', route: '/(stack)/pond-reliability' },
  { label: 'Sessions', route: '/(stack)/sessions' },
  { label: 'Schedule', route: '/(stack)/schedule' },
  { label: 'Saved Items', route: '/(stack)/saved' },
] as const;

function DeveloperScreenContent() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const { serverUrl, online, checkHealth, isScreenReal, setScreenMode } = useServer();
  const [checking, setChecking] = useState(false);

  // The address is whatever pairing stored; it is changed by pairing again,
  // not typed here. The probe re-selects an endpoint and reports the result.
  const handleTestConnection = useCallback(async () => {
    setChecking(true);
    try { await checkHealth(); } finally { setChecking(false); }
  }, [checkHealth]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>{t('dev.connection')}</Text>
      <View style={styles.card}>
        <Text style={styles.screenLabel}>{serverUrl || t('connection.unpaired')}</Text>
        <GPressable onPress={() => router.push('/(stack)/pond-pairing')} hitSlop={8}>
          <Text style={styles.changeLink}>{t('connection.changePond')}</Text>
        </GPressable>
        <View style={styles.connectionRow}>
          <ServerStatus online={online} />
          <GPressable
            feedback="lift"
            style={styles.testButton}
            onPress={handleTestConnection}
            disabled={checking}
          >
            <GIcon name="refresh" size={14} color={Brand.white} />
            <Text style={styles.testButtonText}>
              {checking ? t('developer.checking') : t('developer.testConnection')}
            </Text>
          </GPressable>
        </View>
      </View>

      <GPressable style={[styles.card, styles.debugLink]} onPress={() => router.push('/(stack)/debug')}>
        <View style={styles.screenRowLeft}>
          <Text style={styles.screenLabel}>{t('developer.openDebug')}</Text>
          <Text style={styles.screenModeText}>{t('developer.openDebugHint')}</Text>
        </View>
        <AccentIcon name="chevron-right" size={16} />
      </GPressable>

      <Text style={styles.sectionTitle}>Advanced & Diagnostics</Text>
      <View style={styles.card}>
        {DEV_TOOLS.map((tool, i) => (
          <GPressable
            key={tool.route}
            style={[styles.screenRow, i < DEV_TOOLS.length - 1 && styles.screenRowDivider]}
            onPress={() => router.push(tool.route as never)}
          >
            <Text style={styles.screenLabel}>{tool.label}</Text>
            <AccentIcon name="chevron-right" size={16} />
          </GPressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>{t('dev.screenMode')}</Text>
      <Text style={styles.sectionHint}>{t('developer.backendHint')}</Text>
      <View style={styles.card}>
        {MIGRATION_SCREENS.map((screen, i) => (
          <View
            key={screen}
            style={[styles.screenRow, i < MIGRATION_SCREENS.length - 1 && styles.screenRowDivider]}
          >
            <View style={styles.screenRowLeft}>
              <Text style={styles.screenLabel}>{t(SCREEN_LABELS[screen])}</Text>
              <Text style={styles.screenModeText}>
                {isScreenReal(screen) ? t('developer.realBackend') : t('developer.mockData')}
              </Text>
            </View>
            <InkSwitch
              checked={isScreenReal(screen)}
              onChange={(value) => setScreenMode(screen, value)}
            />
          </View>
        ))}
      </View>

      <View style={styles.notice}>
        <InkNotice tone="warning">{t('dev.devOnly')}</InkNotice>
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: Spacing.lg, paddingBottom: Spacing['3xl'] },

    sectionTitle: {
      ...face('body', 'semibold'),
      fontSize: FontSize.base,
      color: c.text,
      marginBottom: Spacing.sm,
      marginTop: Spacing.lg,
    },
    sectionHint: {
      ...face('body', 'regular'),
      fontSize: FontSize.sm,
      color: c.textTertiary,
      marginBottom: Spacing.md,
      marginTop: -Spacing.xs,
      lineHeight: FontSize.sm * 1.5,
    },
    changeLink: {
      ...face('body', 'regular'),
      fontSize: FontSize.sm,
      color: c.textBrand,
      marginTop: Spacing.xs,
      lineHeight: FontSize.sm * 1.5,
    },

    card: {
      backgroundColor: c.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: Spacing.md,
      ...Shadows.sm,
    },

    debugLink: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Spacing.lg,
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
      backgroundColor: c.tint,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: Radii.md,
    },
    testButtonText: {
      ...face('body', 'semibold'),
      fontSize: FontSize.sm,
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
      borderBottomColor: c.border,
    },
    screenRowLeft: { flex: 1, marginRight: Spacing.md },
    screenLabel: {
      ...face('body', 'medium'),
      fontSize: FontSize.base,
      color: c.text,
    },
    screenModeText: {
      ...face('body', 'regular'),
      fontSize: FontSize.xs,
      color: c.textTertiary,
      marginTop: 2,
    },

    notice: { marginTop: Spacing.xl },
  });
