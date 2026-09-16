/**
 * ScheduleScreen — what the Pond does on a clock, and what it does when a
 * sensor reports (issue #14).
 *
 * Two tabs rather than one list. The Pond keeps both in its scheduler, but a
 * schedule has a next run and a Run now, and a rule has a trigger and a
 * cooldown instead; shown together, each card would be missing half of what
 * the other says. See `models/schedule.ts` for the rest of that decision.
 */

import React, { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkSegmented } from '@jarida/ink/native';

import { AutomationsTab } from '@/components/patterns/automations-tab';
import { ScheduleTab } from '@/components/patterns/schedule-tab';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { selectionTick } from '@/services/haptics';
import type { ThemeColors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

type Tab = 'schedules' | 'automations';

export default function ScheduleScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const [tab, setTab] = useState<Tab>('schedules');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <InkSegmented
        label={t('schedule.tabs.label')}
        value={tab}
        options={[
          { value: 'schedules', label: t('schedule.tabs.schedules') },
          { value: 'automations', label: t('schedule.tabs.automations') },
        ]}
        onChange={(next) => {
          void selectionTick();
          setTab(next);
        }}
      />
      {tab === 'schedules' ? <ScheduleTab /> : <AutomationsTab />}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    scroll: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing['4xl'] },
  });
