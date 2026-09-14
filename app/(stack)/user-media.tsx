/**
 * UserMediaScreen — Photo grid, video grid, and analysed items tab.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
} from 'react-native';

import { GIcon } from '@/components/ui/g-icon';
import { Grey, AccentPurple, Brand, Semantic } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 4;
const GRID_COLS = 3;
const TILE_SIZE = (SCREEN_WIDTH - Spacing.lg * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

type MediaTab = 'photos' | 'videos' | 'analysed';

const TABS: Array<{ key: MediaTab; label: string }> = [
  { key: 'photos', label: 'Photos' },
  { key: 'videos', label: 'Videos' },
  { key: 'analysed', label: 'Analysed' },
];

/** Placeholder colors for mock media tiles */
const PHOTO_COLORS = [
  '#FFD6D6', '#D6E4FF', '#D6FFD6', '#FFECD6', '#E6D6FF',
  '#D6FFF5', '#FFD6F5', '#FFF5D6', '#D6D6FF', '#D6FFEC',
  '#FFE0D6', '#D6F5FF',
];
const VIDEO_COLORS = [
  '#1C1C1C', '#2A2A2A', '#333333', '#1C1C2A', '#2A1C33',
  '#1C2A2A',
];

/** Media tile placeholder */
function MediaTile({ color, label, showPlay }: { color: string; label: string; showPlay?: boolean }) {
  return (
    <View style={[styles.tile, { backgroundColor: color }]}>
      {showPlay && <View style={{ marginBottom: 4 }}><GIcon name="play" size={20} color="#fff" /></View>}
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

export default function UserMediaScreen() {
  const [activeTab, setActiveTab] = useState<MediaTab>('photos');

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabsRow}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'photos' && (
          <View style={styles.grid}>
            {PHOTO_COLORS.map((c, i) => (
              <MediaTile key={i} color={c} label={`IMG_${100 + i}`} />
            ))}
          </View>
        )}

        {activeTab === 'videos' && (
          <View style={styles.grid}>
            {VIDEO_COLORS.map((c, i) => (
              <MediaTile key={i} color={c} label={`VID_${200 + i}`} showPlay />
            ))}
          </View>
        )}

        {activeTab === 'analysed' && (
          <View style={styles.analysedList}>
            {[
              { label: 'Kitchen shelf photo', result: 'Identified: cereal, milk, bread, vitamins', time: '2h ago', icon: 'photo' },
              { label: 'Package label scan', result: 'Tracking: 1Z999...4321 \u2014 arriving today', time: '1d ago', icon: 'package' },
              { label: 'Pet cam screenshot', result: 'Goose detected: golden retriever, resting', time: '3d ago', icon: 'activity' },
            ].map((item, i) => (
              <View key={i} style={styles.analysedCard}>
                <View style={{ marginRight: Spacing.md }}>
                  <GIcon name={item.icon} size={22} color={AccentPurple} />
                </View>
                <View style={styles.analysedInfo}>
                  <Text style={styles.analysedLabel}>{item.label}</Text>
                  <Text style={styles.analysedResult}>{item.result}</Text>
                  <Text style={styles.analysedTime}>{item.time}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Grey[50] },

  /* Tabs */
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: Brand.white,
    borderBottomWidth: 1,
    borderBottomColor: Grey[200],
  },
  tab: {
    flex: 1,
    alignItems: 'center',
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

  scroll: { paddingTop: Spacing.md },

  /* Grid */
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.lg,
    gap: GRID_GAP,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontFamily: FontFamily.mono,
    fontSize: 8,
    color: Grey[500],
  },

  /* Analysed list */
  analysedList: {
    paddingHorizontal: Spacing.lg,
  },
  analysedCard: {
    flexDirection: 'row',
    backgroundColor: Brand.white,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Grey[200],
    marginBottom: Spacing.md,
  },
  analysedInfo: { flex: 1 },
  analysedLabel: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Brand.charcoal,
  },
  analysedResult: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[600],
    lineHeight: FontSize.sm * 1.5,
    marginTop: 4,
  },
  analysedTime: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Grey[400],
    marginTop: 4,
  },
});
