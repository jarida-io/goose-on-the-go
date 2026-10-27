/**
 * ScheduleDetailScreen — one schedule as the Pond has it, opened from its
 * card or from a notification about it.
 *
 * Shows what it runs, when (in words and as the cron the Pond keeps), its
 * zone, whether it is on, its next and last run, and its recent runs with what
 * each said or why it failed. Edit, pause and resume, run now and delete are
 * here; each change is the Pond's answer, not a guess, and a refusal says why.
 *
 * Delete is kept apart from the rest, at the foot of the screen below the
 * runs: it is the one action that cannot be taken back, and sitting in the
 * same wrapped row as Edit it read as a stray.
 */

import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  InkBadge,
  InkButton,
  InkCard,
  InkNotice,
  InkSpinner,
  InkText,
  inkText,
  useInkTheme,
} from '@jarida/ink/native';

import { LabelledSwitch } from '@/components/patterns/labelled-switch';
import { ScheduleFormSheet } from '@/components/patterns/schedule-form-sheet';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  deviceTimeZone,
  describeWhen,
  formatScheduleTime,
  isOneOff,
  linkedScheduleId,
  promptOf,
  runStatus,
} from '@/models/schedule';
import { useServer } from '@/providers/server-provider';
import { toggle } from '@/services/haptics';
import type { ScheduleRun } from '@/services/types';
import { useScheduleDetail } from '@/view-models/use-schedule-detail';
import type { ThemeColors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

/**
 * A run's result is what the agent said, and an error is why it did not. A
 * skipped run's result is why it was skipped; a late one says when it was due.
 */
const RunRow = React.memo(function RunRow({ run }: { run: ScheduleRun }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const theme = useInkTheme();
  const { tone, key } = runStatus(run);
  const snippet = run.error ?? run.result;
  const snippetText = inkText(theme, { size: 'sm', color: theme.color.textSecondary });
  return (
    <View style={styles.run}>
      <View style={styles.runTop}>
        <InkBadge tone={tone}>{t(key)}</InkBadge>
        <InkText size="sm" tone="tertiary">{formatScheduleTime(run.started_at)}</InkText>
      </View>
      {run.caught_up_from ? (
        <InkText size="sm" tone="secondary">
          {t('schedule.runs.caughtUp', { when: formatScheduleTime(run.caught_up_from) })}
        </InkText>
      ) : null}
      {/* A result is a whole answer; ten of them in full would bury the list. */}
      {snippet ? (
        <Text style={snippetText.style} numberOfLines={6} selectable>
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

/** One labelled line of the schedule's facts. */
function Fact({ label, children, mono }: { label: string; children: string; mono?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.fact}>
      <InkText size="sm" tone="tertiary">{label}</InkText>
      <InkText mono={mono}>{children}</InkText>
    </View>
  );
}

export default function ScheduleDetailScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { isScreenReal } = useServer();
  const real = isScreenReal('schedule');
  const params = useLocalSearchParams<{ id?: string }>();
  const id = linkedScheduleId(params.id) ?? '';
  const { schedule, loading, missing, error, failed, notice, runs, actions } = useScheduleDetail(id);
  const [editing, setEditing] = useState(false);
  const [phoneZone] = useState(deviceTimeZone);

  const confirmDelete = () => {
    if (!schedule) return;
    Alert.alert(t('schedule.detail.deleteTitle'), t('schedule.detail.deleteBody', { name: schedule.label }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('schedule.detail.delete'),
        style: 'destructive',
        onPress: () => {
          void actions.remove().then((gone) => {
            if (gone) router.back();
          });
        },
      },
    ]);
  };

  if (!schedule) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
        {loading ? <InkSpinner label={t('schedule.detail.loading')} /> : null}
        {error || failed ? (
          <View style={styles.gap}>
            <InkNotice tone="danger">{error ?? t('schedule.detail.failed')}</InkNotice>
            <InkButton variant="quiet" icon="refresh" onPress={actions.refresh}>
              {t('common.retry')}
            </InkButton>
          </View>
        ) : null}
        {!loading && !error && !failed && (missing || !id) ? (
          <InkNotice tone="warning">{t('schedule.errors.gone')}</InkNotice>
        ) : null}
      </ScrollView>
    );
  }

  const when = describeWhen(schedule, phoneZone);
  const prompt = promptOf(schedule);
  const oneOff = isOneOff(schedule);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.gap}>
        <InkText size="xl" weight="semibold">{schedule.label}</InkText>
        {schedule.currently_running ? <InkBadge tone="brand">{t('schedule.card.running')}</InkBadge> : null}
      </View>

      {notice === 'saved' ? <InkNotice tone="success">{t('schedule.detail.saved')}</InkNotice> : null}
      {notice === 'runStarted' ? <InkNotice tone="success">{t('schedule.detail.runStarted')}</InkNotice> : null}
      {error ? <InkNotice tone="danger">{error}</InkNotice> : null}

      <InkCard>
        <View style={styles.gap}>
          {prompt != null ? (
            <Fact label={t('schedule.detail.prompt')}>{prompt}</Fact>
          ) : (
            <Fact label={t('schedule.detail.webhook')}>{t('schedule.detail.webhookNote')}</Fact>
          )}
          <Fact label={t('schedule.detail.when')} mono={!when.words}>{when.text}</Fact>
          {oneOff ? null : (
            <Fact label={t('schedule.detail.cron')} mono>
              {schedule.cron}
            </Fact>
          )}
          <Fact label={t('schedule.detail.timezone')}>{schedule.timezone}</Fact>
          <Fact label={t('schedule.detail.nextRun')}>
            {schedule.next_run ? formatScheduleTime(schedule.next_run) : t('schedule.detail.notScheduled')}
          </Fact>
          <Fact label={t('schedule.detail.lastRun')}>
            {schedule.last_run ? formatScheduleTime(schedule.last_run) : t('schedule.detail.never')}
          </Fact>
        </View>
      </InkCard>

      <InkCard>
        <View style={styles.gap}>
          {oneOff ? (
            <InkText size="sm" tone="tertiary">{t('schedule.detail.oneOffNoPause')}</InkText>
          ) : (
            <LabelledSwitch
              label={schedule.paused ? t('schedule.detail.paused') : t('schedule.detail.enabled')}
              checked={!schedule.paused}
              onChange={(on) => {
                void toggle();
                void actions.setPaused(!on);
              }}
            />
          )}
          <View style={styles.buttons}>
            <InkButton variant="quiet" icon="edit" block style={styles.button} onPress={() => setEditing(true)}>
              {t('schedule.detail.edit')}
            </InkButton>
            {real ? (
              <InkButton
                variant="quiet"
                icon="play"
                block
                style={styles.button}
                disabled={schedule.currently_running || schedule.paused}
                onPress={actions.runNow}
              >
                {t('schedule.card.runNow')}
              </InkButton>
            ) : null}
          </View>
        </View>
      </InkCard>

      <View style={styles.gap}>
        <InkText weight="semibold">{t('schedule.runs.title')}</InkText>
        {runs.loading ? <InkSpinner label={t('schedule.runs.title')} /> : null}
        {runs.error || runs.failed ? (
          <InkNotice tone="danger">{runs.error ?? t('schedule.runs.failed')}</InkNotice>
        ) : null}
        {!runs.loading && !runs.error && !runs.failed && runs.data.runs.length === 0 ? (
          <InkText tone="secondary">{t('schedule.runs.none')}</InkText>
        ) : null}
        {runs.data.runs.map((run) => (
          <RunRow key={run.id} run={run} />
        ))}
      </View>

      <View style={styles.dangerZone}>
        <InkButton variant="danger" icon="trash" block onPress={confirmDelete}>
          {t('schedule.detail.delete')}
        </InkButton>
      </View>

      <ScheduleFormSheet
        open={editing}
        onClose={() => setEditing(false)}
        schedule={schedule}
        onUpdate={actions.update}
      />
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    scroll: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing['4xl'] },
    gap: { gap: Spacing.sm },
    fact: { gap: Spacing.xs },
    buttons: { flexDirection: 'row', gap: Spacing.sm },
    // Edit and Run now split the row evenly; Edit alone fills it.
    button: { flex: 1 },
    dangerZone: {
      marginTop: Spacing.lg,
      paddingTop: Spacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    run: {
      gap: Spacing.xs,
      paddingVertical: Spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    runTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  });
