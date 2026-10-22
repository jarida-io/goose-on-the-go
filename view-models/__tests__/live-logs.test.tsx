/**
 * The debug screen's live logs: read at the polling floor while on screen, held still while paused,
 * and kept on screen when a later poll fails.
 */

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { api } from '@/services/api-client';
import type { LogEntry } from '@/services/types';
import { MIN_POLL_MS } from '@/view-models/use-live';
import { LIVE_LOGS_LIMIT, useLiveLogs, type LogLevel, type UseLiveLogs } from '@/view-models/use-live-logs';

jest.mock('@/services/pond-trust', () => ({ assertPondTrust: jest.fn().mockResolvedValue(undefined) }));
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect: run } = jest.requireActual('react');
    run(effect, [effect]);
  },
}));
jest.mock('@/providers/server-provider', () => ({ useServer: () => ({ hydrated: true }) }));
jest.mock('@/services/api-client', () => {
  const actual = jest.requireActual('@/services/api-client');
  return { ...actual, api: { listLogs: jest.fn() } };
});

const pond = jest.mocked(api);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const line = (id: number): LogEntry => ({
  id,
  timestamp: '2026-10-22 08:00:00',
  level: 'INFO',
  source: 'pond_api',
  message: `line ${id}`,
  metadata: null,
});

async function mount(open = true, level: LogLevel | null = null) {
  let latest!: UseLiveLogs;
  const Probe = () => {
    latest = useLiveLogs(open, level);
    return null;
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<Probe />);
    await jest.advanceTimersByTimeAsync(0);
  });
  return {
    get vm() {
      return latest;
    },
    tick: (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms)),
    unmount: () => act(() => tree.unmount()),
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  pond.listLogs.mockResolvedValue([line(1)]);
});

afterEach(() => jest.useRealTimers());

it('reads the newest lines at once, then again at the polling floor', async () => {
  const m = await mount();
  expect(pond.listLogs).toHaveBeenCalledWith({ limit: LIVE_LOGS_LIMIT, level: undefined });
  expect(m.vm.data.entries).toEqual([line(1)]);
  await m.tick(MIN_POLL_MS);
  expect(pond.listLogs).toHaveBeenCalledTimes(2);
  m.unmount();
});

it('asks the Pond for one level when given one', async () => {
  const m = await mount(true, 'ERROR');
  expect(pond.listLogs).toHaveBeenCalledWith({ limit: LIVE_LOGS_LIMIT, level: 'ERROR' });
  m.unmount();
});

it('reads nothing while the logs are not on screen', async () => {
  const m = await mount(false);
  await m.tick(MIN_POLL_MS * 3);
  expect(pond.listLogs).not.toHaveBeenCalled();
  m.unmount();
});

it('holds the list still while paused', async () => {
  const m = await mount();
  await act(async () => m.vm.actions.setPaused(true));
  pond.listLogs.mockClear();
  await m.tick(MIN_POLL_MS * 3);
  expect(pond.listLogs).not.toHaveBeenCalled();
  expect(m.vm.paused).toBe(true);
  m.unmount();
});

it('keeps the last lines when a later poll fails, and says so only when nothing landed', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const m = await mount();
  pond.listLogs.mockRejectedValueOnce(new Error('offline'));
  await m.tick(MIN_POLL_MS);
  expect(m.vm.data.entries).toEqual([line(1)]);
  expect(m.vm.error).toBeNull();
  m.unmount();

  pond.listLogs.mockRejectedValueOnce(new Error('offline'));
  const fresh = await mount();
  expect(fresh.vm.data.entries).toEqual([]);
  expect(fresh.vm.error).not.toBeNull();
  fresh.unmount();
  warn.mockRestore();
});
