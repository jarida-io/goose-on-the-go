/**
 * ScheduleCard — one cron or one-off schedule.
 *
 * The top of the card opens its run history; the switch and Run now sit below
 * it as siblings, not inside the same pressable, so a flip of the switch is
 * never also read as a tap on the card.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkBadge, InkButton, InkCard, InkSwitch, InkText } from '@jarida/ink/native';

import { GPressable } from '@/components/ui/g-pressable';
import { formatScheduleTime } from '@/models/schedule';
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
}

export const ScheduleCard = React.memo(function ScheduleCard({
  schedule,
  onOpen,
  onSetPaused,
  onRunNow,
  canRun,
}: ScheduleCardProps) {
  const { t } = useTranslation();
  // The next run when there is one, else when a one-off fires, else the cron itself.
  const when = schedule.next_run
    ? t('schedule.card.next', { when: formatScheduleTime(schedule.next_run) })
    : schedule.fire_at
      ? formatScheduleTime(schedule.fire_at)
      : schedule.cron;
  const mono = !schedule.next_run && !schedule.fire_at;

  return (
    <InkCard style={schedule.paused ? styles.paused : undefined}>
      <GPressable onPress={() => onOpen(schedule)} accessibilityRole="button">
        <View style={styles.top}>
          <View style={styles.title}>
            <InkText weight="semibold">{schedule.label}</InkText>
            <InkText size="sm" tone="secondary" mono={mono}>{when}</InkText>
          </View>
          <InkBadge tone="neutral">
            {schedule.kind.type === 'webhook' ? t('schedule.card.kindWebhook') : t('schedule.card.kindPrompt')}
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
        <InkSwitch
          label={schedule.paused ? t('schedule.card.paused') : t('schedule.card.enabled')}
          checked={!schedule.paused}
          onChange={(on) => {
            void toggle();
            onSetPaused(schedule, !on);
          }}
        />
        {canRun ? (
          <InkButton
            variant="quiet"
            icon="play"
            disabled={schedule.currently_running || schedule.paused}
            onPress={() => onRunNow(schedule)}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
});
