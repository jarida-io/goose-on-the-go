/**
 * TabLayout — 4-tab bottom navigation with floating glass pill style.
 *
 * Tabs: Home, Chat, Devices, You (profile)
 * Design: floating pill bar with blur backdrop, purple active indicator.
 */

import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';

import { HapticTab } from '@/components/haptic-tab';
import { GIcon } from '@/components/ui/g-icon';
import { AccentPurple, Grey, Brand } from '@/constants/colors';

import type { IconName } from '@/constants/icons';

/** Tab icon with active pill indicator */
function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return (
    <View style={styles.iconWrap}>
      {focused && <View style={styles.activePill} />}
      <GIcon
        name={name}
        size={22}
        color={focused ? Brand.white : Grey[400]}
      />
    </View>
  );
}

/**
 * Custom tab bar background with glass morphism.
 * Uses a semi-transparent white background for the frosted effect.
 * expo-blur can be added later for true blur on iOS.
 */
function TabBarBackground() {
  return <View style={[StyleSheet.absoluteFill, styles.glassBackground]} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarShowLabel: true,
        tabBarActiveTintColor: AccentPurple,
        tabBarInactiveTintColor: Grey[400],
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
        tabBarBackground: TabBarBackground,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="home" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="chat" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="devices"
        options={{
          title: 'Devices',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="device" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'You',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="profile" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 16,
    left: 12,
    right: 12,
    height: 64,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderTopWidth: 0,
    elevation: 8,
    shadowColor: '#1C1C1C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    paddingBottom: 0,
  },
  glassBackground: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 26,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: -2,
  },
  iconWrap: {
    width: 44,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    overflow: 'hidden',
  },
  activePill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: AccentPurple,
    borderRadius: 15,
  },
});
