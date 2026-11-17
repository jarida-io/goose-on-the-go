/**
 * The connection strip: the state, why when the checks say, when the next check runs, and the one
 * action that helps -- Try now, or Pair where only pairing can. Drawn in one place per screen.
 */

import '@/services/i18n';
import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ConnectionOutage, ConnectionState } from '@/models/connection';
import { ConnectionStatus, type ConnectionStatusProps } from '../connection-status';

const mockServer: {
  hydrated: boolean;
  connectionState: ConnectionState;
  connectionOutage: ConnectionOutage | null;
  retryNow: jest.Mock;
  pairedPin: string | null;
} = { hydrated: true, connectionState: 'disconnected', connectionOutage: null, retryNow: jest.fn(), pairedPin: null };
const mockAskCoordinator = jest.fn();
const mockPush = jest.fn();
let mockSegments: string[] = ['(tabs)', 'chat'];

jest.mock('@/providers/server-provider', () => ({ useServer: () => mockServer }));
jest.mock('@/providers/theme-provider', () => ({
  useTheme: () => ({ colors: jest.requireActual('@/constants/colors').LightColors }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useSegments: () => mockSegments,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/services/pond-status', () => ({
  askCoordinator: (...args: unknown[]) => mockAskCoordinator(...args),
  renewStatusGrant: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/services/haptics', () => ({ selectionTick: jest.fn().mockResolvedValue(undefined) }));
// The app registers lucide's glyphs, which jest cannot load. The glyph is not what is under test.
jest.mock('@/components/ui/g-icon', () => ({ GIcon: () => null }));

/** Every tree drawn, unmounted after each test so a countdown does not tick on past it. */
const drawn: ReactTestRenderer[] = [];
afterEach(() => act(() => drawn.splice(0).forEach((tree) => tree.unmount())));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const UNREACHABLE: ConnectionOutage = { failures: 3, reason: 'local', nextCheckAt: Date.now() + 8_400, lastConnectedAt: Date.now() - 60_000 };

function render(state: ConnectionState, outage: ConnectionOutage | null = null, props: ConnectionStatusProps = {}) {
  mockServer.connectionState = state;
  mockServer.connectionOutage = outage;
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<ConnectionStatus {...props} />);
  });
  drawn.push(tree);
  return tree;
}

function words(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAllByType(Text)
    .map((node) => node.props.children)
    .filter((child): child is string => typeof child === 'string');
}

/** Whatever a finger can press: anything with an `onPress`, however Pressable is drawn in tests. */
function pressables(tree: ReactTestRenderer) {
  return tree.root.findAll((n) => typeof n.type !== 'string' && typeof n.props.onPress === 'function', { deep: false });
}

function statement(tree: ReactTestRenderer) {
  return tree.root.findAll((n) => n.props.accessible === true && 'accessibilityLabel' in n.props)[0];
}

beforeEach(() => {
  require('@/view-models/use-pond-offline-reason').resetPondOfflineReason();
  mockServer.pairedPin = null;
  mockAskCoordinator.mockReset().mockResolvedValue(null);
  mockServer.hydrated = true;
  mockServer.retryNow = jest.fn().mockResolvedValue(null);
  mockPush.mockClear();
  mockSegments = ['(tabs)', 'chat'];
});

describe('ConnectionStatus', () => {
  it('gives the state, the reason and the countdown, and offers Try now', () => {
    const tree = render('disconnected', UNREACHABLE);
    expect(words(tree)).toEqual(['Cannot reach your Pond', 'Not answering on this Wi-Fi · Trying again in 9 s', 'Try now']);
    const [tryNow] = pressables(tree);
    expect(tryNow.props.accessibilityRole).toBe('button');
    act(() => tryNow.props.onPress());
    expect(mockServer.retryNow).toHaveBeenCalledTimes(1);
  });

  it('announces the state and the reason politely, without the countdown', () => {
    const node = statement(render('disconnected', UNREACHABLE));
    expect(node.props).toMatchObject({
      accessibilityLiveRegion: 'polite',
      accessibilityLabel: 'Cannot reach your Pond. Not answering on this Wi-Fi',
    });
  });

  it('holds Try now while a check is running', () => {
    const tree = render('reconnecting', UNREACHABLE);
    expect(words(tree)).toContain('Not answering on this Wi-Fi · Checking now…');
    expect(pressables(tree)[0].props.disabled).toBe(true);
  });

  it.each<ConnectionState>(['unpaired', 'upgrade', 'revoked'])('keeps Pair for a phone that must pair again (%s)', (state) => {
    const tree = render(state);
    const [pair] = pressables(tree);
    expect(words(tree)).toContain('Pair');
    expect(words(tree)).not.toContain('Try now');
    act(() => pair.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/(stack)/pond-pairing');
  });

  it('says nothing while the connection works', () => {
    expect(render('local').toJSON()).toBeNull();
    expect(render('remote').toJSON()).toBeNull();
  });

  it('stays off the screens that tell it on their own card', () => {
    mockSegments = ['(tabs)'];
    expect(render('disconnected', UNREACHABLE).toJSON()).toBeNull();
    mockSegments = ['(stack)', 'switch-pond'];
    expect(render('disconnected', UNREACHABLE).toJSON()).toBeNull();
  });

  it('sits under a stack screen title bar instead of above it, and never both', () => {
    mockSegments = ['(stack)', 'settings-voice'];
    expect(render('disconnected', UNREACHABLE).toJSON()).toBeNull();
    expect(render('disconnected', UNREACHABLE, { placement: 'inline', screen: 'settings-voice' }).toJSON()).not.toBeNull();
    expect(render('disconnected', UNREACHABLE, { placement: 'inline', screen: 'switch-pond' }).toJSON()).toBeNull();
  });

  it('says why the Pond is offline when the remote-access coordinator knows', async () => {
    mockServer.pairedPin = 'sha256/pond';
    const now = Math.floor(Date.now() / 1000);
    mockAskCoordinator.mockResolvedValue({ state: 'planned_restart', reason: 'update', since: now - 60, now });
    const tree = render('disconnected', UNREACHABLE);
    await act(async () => { await Promise.resolve(); });
    expect(mockAskCoordinator).toHaveBeenCalledWith('sha256/pond', expect.any(Number));
    expect(words(tree)).toEqual(['Cannot reach your Pond', 'Your Pond is restarting for an update. · Trying again in 9 s', 'Try now']);
    expect(statement(tree).props.accessibilityLabel).toBe('Cannot reach your Pond. Your Pond is restarting for an update.');
  });

  it('keeps the route\'s reason when the coordinator has nothing to add', async () => {
    mockServer.pairedPin = 'sha256/pond';
    const tree = render('disconnected', UNREACHABLE);
    await act(async () => { await Promise.resolve(); });
    expect(words(tree)).toContain('Not answering on this Wi-Fi · Trying again in 9 s');
  });
});
