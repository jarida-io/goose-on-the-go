/** ScheduleTab — cron/one-off schedules: list, create, pause/resume, run-now, run history. */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { GButton } from '@/components/ui/g-button';
import { GSkeleton } from '@/components/ui/g-skeleton';
import { GEmptyState } from '@/components/ui/g-empty-state';
import { ScheduleCard } from '@/components/patterns/schedule-card';
import { CreateScheduleSheet } from '@/components/patterns/create-schedule-sheet';
import { ScheduleRunsSheet } from '@/components/patterns/schedule-runs-sheet';
import { useSchedules } from '@/view-models/use-schedules';
import { useServer } from '@/providers/server-provider';
import type { Schedule } from '@/models/schedule';
import { Brand } from '@/constants/colors';
import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';

function sortSchedules(schedules: Schedule[]): Schedule[] {
  return [...schedules].sort((a, b) => {
    if (a.next_run && b.next_run) return a.next_run.localeCompare(b.next_run);
    if (a.next_run) return -1;
    if (b.next_run) return 1;
    return a.label.localeCompare(b.label);
  });
}

export function ScheduleTab() {
  const router = useRouter();
  const { online } = useServer();
  const { schedules, loading, error, refetch, create, pause, resume, runNow } = useSchedules();
  const [createVisible, setCreateVisible] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const timeBasedSchedules = useMemo(
    () => sortSchedules(schedules.filter((s) => s.kind.type !== 'sensor_trigger')),
    [schedules],
  );

  const selected = timeBasedSchedules.find((s) => s.id === selectedId) ?? null;

  const handleTogglePause = (id: string, paused: boolean) => {
    (paused ? pause : resume)(id).catch(() => {});
  };

  const handleRunNow = (id: string) => {
    runNow(id).catch(() => {});
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Schedules</Text>
        <GButton variant="primary" size="sm" startIcon="plus" onPress={() => setCreateVisible(true)}>
          New
        </GButton>
      </View>

      {!online && (
        <GEmptyState
          icon="device"
          title="No desktop connected"
          message="Scan the QR code on Goose In A Pond desktop to manage schedules."
          action={
            <GButton variant="primary" onPress={() => router.push('/(stack)/connect-desktop')}>
              Connect Desktop
            </GButton>
          }
        />
      )}

      {online && loading && (
        <View style={styles.skeletonStack}>
          {[0, 1, 2].map((i) => (
            <GSkeleton key={i} width="100%" height={92} borderRadius={Radii.xl} />
          ))}
        </View>
      )}

      {online && !loading && error && (
        <GEmptyState
          icon="warn"
          title="Couldn't load schedules"
          message={error}
          action={<GButton variant="secondary" onPress={refetch}>Try Again</GButton>}
        />
      )}

      {online && !loading && !error && timeBasedSchedules.length === 0 && (
        <GEmptyState
          icon="schedule"
          title="No schedules yet"
          message="Create a schedule to have the agent run prompts on a timer."
          action={
            <GButton variant="primary" startIcon="plus" onPress={() => setCreateVisible(true)}>
              New Schedule
            </GButton>
          }
        />
      )}

      {online && !loading && !error && timeBasedSchedules.map((schedule) => (
        <ScheduleCard
          key={schedule.id}
          schedule={schedule}
          onTogglePause={handleTogglePause}
          onRunNow={handleRunNow}
          onPress={setSelectedId}
        />
      ))}

      <View style={{ height: 32 }} />

      <CreateScheduleSheet
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        onSubmit={create}
      />
      <ScheduleRunsSheet
        visible={selected != null}
        onClose={() => setSelectedId(null)}
        scheduleId={selected?.id ?? null}
        scheduleLabel={selected?.label ?? ''}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  headerTitle: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Brand.charcoal,
  },
  skeletonStack: { gap: Spacing.md },
});
