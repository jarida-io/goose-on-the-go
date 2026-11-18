/**
 * The contents of Home's widgets. The board draws their frames and padding, so each of these draws
 * only what it says: a header naming it, then the thing itself, with the value larger than its label.
 */

import React, { useCallback } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkEmptyState, InkSwitch, InkText, inkText, useInkTheme } from '@/components/ui/ink';

import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { Markdown } from '@/components/patterns/markdown';
import { EqualizerBars } from '@/components/ui/equalizer-bars';
import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { deviceStyle } from '@/constants/device-style';
import { isUnavailable, type ContentState } from '@/models/content-state';
import type { IconName } from '@/constants/icons';
import { toggle } from '@/services/haptics';
import type { Device } from '@/services/types';
import { isAppWindow, supports } from '@/view-models/use-devices';
import type { HomeReminders } from '@/view-models/use-home-ideas';
import type { RecentSession } from '@/view-models/use-recent-sessions';
import { untilText, type NextRoutine, type NowPlaying, type Outdoor } from '@/view-models/use-right-now';

type Theme = ReturnType<typeof useInkTheme>;

export interface WidgetHeaderProps {
  icon: IconName;
  title: string;
  /** A count or a state, said after the title and quieter than it. */
  meta?: string | null;
  /** `name` is what a screen reader hears: two "See all" on one screen do not say which list each opens. */
  action?: { label: string; name?: string; onPress: () => void } | null;
  onAccent?: boolean;
}

export function WidgetHeader({ icon, title, meta, action, onAccent = false }: WidgetHeaderProps) {
  const theme = useInkTheme();
  const styles = makeStyles(theme);
  const tint = onAccent ? theme.color.textOnAccent : theme.color.accentLine;

  return (
    <View style={styles.header}>
      <GIcon name={icon} size={14} color={tint} strokeWidth={2.5} />
      <Text style={[styles.headerTitle, onAccent && { color: theme.color.textOnAccent }]} numberOfLines={1}>
        {title}
      </Text>
      {meta ? (
        <Text style={[styles.headerMeta, onAccent && styles.onAccentQuiet]} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
      <View style={styles.spacer} />
      {action ? (
        <GPressable hitSlop={12} accessibilityRole="button" accessibilityLabel={action.name} onPress={action.onPress}>
          <Text style={styles.link}>{action.label}</Text>
        </GPressable>
      ) : null}
    </View>
  );
}

/**
 * What is playing, on the one widget allowed to be loud. Idle is said in words; the bars move only
 * while something plays, because bars over silence would say music is on.
 */
export function NowPlayingWidget({ playing, onOpen }: { playing: NowPlaying; onOpen?: () => void }) {
  const theme = useInkTheme();
  const styles = makeStyles(theme);
  const { t } = useTranslation();
  const on = theme.color.textOnAccent;
  const pct =
    playing.state === 'playing' && playing.durationMs && playing.durationMs > 0 && typeof playing.progressMs === 'number'
      ? Math.max(0, Math.min(100, (playing.progressMs / playing.durationMs) * 100))
      : null;

  const content = (
    <View
      accessible
      accessibilityLabel={
        playing.state === 'playing'
          ? [t('home.nowPlaying'), playing.track, playing.artist].filter(Boolean).join(', ')
          : t('home.nothingPlaying')
      }
    >
      <WidgetHeader icon="music" title={t('home.nowPlaying')} onAccent />
      {playing.state === 'playing' ? (
        <>
          <View style={styles.mediaRow}>
            {playing.albumArt ? (
              <Image source={{ uri: playing.albumArt }} style={styles.mediaArt} resizeMode="cover" />
            ) : null}
            <View style={styles.mediaMeta}>
              <Text style={[styles.value, { color: on }]} numberOfLines={2}>
                {playing.track}
              </Text>
              {playing.artist ? (
                <Text style={[styles.detail, styles.onAccentQuiet]} numberOfLines={1}>
                  {playing.artist}
                </Text>
              ) : null}
            </View>
          </View>
          {pct !== null ? (
            <View style={styles.mediaTrack}>
              <View style={[styles.mediaFill, { width: `${pct}%`, backgroundColor: on }]} />
            </View>
          ) : null}
          <View style={styles.bars}>
            <EqualizerBars color={on} count={8} height={18} />
          </View>
        </>
      ) : (
        <View style={styles.mediaIdle}>
          <Text style={[styles.value, styles.onAccentQuiet]}>{t('home.nothingPlaying')}</Text>
          <Text style={[styles.detail, styles.onAccentQuiet, { opacity: 0.68 }]}>Tap to open player</Text>
        </View>
      )}
    </View>
  );

  if (onOpen) {
    return (
      <GPressable onPress={onOpen} accessibilityRole="button">
        {content}
      </GPressable>
    );
  }
  return content;
}

/** The soonest routine that will run. A routine, never an event: these are the Pond's own schedules. */
export function NextRoutineWidget({ routine, now, onOpen }: { routine: NextRoutine; now: Date; onOpen: () => void }) {
  const theme = useInkTheme();
  const styles = makeStyles(theme);
  const { t } = useTranslation();
  const time = routine.nextRun.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const until = untilText(routine.nextRun, now);
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const span = Math.max(1, midnight.getTime() - now.getTime());
  const posPct = Math.max(6, Math.min(94, ((routine.nextRun.getTime() - now.getTime()) / span) * 100));

  return (
    <GPressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={[t('home.nextRoutine'), routine.label, time, until].join(', ')}
    >
      <WidgetHeader icon="schedule" title={t('home.nextRoutine')} />
      <Text style={styles.value} numberOfLines={2}>
        {routine.label}
      </Text>
      <View style={styles.routineMeta}>
        <Text style={styles.detail}>{time}</Text>
        <View style={[styles.untilBadge, { backgroundColor: theme.color.accentSoft }]}>
          <Text style={[styles.untilText, { color: theme.color.accentLine }]}>{until}</Text>
        </View>
      </View>
      <View style={styles.timeline}>
        <View style={[styles.timelineTrack, { backgroundColor: theme.color.lineStrong }]} />
        <View style={[styles.timelineDot, { left: `${posPct}%`, backgroundColor: theme.color.accent }]} />
      </View>
    </GPressable>
  );
}

/** The temperature where the Pond is, which is not necessarily where the phone is. */
export function OutsideWidget({ outdoor, onOpen }: { outdoor: Outdoor; onOpen?: () => void }) {
  const theme = useInkTheme();
  const styles = makeStyles(theme);
  const { t } = useTranslation();
  const temp = t('home.widgets.temp', { temp: Math.round(outdoor.temp) });
  const hasRange = typeof outdoor.hi === 'number' && typeof outdoor.lo === 'number';

  const content = (
    <View accessible accessibilityLabel={[t('home.widgets.outside'), temp, outdoor.place].filter(Boolean).join(', ')}>
      <WidgetHeader icon={outdoor.icon} title={t('home.widgets.outside')} />
      <View style={styles.weatherHero}>
        <GIcon
          name={outdoor.icon}
          size={30}
          color={outdoor.isDay === false ? '#A5B4FC' : '#FBBF24'}
        />
        <Text style={styles.big}>{temp}</Text>
      </View>
      {outdoor.cond ? (
        <Text style={styles.weatherCond} numberOfLines={1}>
          {outdoor.cond}
        </Text>
      ) : null}
      {hasRange ? (
        <Text style={styles.weatherRange}>
          H:{outdoor.hi}° · L:{outdoor.lo}°
        </Text>
      ) : null}
      {outdoor.place ? (
        <Text style={styles.detail} numberOfLines={1}>
          {outdoor.place}
        </Text>
      ) : null}
    </View>
  );

  if (onOpen) {
    return (
      <GPressable onPress={onOpen} accessibilityRole="button">
        {content}
      </GPressable>
    );
  }
  return content;
}

/** The first thing the Pond was asked to remember, and how many more wait behind it. */
export function RememberWidget({ reminders, onOpen }: { reminders: HomeReminders; onOpen: () => void }) {
  const theme = useInkTheme();
  const styles = makeStyles(theme);
  const { t } = useTranslation();
  const more = reminders.more > 0 ? t('home.widgets.more', { count: reminders.more }) : null;

  return (
    <GPressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={[t('home.widgets.remember'), reminders.first.text, more].filter(Boolean).join(', ')}
    >
      <WidgetHeader icon="bell" title={t('home.widgets.remember')} />
      <Text style={styles.note} numberOfLines={4}>
        {reminders.first.text}
      </Text>
      {more ? <Text style={styles.when}>{more}</Text> : null}
    </GPressable>
  );
}

export interface ConversationsWidgetProps {
  sessions: RecentSession[];
  state: ContentState;
  error: string | null;
  onRetry: () => void;
  onOpen: (session: RecentSession) => void;
  onSeeAll: () => void;
}

export function ConversationsWidget({ sessions, state, error, onRetry, onOpen, onSeeAll }: ConversationsWidgetProps) {
  const theme = useInkTheme();
  const styles = makeStyles(theme);
  const { t } = useTranslation();

  return (
    <View>
      <WidgetHeader
        icon="chat"
        title={t('home.conversations')}
        action={{ label: t('common.seeAll'), name: t('home.seeAllConversations'), onPress: onSeeAll }}
      />
      {sessions.map((c, i) => (
        <GPressable key={c.id} style={[styles.row, i > 0 && styles.divided]} onPress={() => onOpen(c)}>
          <View style={styles.rowWords}>
            <Text style={styles.rowText}>{c.text}</Text>
            {/* How it opened, under its name. Null when that is what the line above already says. */}
            {c.preview ? <Markdown source={c.preview} size="sm" tone="secondary" selectable={false} /> : null}
          </View>
          <Text style={styles.rowTime}>{c.time}</Text>
        </GPressable>
      ))}
      {/* A read that failed is not "no conversations yet". */}
      {isUnavailable(state) ? (
        <ContentUnavailable compact state={state} reason={error} onRetry={onRetry} />
      ) : state === 'empty' ? (
        <InkEmptyState icon="chat" title={t('home.noConversations')}>
          <InkText>{t('home.noConversationsBody')}</InkText>
        </InkEmptyState>
      ) : null}
    </View>
  );
}

export interface DevicesWidgetProps {
  devices: Device[];
  powerById: Record<string, boolean>;
  /** Null while the list is unknown, so a count is never stated about it. */
  online: { count: number; total: number } | null;
  state: ContentState;
  error: string | null;
  onRetry: () => void;
  onToggle: (device: Device, on: boolean) => void;
  onSeeAll: () => void;
  empty: React.ReactNode;
}

export function DevicesWidget({ devices, powerById, online, state, error, onRetry, onToggle, onSeeAll, empty }: DevicesWidgetProps) {
  const theme = useInkTheme();
  const styles = makeStyles(theme);
  const { t } = useTranslation();

  return (
    <View>
      <WidgetHeader
        icon="device"
        title={t('home.devices')}
        meta={online && online.total > 0 ? t('home.widgets.online', { online: online.count, total: online.total }) : null}
        action={{ label: t('common.seeAll'), name: t('home.seeAllDevices'), onPress: onSeeAll }}
      />
      {devices.length > 0 ? (
        <View style={styles.grid}>
          {devices.map((d) => (
            <DeviceTile key={d.id} device={d} power={powerById[d.id]} onToggle={onToggle} />
          ))}
        </View>
      ) : null}
      {/* An empty grid reads as a broken screen; a list that failed to load is neither, and says so. */}
      {isUnavailable(state) ? (
        <ContentUnavailable compact state={state} reason={error} onRetry={onRetry} />
      ) : state === 'empty' ? (
        empty
      ) : null}
    </View>
  );
}

/**
 * A device on Home. The switch appears only where `capabilities` says the device takes one, and
 * its position is what the device reported rather than a default.
 */
const DeviceTile = React.memo(function DeviceTile({
  device,
  power,
  onToggle,
}: {
  device: Device;
  power: boolean | undefined;
  onToggle: (device: Device, on: boolean) => void;
}) {
  const theme = useInkTheme();
  const styles = makeStyles(theme);
  const { t } = useTranslation();
  const { icon, color } = deviceStyle(device);
  const on = power ?? false;
  const appWindow = isAppWindow(device);
  const offline = !device.is_online && !appWindow;
  const handleToggle = useCallback(
    (next: boolean) => {
      void toggle();
      onToggle(device, next);
    },
    [device, onToggle],
  );

  return (
    <View style={styles.tile}>
      <View style={styles.tileTop}>
        <View style={[styles.tileIcon, { backgroundColor: color + '1F' }]}>
          <GIcon name={icon} size={15} color={on && device.is_online ? color : theme.color.textTertiary} />
        </View>
        {supports(device, 'power') ? (
          <InkSwitch checked={on} onChange={handleToggle} disabled={!device.is_online} />
        ) : null}
      </View>
      <Text style={styles.tileName} numberOfLines={1}>
        {device.name}
      </Text>
      <Text style={[styles.tileState, offline && { color: theme.color.dangerFg }]}>
        {appWindow
          ? t(device.is_online ? 'devices.app.open' : 'devices.app.notOpen')
          : offline
            ? t('common.offline')
            : power === undefined
              ? t('common.online')
              : t(power ? 'common.on' : 'common.off')}
      </Text>
    </View>
  );
});

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', gap: theme.space[1] + 2, marginBottom: theme.space[3] },
    headerTitle: inkText(theme, { size: 'sm', weight: theme.weight.semibold, color: theme.color.textSecondary }).style,
    headerMeta: inkText(theme, { size: 'sm', color: theme.color.textTertiary }).style,
    spacer: { flex: 1 },
    link: inkText(theme, { size: 'sm', weight: theme.weight.semibold, color: theme.color.accentLine }).style,
    onAccentQuiet: { color: theme.color.textOnAccent, opacity: 0.82 },

    value: inkText(theme, { role: 'display', size: 'lg', weight: theme.weight.bold, tracking: 'snug', leading: 'snug' }).style,
    big: inkText(theme, { role: 'display', size: '2xl', weight: theme.weight.bold, tracking: 'snug', leading: 'tight' }).style,
    note: inkText(theme, { size: 'md', weight: theme.weight.semibold, leading: 'snug' }).style,
    detail: { ...inkText(theme, { size: 'base', color: theme.color.textSecondary }).style, marginTop: 2 },
    when: {
      ...inkText(theme, { size: 'sm', weight: theme.weight.semibold, color: theme.color.accentLine }).style,
      marginTop: theme.space[2],
      fontVariant: ['tabular-nums'],
    },
    bars: { marginTop: theme.space[3] },
    mediaRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space[3] },
    mediaArt: { width: 48, height: 48, borderRadius: theme.radius.md },
    mediaMeta: { flex: 1 },
    mediaIdle: { gap: 4 },
    mediaTrack: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.24)', marginTop: theme.space[3], overflow: 'hidden' },
    mediaFill: { height: '100%', borderRadius: 2 },
    routineMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.space[2], gap: theme.space[2] },
    untilBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.pill },
    untilText: { ...inkText(theme, { size: 'xs', weight: theme.weight.semibold }).style, fontVariant: ['tabular-nums'] },
    timeline: { height: 10, justifyContent: 'center', marginTop: theme.space[3] },
    timelineTrack: { height: 2, borderRadius: 1, width: '100%' },
    timelineDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, marginLeft: -4 },
    weatherHero: { flexDirection: 'row', alignItems: 'center', gap: theme.space[2], marginTop: 2 },
    weatherCond: { ...inkText(theme, { size: 'sm', weight: theme.weight.medium, color: theme.color.text }).style, marginTop: 4 },
    weatherRange: { ...inkText(theme, { size: 'xs', color: theme.color.textTertiary }).style, marginTop: 2, fontVariant: ['tabular-nums'] },

    // Top-aligned: a row now runs as long as its preview, and the time belongs beside its name.
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.space[3], minHeight: theme.rowHeight.md },
    divided: { borderTopWidth: theme.edge.hairlineWidth, borderTopColor: theme.color.line },
    rowWords: { flex: 1, gap: 1, paddingVertical: theme.space[2] },
    rowText: inkText(theme, { size: 'md' }).style,
    rowTime: { ...inkText(theme, { size: 'sm', color: theme.color.textTertiary }).style, fontVariant: ['tabular-nums'], paddingTop: theme.space[2] },

    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: theme.space[2] },
    tile: {
      width: '48.5%',
      backgroundColor: theme.color.chrome,
      borderRadius: theme.radius.lg,
      padding: theme.space[3],
      gap: 2,
    },
    tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.space[2] },
    tileIcon: { width: 30, height: 30, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
    tileName: inkText(theme, { size: 'base', weight: theme.weight.semibold }).style,
    tileState: inkText(theme, { size: 'sm', color: theme.color.textTertiary }).style,
  });
