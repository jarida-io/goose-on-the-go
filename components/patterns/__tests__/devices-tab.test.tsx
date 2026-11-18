/**
 * What a card on the Devices tab says about a device's state: a dashboard window is open or not,
 * and only a phone or a smart-home device that cannot be reached is offline.
 *
 * Lives here rather than beside the screen because a file under `app/` is a route.
 */

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import DevicesTab from '@/app/(stack)/devices';
import { Colors } from '@/constants/colors';
import { ThemeProvider } from '@/providers/theme-provider';
import i18n from '@/services/i18n';
import type { Device } from '@/services/types';
import type { UseDevices } from '@/view-models/use-devices';

// lucide ships ES modules Jest does not transform; the glyph is not under test.
jest.mock('@/components/ui/g-icon', () => ({ GIcon: () => null }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});
jest.mock('@/providers/chrome-provider', () => ({ useChromeScroll: () => ({}), useBottomBarInset: () => 0 }));
jest.mock('@/providers/server-provider', () => ({ useServer: () => ({ hydrated: true }) }));

// The pairing lock's row reads the Pond on focus, which this test's router has none of.
jest.mock('@/view-models/use-pairing-lock', () => ({ usePairingLockSummary: () => ({ data: null, actions: { refresh: jest.fn() } }) }));

let mockDevices: Device[] = [];
jest.mock('@/view-models/use-devices', () => {
  const actual = jest.requireActual('@/view-models/use-devices');
  return {
    ...actual,
    useDevices: (): UseDevices => ({
      data: {
        devices: mockDevices,
        rooms: actual.groupByRoom(mockDevices, []),
        roomTabs: [],
        roomsEditable: true,
        onlineCount: mockDevices.filter((d) => d.is_online).length,
        powerById: {},
        waitingById: {},
        queued: [],
        matter: null,
        staleFor: null,
      },
      loading: false,
      failed: false,
      error: null,
      actions: {} as UseDevices['actions'],
    }),
  };
});

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

/** The words under the card's name, and the colour they are drawn in. */
async function cardState(device: Device) {
  mockDevices = [device];
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <ThemeProvider>
        <DevicesTab />
      </ThemeProvider>,
    );
  });
  const said = [i18n.t('devices.app.open'), i18n.t('devices.app.notOpen'), i18n.t('common.offline')];
  const node = tree.root.findAllByType(Text).find((t) => said.includes(t.props.children));
  return { words: node?.props.children, color: StyleSheet.flatten(node?.props.style).color };
}

const light = Colors.light;

it('says a closed dashboard is not open, in the ordinary colour rather than the offline one', async () => {
  const closed = await cardState({ id: 'dash', name: 'Pond dashboard', device_type: 'desktop', is_online: false });
  expect(closed.words).toBe(i18n.t('devices.app.notOpen'));
  expect(closed.color).toBe(light.textSecondary);
});

it('says an open dashboard is open', async () => {
  const open = await cardState({ id: 'dash', name: 'Pond dashboard', device_type: 'desktop', is_online: true });
  expect(open.words).toBe(i18n.t('devices.app.open'));
});

it('still calls an unreachable phone or device offline, muted', async () => {
  for (const device_type of ['gotg', 'light']) {
    const gone = await cardState({ id: device_type, name: 'Away', device_type, is_online: false });
    expect(gone.words).toBe(i18n.t('common.offline'));
    expect(gone.color).toBe(light.textTertiary);
  }
});
