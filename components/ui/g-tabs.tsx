/**
 * GTabs — Horizontal tab bar with underlined and solid variants.
 *
 * Uses a horizontal ScrollView to accommodate overflow when tabs
 * exceed the screen width.
 *
 * @example
 *   <GTabs
 *     tabs={[
 *       { key: 'all', label: 'All', count: 12 },
 *       { key: 'active', label: 'Active' },
 *     ]}
 *     activeKey={activeTab}
 *     onTabChange={setActiveTab}
 *   />
 */

import React, { useCallback } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Brand, Grey, AccentPurple } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Radii } from '@/constants/radii';
import { Spacing } from '@/constants/spacing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GTabItem {
  key: string;
  label: string;
  count?: number;
}

export type GTabsVariant = 'underlined' | 'solid';

export interface GTabsProps {
  tabs: GTabItem[];
  activeKey: string;
  onTabChange: (key: string) => void;
  variant?: GTabsVariant;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GTabs({
  tabs,
  activeKey,
  onTabChange,
  variant = 'underlined',
}: GTabsProps) {
  const isUnderlined = variant === 'underlined';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[
        styles.scrollContent,
        !isUnderlined && styles.solidContainer,
      ]}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;

        return (
          <TabItem
            key={tab.key}
            tab={tab}
            isActive={isActive}
            isUnderlined={isUnderlined}
            onPress={onTabChange}
          />
        );
      })}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// TabItem — extracted so each item is independently memoizable
// ---------------------------------------------------------------------------

interface TabItemProps {
  tab: GTabItem;
  isActive: boolean;
  isUnderlined: boolean;
  onPress: (key: string) => void;
}

const TabItem = React.memo(function TabItem({
  tab,
  isActive,
  isUnderlined,
  onPress,
}: TabItemProps) {
  const handlePress = useCallback(() => onPress(tab.key), [onPress, tab.key]);

  if (isUnderlined) {
    return (
      <Pressable onPress={handlePress} style={styles.underlinedTab}>
        <Text
          style={[
            styles.tabLabel,
            isActive ? styles.activeUnderlinedLabel : styles.inactiveLabel,
          ]}
        >
          {tab.label}
          {tab.count != null ? ` (${tab.count})` : ''}
        </Text>
        {isActive && <View style={styles.underlineBar} />}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.solidTab,
        isActive && styles.activeSolidTab,
      ]}
    >
      <Text
        style={[
          styles.tabLabel,
          isActive ? styles.activeSolidLabel : styles.inactiveLabel,
        ]}
      >
        {tab.label}
        {tab.count != null ? ` (${tab.count})` : ''}
      </Text>
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  solidContainer: {
    backgroundColor: Grey[100],
    borderRadius: Radii.md,
    padding: 2,
  },

  // Underlined variant
  underlinedTab: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  underlineBar: {
    position: 'absolute',
    bottom: 0,
    left: Spacing.md,
    right: Spacing.md,
    height: 2,
    backgroundColor: AccentPurple,
    borderRadius: 1,
  },

  // Solid variant
  solidTab: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.md,
  },
  activeSolidTab: {
    backgroundColor: AccentPurple,
  },

  // Text
  tabLabel: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  activeUnderlinedLabel: {
    color: AccentPurple,
  },
  activeSolidLabel: {
    color: Brand.white,
  },
  inactiveLabel: {
    color: Grey[500],
  },
});
