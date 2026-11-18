// My Pond: the Pond's administration, behind its administrator card, opened from Settings. Locked,
// it is the card's form; open, it is what the Pond holds and the ways in to tidying it.

import React, { useCallback } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { InkBadge, InkEdge, InkMeter, InkSpinner, inkText, useInkTheme } from '@/components/ui/ink';

import { AdminLockView } from '@/components/pond/admin-lock';
import { SettingsNotice, SettingsScroll } from '@/components/settings/settings-scroll';
import { SettingsGroup, SettingsRow, TILE_INSET } from '@/components/settings/settings-list';
import { useSettingsColors, useSettingsStyles, type SettingsColors, type SettingsMetrics, type SettingsType } from '@/components/settings/settings-theme';
import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { StorageColors, type TileColor } from '@/constants/colors';
import type { IconName } from '@/constants/icons';
import { Spacing } from '@/constants/spacing';
import { sizeWords } from '@/models/pond-admin';
import { useTheme } from '@/providers/theme-provider';
import { confirm, reject, selectionTick, tap } from '@/services/haptics';
import type { TranslationKey } from '@/services/i18n';
import type { AdminCheckStatus } from '@/services/types';
import { areaGroupLabel } from '@/view-models/pond-admin-words';
import { useMyPond, type MyPondPart } from '@/view-models/use-my-pond';

type PlaceId = 'files' | 'caches' | 'tasks' | 'health' | 'reliability' | 'power' | 'pairing' | 'switchPond' | 'pairPond';

const PLACES: { id: PlaceId; route: string; labelKey: TranslationKey; descriptionKey: TranslationKey; icon: IconName; tile: TileColor }[] = [
  { id: 'files', route: '/(stack)/pond-files', labelKey: 'screens.pondFiles', descriptionKey: 'myPond.menu.files', icon: 'folder', tile: 'blue' },
  { id: 'caches', route: '/(stack)/pond-caches', labelKey: 'screens.pondCaches', descriptionKey: 'myPond.menu.caches', icon: 'archive', tile: 'teal' },
  { id: 'tasks', route: '/(stack)/pond-tasks', labelKey: 'screens.pondTasks', descriptionKey: 'myPond.menu.tasks', icon: 'file-text', tile: 'indigo' },
  { id: 'health', route: '/(stack)/pond-health', labelKey: 'screens.pondHealth', descriptionKey: 'myPond.menu.health', icon: 'activity', tile: 'green' },
  { id: 'reliability', route: '/(stack)/pond-reliability', labelKey: 'screens.pondReliability', descriptionKey: 'myPond.menu.reliability', icon: 'bell-ring', tile: 'blue' },
  { id: 'power', route: '/(stack)/pond-power', labelKey: 'screens.pondPower', descriptionKey: 'myPond.menu.power', icon: 'power', tile: 'amber' },
  { id: 'pairing', route: '/(stack)/pairing-lock', labelKey: 'screens.pairingLock', descriptionKey: 'myPond.menu.pairing', icon: 'lock', tile: 'slate' },
  { id: 'switchPond', route: '/(stack)/switch-pond', labelKey: 'screens.switchPond', descriptionKey: 'myPond.menu.pairing', icon: 'updown', tile: 'amber' },
  { id: 'pairPond', route: '/(stack)/pond-pairing', labelKey: 'screens.pondPairing', descriptionKey: 'myPond.menu.pairing', icon: 'bluetooth', tile: 'blue' },
];

const COLUMNS = 3;

/** Lock, in the stack header's right, where the design puts it. */
function HeaderLock({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const styles = useSettingsStyles(makeStyles);
  const colors = useSettingsColors();
  return (
    <GPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={[styles.headerLock, disabled && styles.dim]}
    >
      <GIcon name="lock" size={16} color={colors.accent} strokeWidth={2.2} />
      <Text style={styles.headerLockText}>{t('myPond.lock.lock')}</Text>
    </GPressable>
  );
}

/** One bar in four parts, with 2 px between them; a screen reader reads every part and its size. */
function StorageBar({ parts }: { parts: MyPondPart[] }) {
  const { t } = useTranslation();
  const styles = useSettingsStyles(makeStyles);
  const { isDark } = useTheme();
  const palette = isDark ? StorageColors.dark : StorageColors.light;
  const label = t('myPond.overview.keepsLabel', {
    parts: parts.map((p) => t('myPond.overview.part', { label: areaGroupLabel(p.id), size: sizeWords(p.bytes) })).join(', '),
  });
  return (
    <View style={styles.barWrap}>
      <View accessible accessibilityRole="image" accessibilityLabel={label} style={styles.bar}>
        {parts
          .filter((p) => p.bytes > 0)
          .map((p) => (
            <View key={p.id} style={{ flex: p.bytes, backgroundColor: palette[p.id] }} />
          ))}
      </View>
    </View>
  );
}

function LegendRow({ part }: { part: MyPondPart }) {
  const styles = useSettingsStyles(makeStyles);
  const { isDark } = useTheme();
  const palette = isDark ? StorageColors.dark : StorageColors.light;
  return (
    <View style={styles.legend}>
      <View style={[styles.swatch, { backgroundColor: palette[part.id] }]} />
      <Text style={styles.legendLabel}>{areaGroupLabel(part.id)}</Text>
      <Text style={styles.legendValue}>{sizeWords(part.bytes)}</Text>
    </View>
  );
}

function CountTile({ value, label }: { value: number; label: string }) {
  const styles = useSettingsStyles(makeStyles);
  const theme = useInkTheme();
  return (
    <InkEdge raised={false} radius={theme.radius.md} style={styles.tile} contentStyle={styles.tileFace}>
      <Text style={[inkText(theme, { size: 'lg', weight: theme.weight.bold, leading: 'snug' }).style, styles.tileValue]}>{value.toLocaleString()}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </InkEdge>
  );
}

function HealthBadge({ status }: { status: AdminCheckStatus | null }) {
  const { t } = useTranslation();
  if (status === null) return null;
  if (status === 'ok') return <InkBadge tone="success">{t('myPond.health.allGood')}</InkBadge>;
  return <InkBadge tone={status === 'critical' ? 'danger' : 'warning'}>{t('myPond.health.attention')}</InkBadge>;
}

export default function MyPondScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useInkTheme();
  const styles = useSettingsStyles(makeStyles);
  const { gate, overview, parts, disk, volume, locksIn, healthStatus, loading, refreshing, error, locking, kept, actions } = useMyPond();
  const unlocked = gate.phase === 'unlocked';

  const go = useCallback(
    (route: string) => {
      void selectionTick();
      router.push(route as never);
    },
    [router],
  );

  const lock = useCallback(async () => {
    void tap();
    const ok = await actions.lock();
    void (ok ? confirm() : reject());
  }, [actions]);

  const forgetKey = useCallback(async () => {
    void tap();
    if (await actions.forgetKey()) void confirm();
  }, [actions]);

  // Options merge, so the locked screen has to take Lock away again rather than leave it standing.
  // The header keeps one right-hand view either way and only its content changes: adding and
  // removing that view as the screen locks and unlocks made react-native-screens remove a header
  // child that Fabric had already moved, which closed the app.
  const header = (
    <Stack.Screen
      options={{
        headerRight: () => (unlocked ? <HeaderLock disabled={locking} onPress={() => void lock()} /> : <View />),
      }}
    />
  );
  const refresh = <RefreshControl refreshing={refreshing} onRefresh={() => void actions.refresh()} />;

  if (!unlocked) {
    return (
      <SettingsScroll typing refreshControl={refresh}>
        {header}
        <AdminLockView onRetry={() => void actions.refresh()} />
      </SettingsScroll>
    );
  }

  const status =
    locksIn === null
      ? t('myPond.openLocksIdle', { count: gate.status?.idle_minutes ?? 15 })
      : locksIn === 0
        ? t('myPond.openLocksNow')
        : t('myPond.openLocksIn', { count: locksIn });

  const counts = overview?.counts;
  const tiles = counts
    ? [
        counts.sessions === null ? null : { key: 'sessions', value: counts.sessions, label: t('myPond.count.conversations', { count: counts.sessions }) },
        counts.messages === null ? null : { key: 'messages', value: counts.messages, label: t('myPond.count.messages', { count: counts.messages }) },
        counts.memories === null ? null : { key: 'memories', value: counts.memories, label: t('myPond.count.memories', { count: counts.memories }) },
        counts.long_tasks === null ? null : { key: 'tasks', value: counts.long_tasks, label: t('myPond.count.tasks', { count: counts.long_tasks }) },
        counts.artifacts === null ? null : { key: 'artifacts', value: counts.artifacts, label: t('myPond.count.artifacts', { count: counts.artifacts }) },
        counts.models === null ? null : { key: 'models', value: counts.models, label: t('myPond.count.models', { count: counts.models }) },
      ].filter((tile) => tile !== null)
    : [];
  const rows = Array.from({ length: Math.ceil(tiles.length / COLUMNS) }, (_, i) => tiles.slice(i * COLUMNS, i * COLUMNS + COLUMNS));

  const description = (id: PlaceId, fallback: TranslationKey) =>
    id === 'tasks' && counts?.long_tasks != null ? t('myPond.menu.tasksCount', { count: counts.long_tasks }) : t(fallback);

  return (
    <SettingsScroll refreshControl={refresh}>
      {header}
      <View style={styles.status}>
        <View style={[styles.dot, { backgroundColor: theme.color.success }]} />
        <Text style={styles.statusText}>{status}</Text>
      </View>

      {error ? <SettingsNotice tone="danger">{error}</SettingsNotice> : null}

      {loading ? (
        <InkSpinner label={t('myPond.overview.loading')} />
      ) : overview && disk ? (
        <>
          <SettingsGroup title={t('myPond.overview.disk')}>
            <View style={styles.disk}>
              <View style={styles.figureLine}>
                <Text style={[inkText(theme, { size: '2xl', weight: theme.weight.bold, leading: 'tight' }).style, styles.figure]}>
                  {t('myPond.overview.free', { size: sizeWords(disk.free) })}
                </Text>
                <Text style={styles.of}>{t('myPond.overview.of', { size: sizeWords(disk.total) })}</Text>
              </View>
              <InkMeter value={disk.fraction} label={t('myPond.overview.meterLabel', { percent: Math.round(disk.fraction * 100) })} />
              <Text style={styles.small}>
                {t('myPond.overview.used', { used: sizeWords(disk.used), pond: sizeWords(overview.data_dir_bytes) })}
              </Text>
              {volume ? (
                <Text style={styles.small}>
                  {t('myPond.overview.volume', {
                    used: sizeWords(volume.used),
                    total: sizeWords(volume.total),
                    free: sizeWords(volume.free),
                  })}
                </Text>
              ) : null}
            </View>
          </SettingsGroup>

          <SettingsGroup title={t('myPond.overview.keeps', { size: sizeWords(overview.data_dir_bytes) })}>
            <StorageBar parts={parts} />
            {parts.map((part) => (
              <LegendRow key={part.id} part={part} />
            ))}
          </SettingsGroup>

          {rows.length > 0 ? (
            <View style={styles.grid} accessibilityLabel={t('myPond.overview.holds')}>
              {rows.map((row, i) => (
                <View key={i} style={styles.gridRow}>
                  {row.map((tile) => (
                    <CountTile key={tile.key} value={tile.value} label={tile.label} />
                  ))}
                  {Array.from({ length: COLUMNS - row.length }, (_, j) => (
                    <View key={`gap-${j}`} style={styles.tile} />
                  ))}
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      <SettingsGroup inset={TILE_INSET}>
        {PLACES.map((p) => (
          <SettingsRow
            key={p.id}
            label={t(p.labelKey)}
            description={description(p.id, p.descriptionKey)}
            icon={p.icon}
            tile={p.tile}
            trailing={p.id === 'health' ? <HealthBadge status={healthStatus} /> : null}
            accessory="next"
            onPress={() => go(p.route)}
          />
        ))}
      </SettingsGroup>

      {kept ? (
        <SettingsGroup inset={TILE_INSET}>
          <SettingsRow
            label={t('myPond.key.forget')}
            description={t('myPond.key.forgetHint')}
            icon="face"
            tile="purple"
            destructive
            accessibilityRole="button"
            onPress={() => void forgetKey()}
          />
        </SettingsGroup>
      ) : null}
    </SettingsScroll>
  );
}

const makeStyles = (c: SettingsColors, type: SettingsType, m: SettingsMetrics) => ({
  headerLock: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    minHeight: m.tapMin,
    paddingHorizontal: Spacing.md,
  },
  headerLockText: { ...type.label, color: c.accent },
  dim: { opacity: 0.45 },
  status: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: Spacing.sm, marginBottom: Spacing.xl },
  dot: { width: 8, height: 8, borderRadius: m.radius.pill },
  statusText: { ...type.value, flex: 1 },
  disk: { gap: Spacing.md, paddingHorizontal: m.rowH, paddingTop: Spacing.sm, paddingBottom: m.rowH },
  figureLine: { flexDirection: 'row' as const, alignItems: 'baseline' as const, justifyContent: 'space-between' as const, gap: Spacing.sm },
  figure: { flexShrink: 1 },
  of: { ...type.description, fontVariant: ['tabular-nums' as const] },
  small: type.description,
  barWrap: { paddingHorizontal: m.rowH, paddingTop: Spacing.md, paddingBottom: m.rowV },
  bar: {
    flexDirection: 'row' as const,
    gap: 2,
    height: 14,
    borderRadius: m.radius.pill,
    overflow: 'hidden' as const,
    backgroundColor: c.line,
  },
  legend: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: Spacing.md,
    minHeight: m.tapMin,
    paddingHorizontal: m.rowH,
    paddingVertical: m.rowV,
  },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { ...type.label, flex: 1 },
  legendValue: { ...type.value, fontVariant: ['tabular-nums' as const] },
  grid: { gap: Spacing.sm, marginBottom: Spacing.xl },
  gridRow: { flexDirection: 'row' as const, gap: Spacing.sm },
  tile: { flex: 1 },
  tileFace: { gap: 2, padding: Spacing.md },
  tileValue: { fontVariant: ['tabular-nums' as const] },
  tileLabel: type.description,
});
