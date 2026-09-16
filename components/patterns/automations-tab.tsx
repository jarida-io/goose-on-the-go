/** AutomationsTab — sensor-triggered rules: list, create, pause/resume, run-now. */

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { GButton } from '@/components/ui/g-button';
import { GSkeleton } from '@/components/ui/g-skeleton';
import { GEmptyState } from '@/components/ui/g-empty-state';
import { AutomationCard } from '@/components/patterns/automation-card';
import { CreateAutomationSheet } from '@/components/patterns/create-automation-sheet';
import { useRules } from '@/view-models/use-rules';
import { useServer } from '@/providers/server-provider';
import { Brand } from '@/constants/colors';
import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';

export function AutomationsTab() {
  const router = useRouter();
  const { online } = useServer();
  const { rules, loading, error, refetch, create, pause, resume } = useRules();
  const [createVisible, setCreateVisible] = useState(false);

  const handleTogglePause = (id: string, paused: boolean) => {
    (paused ? pause : resume)(id).catch(() => {});
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Automations</Text>
        <GButton variant="primary" size="sm" startIcon="plus" onPress={() => setCreateVisible(true)}>
          New
        </GButton>
      </View>

      {!online && (
        <GEmptyState
          icon="bolt"
          title="No desktop connected"
          message="Scan the QR code on Goose In A Pond desktop to manage automations."
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
          title="Couldn't load automations"
          message={error}
          action={<GButton variant="secondary" onPress={refetch}>Try Again</GButton>}
        />
      )}

      {online && !loading && !error && rules.length === 0 && (
        <GEmptyState
          icon="bolt"
          title="No automations yet"
          message="Create a rule to trigger the agent from sensors and devices."
          action={
            <GButton variant="primary" startIcon="plus" onPress={() => setCreateVisible(true)}>
              New Automation
            </GButton>
          }
        />
      )}

      {online && !loading && !error && rules.map((rule) => (
        <AutomationCard
          key={rule.id}
          rule={rule}
          onTogglePause={handleTogglePause}
        />
      ))}

      <View style={{ height: 32 }} />

      <CreateAutomationSheet
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        onSubmit={create}
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
