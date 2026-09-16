/**
 * ScheduleScreen — tab switcher between time-based Schedules (cron/one-off,
 * backed by /schedules) and sensor-triggered Automations (backed by /rules).
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GTabs } from '@/components/ui/g-tabs';
import { ScheduleTab } from '@/components/patterns/schedule-tab';
import { AutomationsTab } from '@/components/patterns/automations-tab';
import { Grey } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

type ActiveTab = 'schedule' | 'automations';

export default function ScheduleScreen() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('schedule');

  return (
    <View style={styles.container}>
      <View style={styles.tabsWrap}>
        <GTabs
          tabs={[
            { key: 'schedule', label: 'Schedule' },
            { key: 'automations', label: 'Automations' },
          ]}
          activeKey={activeTab}
          onTabChange={(key) => setActiveTab(key as ActiveTab)}
          variant="solid"
        />
      </View>
      {activeTab === 'schedule' ? <ScheduleTab /> : <AutomationsTab />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Grey[50] },
  tabsWrap: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
});
