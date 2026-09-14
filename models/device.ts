/** Device types — Goose On The Go v2 design */

export interface Device {
  label: string;
  icon: string;
  detail: string;
  color: string;
  idx: number;
}

export interface Room {
  name: string;
  devices: Device[];
}

export const HOME_DEVICES: Device[] = [
  { label: 'Living Room', icon: 'light', detail: '2 on', color: '#F59E0B', idx: 0 },
  { label: 'Thermostat', icon: 'thermo', detail: '72\u00B0F', color: '#1C63D1', idx: 1 },
  { label: 'Front Door', icon: 'lock', detail: 'Locked', color: '#1F8A3C', idx: 2 },
  { label: 'Speaker', icon: 'speaker', detail: 'Playing', color: '#7C3AED', idx: 3 },
];

export const DEVICE_ROOMS: Room[] = [
  { name: 'Living Room', devices: [
    { label: 'Ceiling Light', icon: 'light', detail: '80%', color: '#F59E0B', idx: 0 },
    { label: 'Smart TV', icon: 'camera', detail: 'Netflix', color: '#1C63D1', idx: 1 },
  ]},
  { name: 'Bedroom', devices: [
    { label: 'Bedside Lamp', icon: 'light', detail: '40%', color: '#F59E0B', idx: 2 },
    { label: 'Thermostat', icon: 'thermo', detail: '68\u00B0F', color: '#1C63D1', idx: 3 },
  ]},
  { name: 'Entrance', devices: [
    { label: 'Front Door', icon: 'lock', detail: 'Locked', color: '#1F8A3C', idx: 4 },
    { label: 'Doorbell Cam', icon: 'camera', detail: 'Live', color: '#C8383B', idx: 5 },
  ]},
];
