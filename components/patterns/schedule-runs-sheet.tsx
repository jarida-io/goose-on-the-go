/**
 * ScheduleRunsSheet — the last few runs of one schedule, from its card.
 *
 * A run's result is what the agent said, and an error is why it did not; a
 * failed run shows its error rather than its (empty) result.
 */

import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkBadge, InkNotice, InkSheet, InkSpinner, InkText } from '@jarida/ink/native';
import type { InkTone } from '@jarida/ink';

import { formatScheduleTime } from '@/models/schedule';
import { useScheduleRuns } from '@/view-models/use-schedule-runs';
import type { Schedule, ScheduleRun } from '@/services/types';
import type { TranslationKey } from '@/services/i18n';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

export interface ScheduleRunsSheetProps {
  /** The schedule whose history is open, or null when the sheet is closed. */
  schedule: Schedule | null;
  onClose: () => void;
}

function status(run: ScheduleRun): { tone: InkTone; key: TranslationKey } {
  switch (run.status) {
    case 'running':
      return { tone: 'brand', key: 'schedule.runs.statusRunning' };
    case 'completed':
      return { tone: 'success', key: 'schedule.runs.statusCompleted' };
    case 'failed':
      return { tone: 'danger', key: 'schedule.runs.statusFailed' };
  }
}

const RunRow = React.memo(function RunRow({ run }: { run: ScheduleRun }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const { tone, key } = status(run);
  const snippet = run.error ?? run.result;
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <InkBadge tone={tone}>{t(key)}</InkBadge>
        <InkText size="sm" tone="tertiary">{formatScheduleTime(run.started_at)}</InkText>
      </View>
      {snippet ? <InkText size="sm" tone="secondary">{snippet}</InkText> : null}
      {run.duration_ms != null ? (
        <InkText size="xs" tone="tertiary" mono>
          {t('schedule.runs.duration', { ms: run.duration_ms })}
        </InkText>
      ) : null}
    </View>
  );
});

export function ScheduleRunsSheet({ schedule, onClose }: ScheduleRunsSheetProps) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const { data, loading, error } = useScheduleRuns(schedule?.id ?? null);

  return (
    <InkSheet open={schedule != null} onClose={onClose} title={schedule?.label ?? t('schedule.runs.title')}>
      <ScrollView contentContainerStyle={styles.content}>
        <InkText weight="semibold">{t('schedule.runs.title')}</InkText>
        {loading ? <InkSpinner label={t('schedule.runs.title')} /> : null}
        {error ? <InkNotice tone="danger">{error}</InkNotice> : null}
        {!loading && !error && data.runs.length === 0 ? (
          <InkText tone="secondary">{t('schedule.runs.none')}</InkText>
        ) : null}
        {data.runs.map((run) => (
          <RunRow key={run.id} run={run} />
        ))}
      </ScrollView>
    </InkSheet>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    content: { gap: Spacing.md, paddingBottom: Spacing['2xl'] },
    row: {
      gap: Spacing.xs,
      paddingVertical: Spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  });
