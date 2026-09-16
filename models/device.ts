/** Device types — Goose On The Go v2 design */

import type { IconName } from '@/constants/icons';

export type DeviceKind =
  | 'light'
  | 'thermostat'
  | 'lock'
  | 'speaker'
  | 'camera'
  | 'switch'
  | 'sensor'
  | 'other';

/** A single smart-home device as reported by the paired Pond desktop. */
export interface Device {
  id: string;
  name: string;
  kind: DeviceKind;
  /** Room name as configured on desktop, or null if unassigned. */
  room: string | null;
  on: boolean;
  /** Human-readable status, e.g. "72°F" or "Locked" — desktop-supplied. */
  detail: string | null;
}

export interface Room {
  name: string;
  devices: Device[];
}

const KIND_ICON: Record<DeviceKind, IconName> = {
  light: 'light',
  thermostat: 'thermo',
  lock: 'lock',
  speaker: 'speaker',
  camera: 'camera',
  switch: 'power',
  sensor: 'activity',
  other: 'device',
};

const KIND_COLOR: Record<DeviceKind, string> = {
  light: '#F59E0B',
  thermostat: '#1C63D1',
  lock: '#1F8A3C',
  speaker: '#8C4BFF',
  camera: '#C8383B',
  switch: '#1C63D1',
  sensor: '#8C4BFF',
  other: '#6B7280',
};

export function deviceIcon(kind: DeviceKind): IconName {
  return KIND_ICON[kind] ?? KIND_ICON.other;
}

export function deviceColor(kind: DeviceKind): string {
  return KIND_COLOR[kind] ?? KIND_COLOR.other;
}

const UNASSIGNED_ROOM = 'Other';

/** Groups a flat device list into rooms, in order of first appearance. */
export function groupDevicesByRoom(devices: Device[]): Room[] {
  const rooms: Room[] = [];
  const byName = new Map<string, Room>();

  for (const device of devices) {
    const name = device.room ?? UNASSIGNED_ROOM;
    let room = byName.get(name);
    if (!room) {
      room = { name, devices: [] };
      byName.set(name, room);
      rooms.push(room);
    }
    room.devices.push(device);
  }

  return rooms;
}
