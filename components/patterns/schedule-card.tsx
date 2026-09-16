/**
 * ScheduleCard — one cron/one-off schedule: kind badge, time/cron summary,
 * running/last-ran status, pause switch, and a run-now action.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GCard } from '@/components/ui/g-card';
import { GChip } from '@/components/ui/g-chip';
import { GSwitch } from '@/components/ui/g-switch';
import { GButton } from '@/components/ui/g-button';
import type { Schedule } from '@/models/schedule';
import { formatRelativeTime } from '@/utils/format-time';
import { Grey, Brand } from '@/constants/colors';
import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export interface ScheduleCardProps {
  schedule: Schedule;
  onTogglePause: (id: string, paused: boolean) => void;
  onRunNow: (id: string) => void;
  onPress: (id: string) => void;
}

function kindLabel(schedule: Schedule): { label: string; icon: 'bolt' | 'external' } {
  switch (schedule.kind.type) {
    case 'agent_prompt':
      return { label: 'Prompt', icon: 'bolt' };
    case 'webhook':
      return { label: 'Webhook', icon: 'external' };
    default:
      return { label: 'Automation', icon: 'bolt' };
  }
}

function timeSubtitle(schedule: Schedule): { text: string; mono: boolean } {
  if (schedule.next_run) return { text: `Next: ${formatRelativeTime(schedule.next_run)}`, mono: false };
  if (schedule.cron === '@once' && schedule.fire_at) {
    return { text: formatRelativeTime(schedule.fire_at), mono: false };
  }
  return { text: schedule.cron, mono: true };
}

export const ScheduleCard = React.memo(function ScheduleCard({
  schedule,
  onTogglePause,
  onRunNow,
  onPress,
}: ScheduleCardProps) {
  const kind = kindLabel(schedule);
  const subtitle = timeSubtitle(schedule);

  return (
    <GCard style={[styles.card, schedule.paused && styles.cardPaused]}>
      {/*
        Only this top block is wrapped in a Pressable — the switch/button
        below are siblings, not descendants, of it. Nesting them inside the
        same Pressable let a tap on the switch bubble up and also trigger
        "view run history" on web (react-native-web doesn't stop propagation
        the way native's touch responder system does), confirmed by testing
        against a live paired backend.
      */}
      <Pressable onPress={() => onPress(schedule.id)}>
        <View style={styles.topRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.label} numberOfLines={1}>{schedule.label}</Text>
            <Text style={[styles.subtitle, subtitle.mono && styles.subtitleMono]} numberOfLines={1}>
              {subtitle.text}
            </Text>
          </View>
          <GChip variant="secondary" startIcon={kind.icon} size="sm">{kind.label}</GChip>
        </View>

        <View style={styles.statusRow}>
          {schedule.currently_running ? (
            <GChip variant="primary" startIcon="activity" size="sm">Running…</GChip>
          ) : (
            <Text style={styles.statusText}>
              {schedule.last_run ? `Last ran ${formatRelativeTime(schedule.last_run)}` : 'Never run'}
            </Text>
          )}
        </View>
      </Pressable>

      <View style={styles.actionsRow}>
        <GSwitch
          value={!schedule.paused}
          onValueChange={(nextEnabled) => onTogglePause(schedule.id, !nextEnabled)}
        />
        <GButton
          variant="ghost"
          size="sm"
          startIcon="play"
          loading={schedule.currently_running}
          disabled={schedule.currently_running}
          onPress={() => onRunNow(schedule.id)}
        >
          Run now
        </GButton>
      </View>
    </GCard>
  );
});

const styles = StyleSheet.create({
  card: {
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  cardPaused: {
    opacity: 0.55,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleBlock: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  label: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Brand.charcoal,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[500],
    marginTop: 2,
  },
  subtitleMono: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
  },
  statusRow: {
    marginTop: Spacing.sm,
  },
  statusText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Grey[500],
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
});
