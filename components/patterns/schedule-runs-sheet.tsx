/** ScheduleRunsSheet — modal showing recent run history for one schedule. */

import React from 'react';
import { Modal, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GChip, type GChipVariant } from '@/components/ui/g-chip';
import { GButton } from '@/components/ui/g-button';
import { GSkeleton } from '@/components/ui/g-skeleton';
import { GEmptyState } from '@/components/ui/g-empty-state';
import { useScheduleRuns } from '@/view-models/use-schedule-runs';
import type { ScheduleRun } from '@/models/schedule';
import { formatRelativeTime } from '@/utils/format-time';
import { Brand, Grey } from '@/constants/colors';
import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';

export interface ScheduleRunsSheetProps {
  visible: boolean;
  onClose: () => void;
  scheduleId: string | null;
  scheduleLabel: string;
}

const STATUS_VARIANT: Record<ScheduleRun['status'], GChipVariant> = {
  running: 'primary',
  completed: 'success',
  failed: 'danger',
};

function RunRow({ run }: { run: ScheduleRun }) {
  const snippet = run.error ?? run.result;
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <GChip variant={STATUS_VARIANT[run.status]} size="sm">{run.status}</GChip>
        <Text style={styles.rowTime}>{formatRelativeTime(run.started_at)}</Text>
      </View>
      {snippet && (
        <Text style={styles.rowSnippet} numberOfLines={3}>{snippet}</Text>
      )}
      {run.duration_ms != null && (
        <Text style={styles.rowDuration}>{run.duration_ms}ms</Text>
      )}
    </View>
  );
}

export function ScheduleRunsSheet({ visible, onClose, scheduleId, scheduleLabel }: ScheduleRunsSheetProps) {
  const { runs, loading, error, refetch } = useScheduleRuns(scheduleId);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modal}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>{scheduleLabel}</Text>
          <GButton variant="ghost" size="sm" onPress={onClose}>Done</GButton>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {loading && (
            <View style={styles.skeletonStack}>
              {[0, 1, 2].map((i) => (
                <GSkeleton key={i} width="100%" height={64} borderRadius={Radii.md} />
              ))}
            </View>
          )}

          {!loading && error && (
            <GEmptyState
              icon="warn"
              title="Couldn't load run history"
              message={error}
              action={<GButton variant="secondary" onPress={refetch}>Try Again</GButton>}
            />
          )}

          {!loading && !error && runs.length === 0 && (
            <GEmptyState icon="schedule" title="No runs yet" message="This schedule hasn't fired yet." />
          )}

          {!loading && !error && runs.map((run) => <RunRow key={run.id} run={run} />)}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: Brand.white },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Grey[200],
  },
  title: {
    flex: 1,
    fontFamily: FontFamily.heading,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Brand.charcoal,
    marginRight: Spacing.sm,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  skeletonStack: { gap: Spacing.md },
  row: {
    borderWidth: 1,
    borderColor: Grey[200],
    borderRadius: Radii.md,
    padding: Spacing.md,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowTime: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Grey[500],
  },
  rowSnippet: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Grey[600],
    marginTop: Spacing.sm,
  },
  rowDuration: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Grey[400],
    marginTop: Spacing.xs,
  },
});
