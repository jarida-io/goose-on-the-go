/**
 * ScheduleTab — the timed schedules: list, create, pause and resume, run now,
 * and each one's run history.
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkButton, InkEmptyState, InkNotice, InkSpinner, InkText } from '@jarida/ink/native';

import { CreateScheduleSheet } from '@/components/patterns/create-schedule-sheet';
import { ScheduleCard } from '@/components/patterns/schedule-card';
import { ScheduleRunsSheet } from '@/components/patterns/schedule-runs-sheet';
import { useServer } from '@/providers/server-provider';
import type { Schedule } from '@/services/types';
import { useSchedules } from '@/view-models/use-schedules';
import { Spacing } from '@/constants/spacing';

export function ScheduleTab() {
  const { t } = useTranslation();
  const { isScreenReal } = useServer();
  const real = isScreenReal('schedule');
  const { data, loading, error, actions } = useSchedules();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<Schedule | null>(null);

  return (
    <View style={styles.body}>
      <View style={styles.header}>
        <InkButton variant="primary" icon="plus" onPress={() => setCreating(true)}>
          {t('schedule.list.newSchedule')}
        </InkButton>
      </View>

      {real && data.live === 'poll' && data.schedules.length > 0 ? (
        <InkText size="sm" tone="tertiary">{t('schedule.list.polling')}</InkText>
      ) : null}

      {loading ? <InkSpinner label={t('schedule.list.loading')} /> : null}

      {error ? (
        <View style={styles.notice}>
          <InkNotice tone="danger">{error}</InkNotice>
          <InkButton variant="quiet" icon="refresh" onPress={actions.refresh}>
            {t('common.retry')}
          </InkButton>
        </View>
      ) : null}

      {/* A list that failed to load is unknown, not empty. */}
      {!loading && !error && data.schedules.length === 0 ? (
        <InkEmptyState icon="schedule" title={t('schedule.list.noSchedulesTitle')}>
          <InkText>{t('schedule.list.noSchedulesBody')}</InkText>
        </InkEmptyState>
      ) : null}

      {data.schedules.map((schedule) => (
        <ScheduleCard
          key={schedule.id}
          schedule={schedule}
          canRun={real}
          onOpen={setOpen}
          onSetPaused={actions.setPaused}
          onRunNow={actions.runNow}
        />
      ))}

      <CreateScheduleSheet open={creating} onClose={() => setCreating(false)} onCreate={actions.create} />
      <ScheduleRunsSheet schedule={open} onClose={() => setOpen(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md },
  header: { flexDirection: 'row', justifyContent: 'flex-end' },
  notice: { gap: Spacing.sm },
});
