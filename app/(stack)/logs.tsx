/**
 * ActivityLogsScreen — Filter tabs (all/action/mcp/system/error),
 * icon-decorated log entries with timestamps.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ScrollView,
} from 'react-native';

import { GIcon } from '@/components/ui/g-icon';
import { SAMPLE_LOGS, type LogEntry, type LogType } from '@/models/log';
import { Grey, AccentPurple, Brand, Semantic } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';

const LOG_TABS: Array<LogType | 'all'> = ['all', 'action', 'mcp', 'system', 'error'];

const LEVEL_COLORS: Record<string, string> = {
  info: Grey[600],
  warn: Semantic.warning,
  error: Semantic.danger,
};

/** Log row */
const LogRow = React.memo(function LogRow({ item }: { item: LogEntry }) {
  const levelColor = LEVEL_COLORS[item.level] ?? Grey[600];
  return (
    <View style={styles.logRow}>
      <View style={{ marginRight: Spacing.md, marginTop: 2 }}>
        <GIcon name={item.icon} size={16} color={levelColor} />
      </View>
      <View style={styles.logBody}>
        <Text style={[styles.logText, { color: levelColor === Semantic.danger ? Semantic.danger : Brand.charcoal }]}>
          {item.text}
        </Text>
        <View style={styles.logMeta}>
          <Text style={styles.logTime}>{item.time}</Text>
          <View style={[styles.typeBadge, { backgroundColor: levelColor + '18' }]}>
            <Text style={[styles.typeText, { color: levelColor }]}>{item.type}</Text>
          </View>
        </View>
      </View>
    </View>
  );
});

export default function ActivityLogsScreen() {
  const [activeTab, setActiveTab] = useState<LogType | 'all'>('all');

  const filtered = activeTab === 'all'
    ? SAMPLE_LOGS
    : SAMPLE_LOGS.filter((l) => l.type === activeTab);

  const renderItem = useCallback(
    ({ item }: { item: LogEntry }) => <LogRow item={item} />,
    [],
  );

  const keyExtractor = useCallback(
    (_: LogEntry, index: number) => String(index),
    [],
  );

  return (
    <View style={styles.container}>
      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsRow}
      >
        {LOG_TABS.map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Log list */}
      <FlatList
        data={filtered}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Grey[50] },

  /* Tabs */
  // Pins this ScrollView's own height to its content instead of letting it
  // compete for leftover flex space with the list below — without this,
  // filtering to a category with fewer results frees up vertical space
  // that gets redistributed into the tab pills instead of staying blank,
  // stretching them tall.
  tabsScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  tabsRow: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: Brand.white,
    borderBottomWidth: 1,
    borderBottomColor: Grey[200],
  },
  tab: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
    borderRadius: Radii.pill,
    backgroundColor: Grey[100],
  },
  tabActive: { backgroundColor: AccentPurple },
  tabText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Grey[600],
  },
  tabTextActive: { color: Brand.white },

  /* List */
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingBottom: Spacing['3xl'],
  },

  /* Log row */
  logRow: {
    flexDirection: 'row',
    backgroundColor: Brand.white,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Grey[200],
    marginBottom: Spacing.sm,
  },
  logBody: { flex: 1 },
  logText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    lineHeight: FontSize.base * 1.5,
  },
  logMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  logTime: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Grey[400],
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  typeText: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    fontWeight: FontWeight.bold,
  },
});
