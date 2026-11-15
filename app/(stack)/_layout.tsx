/**
 * StackLayout — the screens reached from the Profile hub and from Home.
 *
 * The header is drawn by the navigator rather than by any screen, so it is the
 * one surface `useThemedStyles` cannot reach. It reads `useTheme()` directly;
 * without that it stayed `Brand.white` in dark mode, which is a white slab
 * above every one of these screens.
 */

import { Stack, useRouter } from 'expo-router';
import React, { useCallback, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ConnectionStatus } from '@/components/patterns/connection-status';
import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { useTheme } from '@/providers/theme-provider';
import { selectionTick } from '@/services/haptics';
import { JaridaPurple } from '@/constants/colors';
import { face } from '@/constants/typography';

/**
 * A back control the navigator will not draw on its own.
 *
 * These screens are pushed from the tab group through the *root* stack, so this
 * nested navigator has exactly one entry in its own history and suppresses the
 * system back button. Without this, every one of them is a dead end reachable
 * only by the edge-swipe gesture — which is invisible, and which a person who
 * has turned it off does not have at all.
 */
function BackButton() {
  const router = useRouter();
  const { t } = useTranslation();
  const onPress = useCallback(() => {
    void selectionTick();
    router.back();
  }, [router]);

  return (
    <GPressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
    >
      <GIcon name="chevron-left" size={22} color={JaridaPurple[500]} />
    </GPressable>
  );
}

/**
 * Each screen under its title bar, with the connection strip at the top of its content while the
 * Pond cannot be used. The strip used to sit above the whole app, over this title bar, which kept
 * its own status-bar inset under it: two headers stacked, and the screen read as broken.
 */
function ScreenWithStatus({ route, children }: { route: { name: string }; children: ReactElement }) {
  return (
    <View style={styles.screen}>
      <ConnectionStatus placement="inline" screen={route.name} />
      {children}
    </View>
  );
}

export default function StackLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <Stack
      screenLayout={ScreenWithStatus}
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: JaridaPurple[500],
        headerTitleStyle: {
          color: colors.text,
          ...face('display', 'bold'),
        },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerLeft: () => <BackButton />,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="settings-assistant" options={{ title: t('screens.settingsAssistant') }} />
      <Stack.Screen name="settings-prompt-notes" options={{ title: t('screens.settingsPromptNotes') }} />
      <Stack.Screen name="settings-voice" options={{ title: t('screens.settingsVoice') }} />
      <Stack.Screen name="settings-speaking" options={{ title: t('screens.settingsSpeaking') }} />
      <Stack.Screen name="wake-word" options={{ title: t('screens.wakeWord') }} />
      <Stack.Screen name="settings-listening" options={{ title: t('screens.settingsListening') }} />
      <Stack.Screen name="settings-thinking" options={{ title: t('screens.settingsThinking') }} />
      <Stack.Screen name="settings-memory" options={{ title: t('screens.settingsMemory') }} />
      <Stack.Screen name="settings-memory-tuning" options={{ title: t('screens.settingsMemoryTuning') }} />
      <Stack.Screen name="settings-tools" options={{ title: t('screens.settingsTools') }} />
      <Stack.Screen name="settings-internet" options={{ title: t('screens.settingsInternet') }} />
      <Stack.Screen name="settings-home" options={{ title: t('screens.settingsHome') }} />
      <Stack.Screen name="settings-timezone" options={{ title: t('screens.settingsTimezone') }} />
      <Stack.Screen name="settings-issue" options={{ title: t('screens.settingsIssue') }} />
      <Stack.Screen name="settings-household" options={{ title: t('screens.settingsHousehold') }} />
      <Stack.Screen name="settings-cameras" options={{ title: t('screens.settingsCameras') }} />
      <Stack.Screen name="vision-events" options={{ title: t('screens.visionEvents') }} />
      <Stack.Screen name="faces" options={{ title: t('screens.faces') }} />
      <Stack.Screen name="vision-automations" options={{ title: t('screens.visionAutomations') }} />
      <Stack.Screen name="settings-announcements" options={{ title: t('screens.settingsAnnouncements') }} />
      <Stack.Screen name="suggestions" options={{ title: t('screens.suggestions') }} />
      <Stack.Screen name="settings-privacy" options={{ title: t('screens.settingsPrivacy') }} />
      <Stack.Screen name="settings-retention" options={{ title: t('screens.settingsRetention') }} />
      <Stack.Screen name="settings-appearance" options={{ title: t('screens.settingsAppearance') }} />
      <Stack.Screen name="settings-phone-notifications" options={{ title: t('screens.settingsPhoneNotifications') }} />
      <Stack.Screen name="settings-advanced" options={{ title: t('screens.settingsAdvanced') }} />
      <Stack.Screen name="models" options={{ title: t('screens.models') }} />
      <Stack.Screen name="settings-model-role" options={{ title: t('screens.settingsModelRole') }} />
      <Stack.Screen name="settings-model" options={{ title: t('screens.settingsModel') }} />
      <Stack.Screen name="settings-model-helper" options={{ title: t('screens.settingsModel') }} />
      <Stack.Screen name="settings-model-catalog" options={{ title: t('screens.settingsModelCatalog') }} />
      <Stack.Screen name="settings-model-search" options={{ title: t('screens.settingsModelSearch') }} />
      <Stack.Screen name="memories" options={{ title: t('screens.memories') }} />
      <Stack.Screen name="sessions" options={{ title: t('screens.sessions') }} />
      <Stack.Screen name="logs" options={{ title: t('screens.logs') }} />
      <Stack.Screen name="schedule" options={{ title: t('screens.schedule') }} />
      <Stack.Screen name="schedule-detail" options={{ title: t('screens.scheduleDetail') }} />
      <Stack.Screen name="reminders" options={{ title: t('screens.reminders') }} />
      <Stack.Screen name="ride" options={{ title: t('screens.ride') }} />
      <Stack.Screen name="agents" options={{ title: t('screens.agents') }} />
      <Stack.Screen name="task-report" options={{ title: t('screens.taskReport') }} />
      <Stack.Screen name="pond" options={{ title: t('screens.myPond') }} />
      <Stack.Screen name="pond-files" options={{ title: t('screens.pondFiles') }} />
      <Stack.Screen name="pond-caches" options={{ title: t('screens.pondCaches') }} />
      <Stack.Screen name="pond-tasks" options={{ title: t('screens.pondTasks') }} />
      <Stack.Screen name="pond-health" options={{ title: t('screens.pondHealth') }} />
      <Stack.Screen name="pond-power" options={{ title: t('screens.pondPower') }} />
      <Stack.Screen name="pond-reset" options={{ title: t('screens.pondReset') }} />
      <Stack.Screen name="agent" options={{ title: t('screens.agent') }} />
      <Stack.Screen name="voice-agent" options={{ title: t('screens.voiceAgent') }} />
      <Stack.Screen name="voice-match" options={{ title: t('screens.voiceMatch') }} />
      <Stack.Screen name="extensions" options={{ title: t('screens.extensions') }} />
      <Stack.Screen name="web-search" options={{ title: t('screens.webSearch') }} />
      <Stack.Screen name="secrets" options={{ title: t('screens.secrets') }} />
      <Stack.Screen name="add-users" options={{ title: t('screens.addUsers') }} />
      <Stack.Screen name="privacy" options={{ title: t('screens.privacy') }} />
      <Stack.Screen name="remote-access" options={{ title: t('screens.remoteAccess') }} />
      <Stack.Screen name="home-management" options={{ title: t('screens.homeManagement') }} />
      <Stack.Screen name="pond-pairing" options={{ title: t('screens.pondPairing') }} />
      <Stack.Screen name="developer" options={{ title: t('screens.developer') }} />
      <Stack.Screen name="debug" options={{ title: t('screens.debug') }} />
      <Stack.Screen name="commission-device" options={{ title: t('screens.commissionDevice') }} />
      <Stack.Screen name="switch-pond" options={{ title: t('screens.switchPond') }} />
      <Stack.Screen
        name="connect-desktop"
        options={{
          // No header at all. `headerTransparent` still reserved a bar, with the
          // tint on top of it, which is why the title was invisible and the
          // camera started an inch down the screen. A viewfinder wants the whole
          // screen, so it carries its own dismiss control instead.
          headerShown: false,
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
