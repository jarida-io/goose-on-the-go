/**
 * MemoriesScreen — Categorized memory cards with icons, pin, and delete.
 *
 * Category filter tabs, memory cards with visual indicators.
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
import { SAMPLE_MEMORIES, type MemoryFragment, type MemoryCategory } from '@/models/memory';
import { Grey, AccentPurple, Brand, Semantic } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';

const CATEGORY_TABS: Array<MemoryCategory | 'All'> = ['All', 'Preference', 'Habit', 'Person', 'Reminder'];

const CATEGORY_COLORS: Record<MemoryCategory, string> = {
  Preference: AccentPurple,
  Habit: Semantic.info,
  Person: Semantic.success,
  Reminder: Semantic.warning,
};

/** Memory card */
const MemoryCard = React.memo(function MemoryCard({
  item,
  onPin,
  onDelete,
}: {
  item: MemoryFragment;
  onPin: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const catColor = CATEGORY_COLORS[item.category];
  return (
    <View style={styles.memoryCard}>
      <View style={styles.memoryHeader}>
        <View style={{ marginRight: Spacing.sm }}>
          <GIcon name={item.icon} size={16} color={catColor} />
        </View>
        <View style={[styles.categoryBadge, { backgroundColor: catColor + '18' }]}>
          <Text style={[styles.categoryText, { color: catColor }]}>{item.category}</Text>
        </View>
        <View style={styles.memoryActions}>
          <Pressable onPress={() => onPin(item.id)} style={styles.actionBtn}>
            <GIcon name={item.pinned ? 'check' : 'logs'} size={14} color={item.pinned ? AccentPurple : Grey[400]} />
          </Pressable>
          <Pressable onPress={() => onDelete(item.id)} style={styles.actionBtn}>
            <GIcon name="trash" size={14} color={Grey[400]} />
          </Pressable>
        </View>
      </View>
      <Text style={styles.memoryText}>{item.text}</Text>
      <Text style={styles.memoryTime}>{item.time}</Text>
    </View>
  );
});

export default function MemoriesScreen() {
  const [memories, setMemories] = useState(SAMPLE_MEMORIES);
  const [activeCategory, setActiveCategory] = useState<MemoryCategory | 'All'>('All');

  const filtered = activeCategory === 'All'
    ? memories
    : memories.filter((m) => m.category === activeCategory);

  const handlePin = useCallback((id: number) => {
    setMemories((prev) =>
      prev.map((m) => (m.id === id ? { ...m, pinned: !m.pinned } : m)),
    );
  }, []);

  const handleDelete = useCallback((id: number) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: MemoryFragment }) => (
      <MemoryCard item={item} onPin={handlePin} onDelete={handleDelete} />
    ),
    [handlePin, handleDelete],
  );

  const keyExtractor = useCallback((item: MemoryFragment) => String(item.id), []);

  return (
    <View style={styles.container}>
      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
      >
        {CATEGORY_TABS.map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeCategory === tab && styles.tabActive]}
            onPress={() => setActiveCategory(tab)}
          >
            <Text style={[styles.tabText, activeCategory === tab && styles.tabTextActive]}>
              {tab}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Memory list */}
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

  /* Memory card */
  memoryCard: {
    backgroundColor: Brand.white,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Grey[200],
    marginBottom: Spacing.md,
  },
  memoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  categoryBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  categoryText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  memoryActions: {
    flexDirection: 'row',
    marginLeft: 'auto',
    gap: Spacing.sm,
  },
  actionBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoryText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Brand.charcoal,
    lineHeight: FontSize.base * 1.5,
  },
  memoryTime: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Grey[400],
    marginTop: Spacing.sm,
  },
});
