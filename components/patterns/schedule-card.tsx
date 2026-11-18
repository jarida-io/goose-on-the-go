/**
 * ScheduleCard — one cron or one-off schedule.
 *
 * The top of the card opens the schedule's own screen; the switch and Run now sit below
 * it as siblings, not inside the same pressable, so a flip of the switch is
 * never also read as a tap on the card.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkBadge, InkButton, InkCard, InkText } from '@/components/ui/ink';

import { LabelledSwitch } from '@/components/patterns/labelled-switch';
import { GPressable } from '@/components/ui/g-pressable';
import { describeWhen, formatScheduleTime, isOneOff } from '@/models/schedule';
import { toggle } from '@/services/haptics';
import type { Schedule } from '@/services/types';
import { Spacing } from '@/constants/spacing';

export interface ScheduleCardProps {
  schedule: Schedule;
  onOpen: (schedule: Schedule) => void;
  onSetPaused: (schedule: Schedule, paused: boolean) => void;
  onRunNow: (schedule: Schedule) => void;
  /** Absent on mock, where there is nothing to run. */
  canRun: boolean;
  /** The phone's IANA zone; a schedule kept in another one says so. */
  phoneZone: string;
}

export const ScheduleCard = React.memo(function ScheduleCard({
  schedule,
  onOpen,
  onSetPaused,
  onRunNow,
  canRun,
  phoneZone,
}: ScheduleCardProps) {
  const { t } = useTranslation();
  // When it runs in words, or the cron itself where there are none for it.
  const when = describeWhen(schedule, phoneZone);
  // The Pond cannot resume a paused one-off: it re-parses the `@once`
  // placeholder as a cron and answers 404, so a one-off gets no switch.
  const oneOff = isOneOff(schedule);
  // A one-off's line already says when it fires.
  const next = !oneOff && schedule.next_run ? t('schedule.card.next', { when: formatScheduleTime(schedule.next_run) }) : null;

  return (
    <InkCard style={schedule.paused ? styles.paused : undefined}>
      <GPressable onPress={() => onOpen(schedule)} accessibilityRole="button">
        <View style={styles.top}>
          <View style={styles.title}>
            <InkText weight="semibold">{schedule.label}</InkText>
            <InkText size="sm" tone="secondary" mono={!when.words}>{when.text}</InkText>
            {next ? <InkText size="sm" tone="secondary">{next}</InkText> : null}
          </View>
          <InkBadge tone="neutral">
            {schedule.kind.type === 'webhook'
              ? t('schedule.card.kindWebhook')
              : schedule.kind.type === 'routine'
                ? t('schedule.card.kindRoutine')
                : schedule.kind.type === 'member_reminder'
                  ? t('schedule.card.kindPrivate')
                  : t('schedule.card.kindPrompt')}
          </InkBadge>
        </View>
        <View style={styles.status}>
          {schedule.currently_running ? (
            <InkBadge tone="brand">{t('schedule.card.running')}</InkBadge>
          ) : (
            <InkText size="sm" tone="tertiary">
              {schedule.last_run
                ? t('schedule.card.lastRan', { when: formatScheduleTime(schedule.last_run) })
                : t('schedule.card.neverRun')}
            </InkText>
          )}
        </View>
      </GPressable>

      <View style={styles.actions}>
        {oneOff ? null : (
          <LabelledSwitch
            label={schedule.paused ? t('schedule.card.paused') : t('schedule.card.enabled')}
            checked={!schedule.paused}
            onChange={(on) => {
              void toggle();
              onSetPaused(schedule, !on);
            }}
          />
        )}
        {canRun ? (
          <InkButton
            variant="quiet"
            size="sm"
            icon="play"
            disabled={schedule.currently_running || schedule.paused}
            onPress={() => onRunNow(schedule)}
            style={styles.runNow}
          >
            {t('schedule.card.runNow')}
          </InkButton>
        ) : null}
      </View>
    </InkCard>
  );
});

const styles = StyleSheet.create({
  paused: { opacity: 0.6 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  title: { flex: 1, gap: Spacing.xs },
  status: { marginTop: Spacing.sm },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  runNow: { alignSelf: 'flex-start' },
});
