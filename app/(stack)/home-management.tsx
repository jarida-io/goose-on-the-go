/**
 * HomeManagementScreen — Room list with rename/remove, Pond device list.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';

import { GIcon } from '@/components/ui/g-icon';
import { Grey, JaridaPurple, AccentPurple, Brand, Semantic } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';

interface RoomItem {
  id: string;
  name: string;
  deviceCount: number;
  icon: string;
}

interface PondDevice {
  id: string;
  name: string;
  status: 'online' | 'offline';
  firmware: string;
}

const ROOMS: RoomItem[] = [
  { id: '1', name: 'Living Room', deviceCount: 3, icon: 'home' },
  { id: '2', name: 'Bedroom', deviceCount: 2, icon: 'moon' },
  { id: '3', name: 'Entrance', deviceCount: 2, icon: 'lock' },
  { id: '4', name: 'Kitchen', deviceCount: 1, icon: 'light' },
];

const POND_DEVICES: PondDevice[] = [
  { id: '1', name: 'Pond Hub (Main)', status: 'online', firmware: 'v2.4.1' },
  { id: '2', name: 'Pond Mini (Bedroom)', status: 'online', firmware: 'v2.4.0' },
];

export default function HomeManagementScreen() {
  const router = useRouter();
  const [rooms, setRooms] = useState(ROOMS);

  const handleRemoveRoom = useCallback((id: string) => {
    Alert.alert('Remove Room', 'Are you sure you want to remove this room?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => setRooms((prev) => prev.filter((r) => r.id !== id)),
      },
    ]);
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Rooms */}
      <Text style={styles.sectionLabel}>ROOMS</Text>
      {rooms.map((room) => (
        <View key={room.id} style={styles.roomCard}>
          <View style={{ marginRight: Spacing.md }}>
            <GIcon name={room.icon} size={20} color={AccentPurple} />
          </View>
          <View style={styles.roomInfo}>
            <Text style={styles.roomName}>{room.name}</Text>
            <Text style={styles.roomDevices}>{room.deviceCount} devices</Text>
          </View>
          <Pressable style={styles.roomAction}>
            <GIcon name="edit" size={16} color={Grey[400]} />
          </Pressable>
          <Pressable
            style={styles.roomAction}
            onPress={() => handleRemoveRoom(room.id)}
          >
            <GIcon name="trash" size={16} color={Semantic.danger} />
          </Pressable>
        </View>
      ))}

      {/* Add room */}
      <Pressable style={styles.addBtn}>
        <GIcon name="plus" size={16} color={AccentPurple} />
        <Text style={styles.addBtnText}>Add Room</Text>
      </Pressable>

      {/* Pond devices */}
      <Text style={styles.sectionLabel}>POND DEVICES</Text>
      {POND_DEVICES.map((pd) => (
        <View key={pd.id} style={styles.pondCard}>
          <View style={styles.pondHeader}>
            <View style={[styles.pondDot, { backgroundColor: pd.status === 'online' ? Semantic.success : Grey[400] }]} />
            <Text style={styles.pondName}>{pd.name}</Text>
          </View>
          <View style={styles.pondMeta}>
            <Text style={styles.pondFirmware}>Firmware: {pd.firmware}</Text>
            <View style={[styles.pondStatus, { backgroundColor: pd.status === 'online' ? Semantic.successSoft : Grey[100] }]}>
              <Text style={[styles.pondStatusText, { color: pd.status === 'online' ? Semantic.success : Grey[500] }]}>
                {pd.status}
              </Text>
            </View>
          </View>
        </View>
      ))}

      {/* Pair new device */}
      <Pressable
        style={styles.addBtn}
        onPress={() => router.push('/(stack)/pond-pairing')}
      >
        <GIcon name="plus" size={16} color={AccentPurple} />
        <Text style={styles.addBtnText}>Pair New Pond Device</Text>
      </Pressable>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Grey[50] },
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },

  sectionLabel: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Grey[500],
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },

  /* Room card */
  roomCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Brand.white,
    borderRadius: Radii.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Grey[200],
    marginBottom: Spacing.sm,
  },
  roomInfo: { flex: 1 },
  roomName: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Brand.charcoal,
  },
  roomDevices: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[500],
    marginTop: 2,
  },
  roomAction: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Add button */
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: Radii.xl,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: JaridaPurple[200],
    backgroundColor: JaridaPurple[50],
    marginBottom: Spacing.lg,
  },
  addBtnText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: AccentPurple,
  },

  /* Pond device */
  pondCard: {
    backgroundColor: Brand.white,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Grey[200],
    marginBottom: Spacing.sm,
  },
  pondHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  pondDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pondName: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Brand.charcoal,
  },
  pondMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pondFirmware: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Grey[500],
  },
  pondStatus: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  pondStatusText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
});
