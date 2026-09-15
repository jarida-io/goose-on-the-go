/**
 * DevicesTab — Google-Home-style room-grouped device grid.
 *
 * Room filter tabs, color-coded device cards with toggle switches,
 * and "Add Pond device" button at bottom.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GIcon } from '@/components/ui/g-icon';
import { InkSwitch } from '@jarida/ink/native';
import { DEVICE_ROOMS, type Device } from '@/models/device';
import { Grey, JaridaPurple, AccentPurple, Brand } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';

const ROOM_TABS = ['All', 'Living Room', 'Bedroom', 'Entrance'];

/** Device card with color-coded toggle */
const DeviceCard = React.memo(function DeviceCard({ item }: { item: Device }) {
  const [on, setOn] = useState(true);
  return (
    <View style={styles.deviceCard}>
      <View style={styles.deviceCardTop}>
        <View style={[styles.deviceIconWrap, { backgroundColor: item.color + '18' }]}>
          <GIcon name={item.icon} size={17} color={on ? item.color : '#B5B5B5'} />
        </View>
        <InkSwitch checked={on} onChange={setOn} />
      </View>
      <Text style={styles.deviceLabel} numberOfLines={1}>{item.label}</Text>
      <Text style={styles.deviceDetail}>{item.detail}</Text>
    </View>
  );
});

export default function DevicesTab() {
  const router = useRouter();
  const [activeRoom, setActiveRoom] = useState('All');

  /** Filter rooms based on selected tab */
  const filteredRooms = activeRoom === 'All'
    ? DEVICE_ROOMS
    : DEVICE_ROOMS.filter((r) => r.name === activeRoom);

  /** Total device count */
  const totalDevices = DEVICE_ROOMS.reduce((sum, r) => sum + r.devices.length, 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Devices</Text>
          <Text style={styles.headerSubtitle}>{totalDevices} devices</Text>
        </View>
        <Pressable style={styles.manageBtn}>
          <Text style={styles.manageBtnText}>Manage</Text>
        </Pressable>
      </View>

      {/* Room filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
      >
        {ROOM_TABS.map((tab) => (
          <Pressable
            key={tab}
            style={[styles.roomTab, activeRoom === tab && styles.roomTabActive]}
            onPress={() => setActiveRoom(tab)}
          >
            <Text style={[styles.roomTabText, activeRoom === tab && styles.roomTabTextActive]}>
              {tab}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Room-grouped device grids */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {filteredRooms.map((room) => (
          <View key={room.name} style={styles.roomSection}>
            <Text style={styles.roomLabel}>{room.name.toUpperCase()}</Text>
            <View style={styles.deviceGrid}>
              {room.devices.map((d) => (
                <DeviceCard key={d.idx} item={d} />
              ))}
            </View>
          </View>
        ))}

        {/* Add Pond device button */}
        <Pressable
          style={styles.addDeviceBtn}
          onPress={() => router.push('/(stack)/pond-pairing')}
        >
          <GIcon name="plus" size={20} color={AccentPurple} />
          <Text style={styles.addDeviceText}>Add Pond device</Text>
        </Pressable>

        {/* Bottom spacer */}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Grey[50] },

  /* Header */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: Brand.white,
  },
  headerTitle: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Brand.charcoal,
  },
  headerSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[500],
    marginTop: 2,
  },
  manageBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Grey[200],
  },
  manageBtnText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Grey[700],
  },

  /* Room tabs */
  tabsRow: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: Brand.white,
    borderBottomWidth: 1,
    borderBottomColor: Grey[200],
  },
  roomTab: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
    borderRadius: Radii.pill,
    backgroundColor: Grey[100],
  },
  roomTabActive: {
    backgroundColor: AccentPurple,
  },
  roomTabText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Grey[600],
  },
  roomTabTextActive: {
    color: Brand.white,
  },

  /* Scroll */
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },

  /* Room section */
  roomSection: { marginBottom: Spacing.xl },
  roomLabel: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Grey[500],
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
  },
  deviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },

  /* Device card */
  deviceCard: {
    width: '47%',
    backgroundColor: Brand.white,
    borderRadius: Radii.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Grey[200],
  },
  deviceCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  deviceIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceLabel: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Brand.charcoal,
  },
  deviceDetail: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Grey[500],
    marginTop: 2,
  },

  /* Add device button */
  addDeviceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    borderRadius: Radii.xl,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: JaridaPurple[200],
    backgroundColor: JaridaPurple[50],
    marginBottom: Spacing.xl,
  },
  addDeviceText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: AccentPurple,
  },
});
