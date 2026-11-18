/**
 * The You tab, laid out as iPhone Settings: each row says how its setting stands, so the menu
 * answers "what is on" by itself. GIAP has no login, so the card is the member the Pond names.
 */

import { GPressable } from '@/components/ui/g-pressable';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { InkButton, InkCard, InkEdge, InkSpinner, InkText, InkTitle } from '@/components/ui/ink';
import { PUCK_SIZE } from '@/components/patterns/chrome-puck';
import { DOCK_GAP, WallDock } from '@/components/patterns/wall-dock';

import { IssueRows } from '@/components/settings/issue-page';
import { PAGE_GUTTER } from '@/components/settings/settings-scroll';
import { SettingsGroup, SettingsMessage, SettingsRow, TILE_INSET } from '@/components/settings/settings-list';
import {
  useSettingsColors,
  useSettingsStyles,
  type SettingsColors,
  type SettingsMetrics,
  type SettingsType,
} from '@/components/settings/settings-theme';
import { GIcon } from '@/components/ui/g-icon';
import { APP_VERSION } from '@/constants/app';
import { Brand, JaridaPurple } from '@/constants/colors';
import { ACCOUNT_ROUTE, PROFILE_NAV } from '@/constants/navigation';
import { Spacing } from '@/constants/spacing';
import type { SummaryId } from '@/models/pond-settings';
import { useBottomBarInset, useChromeScroll } from '@/providers/chrome-provider';
import { useServer } from '@/providers/server-provider';
import { api } from '@/services/api-client';
import { hostOf } from '@/services/discovery';
import { selectionTick } from '@/services/haptics';
import { initialOf, useHousehold } from '@/view-models/use-household';
import { usePondSettings } from '@/view-models/use-pond-settings';
import { PullSectionsProvider, useReloadOnPull, usePullSections, usePullToRefresh } from '@/view-models/use-pull-to-refresh';
import { summarize, useSummaryExtras } from '@/view-models/use-settings-extras';
import { useSettingsIssues } from '@/view-models/use-settings-issues';
import { useSettingsSearch, type SettingsSearchEntry } from '@/view-models/use-settings-search';
import { useUnpair } from '@/view-models/use-unpair';

const SUMMARY_IDS: SummaryId[] = PROFILE_NAV.flatMap((group) =>
  group.items.flatMap((item) => (item.summary ? [item.summary] : [])),
);

function AccountRow({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const styles = useSettingsStyles(makeStyles);
  const colors = useSettingsColors();
  const { data: household, actions: householdActions } = useHousehold();
  // The hub's pull reads who this is and what the Pond holds, too.
  useReloadOnPull(householdActions.refresh);
  const { serverUrl } = useServer();
  const { member, pondName, counts } = household;
  const [pressed, setPressed] = useState(false);
  const initial = member ? initialOf(member.displayName) : null;
  const subtitle = member && pondName ? t('profile.pairedTo', { pond: pondName }) : serverUrl ? hostOf(serverUrl) : null;
  const tally = [
    counts.devices === null ? null : t('settings.account.devices', { count: counts.devices }),
    counts.rooms === null ? null : t('settings.account.rooms', { count: counts.rooms }),
    counts.users === null ? null : t('settings.account.people', { count: counts.users }),
  ].filter(Boolean).join(' · ');

  // The one raised card on the screen: a press drives its face down onto the plate.
  return (
    <GPressable feedback="none"
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={member?.displayName ?? pondName ?? t('profile.yourPond')}
      accessibilityHint={t('settings.account.hint')}
      style={styles.accountWrap}
    >
      <InkEdge state={pressed ? 'pressed' : 'rest'} contentStyle={styles.account}>
      <View style={styles.avatar}>
        {initial ? <Text style={styles.avatarText}>{initial}</Text> : <GIcon name="home" size={26} color={Brand.white} />}
      </View>
      <View style={styles.accountText}>
        <Text style={styles.accountName} numberOfLines={1}>
          {member?.displayName ?? pondName ?? t('profile.yourPond')}
        </Text>
        {subtitle ? <Text style={styles.accountSub} numberOfLines={1}>{subtitle}</Text> : null}
        {tally ? <Text style={styles.accountSub} numberOfLines={1}>{tally}</Text> : null}
      </View>
      <GIcon name="chevron-right" size={18} color={colors.textTertiary} strokeWidth={2.5} />
      </InkEdge>
    </GPressable>
  );
}

/** What a search found, in place of the menu; a match inside a page names the page it is on. */
function SearchResults({ results, query, onOpen }: { results: SettingsSearchEntry[]; query: string; onOpen: (route: string) => void }) {
  const { t } = useTranslation();
  if (results.length === 0) return <SettingsMessage>{t('settings.search.none', { query: query.trim() })}</SettingsMessage>;
  return (
    <View accessibilityLabel={t('settings.search.results', { count: results.length })}>
      <SettingsGroup inset={TILE_INSET}>
        {results.map((entry) => (
          <SettingsRow
            key={entry.id}
            label={entry.label}
            description={entry.parent ? t('settings.search.inPage', { page: entry.parent }) : null}
            icon={entry.icon}
            tile={entry.tile}
            accessory="next"
            onPress={() => onOpen(entry.route)}
          />
        ))}
      </SettingsGroup>
    </View>
  );
}

export default function ProfileHub() {
  const styles = useSettingsStyles(makeStyles);
  const colors = useSettingsColors();
  const { t } = useTranslation();
  const router = useRouter();
  const { unpairing, start: confirmUnpair } = useUnpair();
  const chrome = useChromeScroll();
  const bottomInset = useBottomBarInset();
  const { settings, actions: settingsActions } = usePondSettings();
  const { registry, reload: reloadSections } = usePullSections();
  const reloadHub = useCallback(
    () => Promise.all([settingsActions.refresh(), reloadSections()]),
    [settingsActions, reloadSections],
  );
  const pull = usePullToRefresh(reloadHub);
  const issues = useSettingsIssues();
  const extras = useSummaryExtras(SUMMARY_IDS);
  const search = useSettingsSearch();
  const { clear: clearSearch } = search;
  const { hydrated } = useServer();
  const [pondActivity, setPondActivity] = useState<{
    key: string;
    label: string;
    details: string[];
  } | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    let alive = true;
    const poll = async () => {
      try {
        const lane = await api.laneStatus();
        if (!alive) return;
        const parts: string[] = [];
        const details: string[] = [];
        if (lane.embedding_slot?.running) {
          parts.push('Indexing memories');
          const secs = lane.embedding_slot.running_for_secs;
          details.push(secs != null ? `Memory embedder active (${secs}s)` : 'Memory embedder active');
        }
        if (lane.running_title) {
          parts.push(lane.running_title);
          if (lane.running) details.push(`Task: ${lane.running.replace(/_/g, ' ')}`);
        } else if (lane.slot_busy) {
          parts.push('Running background inference');
          details.push('Inference slot active');
        }
        if (parts.length === 0) {
          setPondActivity(null);
          setDismissedKey(null);
        } else {
          details.push('Pauses automatically when you chat');
          const label = parts.join(' · ');
          const key = `${lane.embedding_slot?.running ? 'emb' : ''}:${lane.running ?? (lane.slot_busy ? 'busy' : '')}`;
          setPondActivity({ key, label, details });
        }
      } catch {
        // Ignore transient offline errors; other status cards handle reachability.
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [hydrated]);

  // Leaving the tab puts the search away, so coming back shows the menu rather than results
  // that were typed for a different moment, with the keyboard still asking for more.
  useFocusEffect(
    useCallback(
      () => () => {
        Keyboard.dismiss();
        setSearching(false);
        clearSearch();
      },
      [clearSearch],
    ),
  );

  const go = useCallback(
    (route: string) => {
      void selectionTick();
      router.push(route as never);
    },
    [router],
  );

  const values = useMemo(
    () => Object.fromEntries(SUMMARY_IDS.map((id) => [id, summarize(id, settings, extras, t)])) as Record<SummaryId, string | null>,
    [settings, extras, t],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.page }]} edges={['top']}>
      <ScrollView
        {...chrome}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomInset + DOCK_GAP + PUCK_SIZE + Spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
        // A result can be tapped while the keyboard is still up, and a scroll puts it away.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl {...pull} />}
      >
        <InkTitle style={[styles.title, { fontStyle: 'normal', fontWeight: '800', fontSize: 34, lineHeight: 42, transform: [] }]}>{t('screens.settings')}</InkTitle>

        {pondActivity && dismissedKey !== pondActivity.key ? (
          <InkCard style={styles.activityCard}>
            <View style={styles.activityHeader}>
              <View style={styles.activityTitleRow}>
                <InkSpinner label={pondActivity.label} />
                <View style={styles.activityWords}>
                  <InkText size="sm" weight="semibold">Pond is working</InkText>
                  <InkText size="xs" tone="secondary">{pondActivity.label}</InkText>
                </View>
              </View>
              <GPressable
                onPress={() => setDismissedKey(pondActivity.key)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
              >
                <InkText size="md" tone="tertiary">✕</InkText>
              </GPressable>
            </View>
            <View style={styles.activityMeta}>
              {pondActivity.details.map((detail) => (
                <InkText key={detail} size="xs" tone="tertiary">
                  • {detail}
                </InkText>
              ))}
            </View>
          </InkCard>
        ) : null}

        {search.result.mode === 'results' ? (
          <SearchResults results={search.result.results} query={search.query} onOpen={go} />
        ) : (
          <>
          <IssueRows issues={issues} />

          <PullSectionsProvider value={registry}>
            <AccountRow onPress={() => go(ACCOUNT_ROUTE)} />
          </PullSectionsProvider>

          {PROFILE_NAV.map((group) => (
            <View key={group.groupKey} accessibilityLabel={t(group.groupKey)}>
              <SettingsGroup inset={TILE_INSET}>
                {group.items.map((item) => (
                  <SettingsRow
                    key={item.id}
                    label={t(item.labelKey)}
                    icon={item.icon}
                    tile={item.tile}
                    value={item.summary ? values[item.summary] : null}
                    accessory="next"
                    onPress={() => go(item.route)}
                  />
                ))}
              </SettingsGroup>
            </View>
          ))}

          {/* Unpairing is also the only way to release a remote enrollment the Pond still calls
              active, so it has to work, and say that it is working. A Pond that cannot be reached
              can still be removed from this phone; see useUnpair. */}
          <InkButton variant="danger" disabled={unpairing} onPress={() => void confirmUnpair()} style={styles.unpair}>
            {unpairing ? t('profile.unpairing') : t('common.unpair')}
          </InkButton>
          <Text style={styles.version}>{t('profile.version', { version: APP_VERSION })}</Text>
          </>
        )}
      </ScrollView>
      <WallDock
        query={search.query}
        onQuery={(q) => (q ? search.setQuery(q) : search.clear())}
        open={searching}
        onOpenChange={setSearching}
        placeholder={t('settings.search.placeholder')}
        bottomInset={bottomInset}
      />
    </SafeAreaView>
  );
}

const makeStyles = (c: SettingsColors, type: SettingsType, m: SettingsMetrics) => ({
  safe: { flex: 1 },
  content: { paddingHorizontal: PAGE_GUTTER },
  title: { marginTop: Spacing.md, marginBottom: Spacing.lg },
  activityCard: { marginBottom: Spacing.lg, gap: Spacing.sm },
  activityHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: Spacing.sm },
  activityTitleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: Spacing.sm, flex: 1 },
  activityWords: { flex: 1, gap: 2 },
  activityMeta: { paddingLeft: 28, gap: 2 },
  search: { marginBottom: Spacing.lg },
  accountWrap: { marginBottom: Spacing.xl },
  account: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: JaridaPurple[500],
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  avatarText: { ...type.heading, fontSize: 24, lineHeight: 30, color: Brand.white },
  accountText: { flex: 1, gap: 2 },
  accountName: { ...type.heading, fontSize: 20, lineHeight: 25 },
  accountSub: type.description,
  unpair: { alignSelf: 'flex-start' as const, marginTop: Spacing.sm },
  version: { ...type.mono, marginTop: Spacing.lg },
});
