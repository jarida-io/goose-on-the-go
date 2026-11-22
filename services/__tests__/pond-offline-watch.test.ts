import { AppState } from 'react-native';

import { presentLocally } from '../local-notifications';
import { loadPairedProfile } from '../paired-profile';
import { askCoordinator } from '../pond-status';
import { Storage } from '../storage';
import { checkPondOffline, offlineNotice } from '../pond-offline-watch';
import type { CoordinatorPondStatus } from '@/models/pond-status';
jest.mock('../paired-profile', () => ({ loadPairedProfile: jest.fn() }));
jest.mock('../pond-status', () => ({ askCoordinator: jest.fn() }));
jest.mock('../local-notifications', () => ({ presentLocally: jest.fn(async () => true) }));
jest.mock('../storage', () => {
  const kept = new Map<string, string>();
  return {
    Storage: {
      get: jest.fn(async (key: string) => kept.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => { kept.set(key, value); }),
      clear: () => kept.clear(),
    },
  };
});

const NOW = 1_800_000_000_000;
const SECONDS = NOW / 1000;
const unreachable = (sinceAgo: number, causes: string[] = []): CoordinatorPondStatus => ({
  state: 'unreachable',
  since: SECONDS - sinceAgo,
  possibleCauses: causes,
  now: SECONDS,
});

function setAppState(state: string) {
  Object.defineProperty(AppState, 'currentState', { value: state, configurable: true });
}

beforeEach(() => {
  (Storage as unknown as { clear: () => void }).clear();
  jest.mocked(presentLocally).mockClear().mockResolvedValue(true);
  jest.mocked(loadPairedProfile).mockResolvedValue({ saved: { identity: { pin: 'sha256/pond' } } } as never);
  setAppState('background');
});

it('names each outage by its kind and when the coordinator says it began, and leaves restarts out', () => {
  expect(offlineNotice(unreachable(600), NOW)?.key).toBe(`stopped_without_warning:${SECONDS - 600}`);
  expect(offlineNotice(unreachable(600, ['pond_stopped']), NOW)?.why.kind).toBe('pond_stopped');
  expect(offlineNotice({ state: 'planned_restart', reason: 'update', now: SECONDS }, NOW)).toBeNull();
  expect(offlineNotice({ state: 'online', now: SECONDS }, NOW)).toBeNull();
});

it('tells an outage once, in the shade, with the reason', async () => {
  jest.mocked(askCoordinator).mockResolvedValue(unreachable(20 * 60));
  expect(await checkPondOffline(NOW)).toBe('told');
  expect(presentLocally).toHaveBeenCalledWith(expect.objectContaining({
    category: 'alert',
    title: 'Your Pond is offline',
    body: expect.stringContaining('power cut or the home internet is down'),
    data: { kind: 'pond_offline' },
  }));
  expect(await checkPondOffline(NOW + 15 * 60_000)).toBe('already_told');
  expect(presentLocally).toHaveBeenCalledTimes(1);

  jest.mocked(askCoordinator).mockResolvedValue(unreachable(60));
  // A new outage is told again.
  expect(await checkPondOffline(NOW)).toBe('told');
});

it('says nothing while the app is open, unpaired, or when the coordinator has nothing to tell', async () => {
  setAppState('active');
  expect(await checkPondOffline(NOW)).toBe('app_open');
  setAppState('background');

  jest.mocked(loadPairedProfile).mockResolvedValueOnce({ saved: null } as never);
  expect(await checkPondOffline(NOW)).toBe('unpaired');

  jest.mocked(askCoordinator).mockResolvedValue(null);
  expect(await checkPondOffline(NOW)).toBe('no_answer');

  jest.mocked(askCoordinator).mockResolvedValue({ state: 'back', now: SECONDS });
  expect(await checkPondOffline(NOW)).toBe('nothing_wrong');
  expect(presentLocally).not.toHaveBeenCalled();
});

it('tries again next time when the notice could not be shown', async () => {
  jest.mocked(askCoordinator).mockResolvedValue(unreachable(20 * 60));
  jest.mocked(presentLocally).mockResolvedValueOnce(false);
  expect(await checkPondOffline(NOW)).toBe('not_shown');
  expect(await checkPondOffline(NOW)).toBe('told');
});
