/**
 * ScheduleRunsSheet — the last few runs of one schedule, from its card.
 *
 * A run's result is what the agent said, and an error is why it did not; a
 * failed run shows its error rather than its (empty) result.
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkBadge, InkNotice, InkSheet, InkSpinner, InkText, inkText, useInkTheme } from '@jarida/ink/native';
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
  const theme = useInkTheme();
  const { tone, key } = status(run);
  const snippet = run.error ?? run.result;
  const snippetText = inkText(theme, { size: 'sm', color: theme.color.textSecondary });
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <InkBadge tone={tone}>{t(key)}</InkBadge>
        <InkText size="sm" tone="tertiary">{formatScheduleTime(run.started_at)}</InkText>
      </View>
      {/* A result is a whole answer; ten of them in full would bury the list. */}
      {snippet ? (
        <Text style={snippetText.style} numberOfLines={4}>
          {snippet}
        </Text>
      ) : null}
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
  const { height } = useWindowDimensions();
  const { data, loading, error, failed } = useScheduleRuns(schedule?.id ?? null);

  return (
    <InkSheet open={schedule != null} onClose={onClose} title={schedule?.label ?? t('schedule.runs.title')}>
      {/* `InkSheet` has no height limit of its own, and a sheet taller than the
          window covers it with no backdrop left to tap. */}
      <ScrollView style={{ maxHeight: height * 0.7 }} contentContainerStyle={styles.content}>
        <InkText weight="semibold">{t('schedule.runs.title')}</InkText>
        {loading ? <InkSpinner label={t('schedule.runs.title')} /> : null}
        {error || failed ? <InkNotice tone="danger">{error ?? t('schedule.runs.failed')}</InkNotice> : null}
        {!loading && !error && !failed && data.runs.length === 0 ? (
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
