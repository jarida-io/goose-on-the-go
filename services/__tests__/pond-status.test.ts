jest.mock('../api-client', () => ({ ApiError: jest.requireActual('../api-client').ApiError, api: { request: jest.fn() } }));
jest.mock('../secure-storage', () => {
  const kept = new Map<string, string>();
  return {
    SecureStorage: {
      get: jest.fn(async (key: string) => kept.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => { kept.set(key, value); }),
      remove: jest.fn(async (key: string) => { kept.delete(key); }),
    },
  };
});
import { ApiError, api } from '../api-client';
import { SecureStorage } from '../secure-storage';
import { askCoordinator, renewStatusGrant, storedGrant } from '../pond-status';

const PIN = 'sha256/pond-one';
const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const issued = (expiresInMs: number, enrollmentUrl = 'https://enroll.example') => ({ enrollmentUrl, grant: 'cGF5bG9hZA==.c2ln', expiresAt: (NOW + expiresInMs) / 1000 });
const answer = (status: number, body: unknown) => jest.fn(async () => ({ ok: status === 200, status, json: async () => body }) as unknown as Response);

beforeEach(async () => {
  jest.mocked(api.request).mockReset();
  await SecureStorage.remove('pondStatusGrant');
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});

it('keeps a grant for the Pond that signed it and renews it only when it runs low', async () => {
  jest.mocked(api.request).mockResolvedValue(issued(30 * DAY));
  await renewStatusGrant(PIN, NOW);
  expect(api.request).toHaveBeenCalledWith('/api/v1/remote-access/status-grant');
  expect(await storedGrant(PIN)).toMatchObject({ enrollmentUrl: 'https://enroll.example', grant: 'cGF5bG9hZA==.c2ln' });
  expect(await storedGrant('sha256/another-pond')).toBeNull();

  await renewStatusGrant(PIN, NOW + 10 * DAY);
  expect(api.request).toHaveBeenCalledTimes(1);
  await renewStatusGrant(PIN, NOW + 25 * DAY);
  expect(api.request).toHaveBeenCalledTimes(2);
});

it('drops the grant when remote access is off, and never keeps one for a plain-HTTP coordinator', async () => {
  jest.mocked(api.request).mockResolvedValueOnce(issued(30 * DAY));
  await renewStatusGrant(PIN, NOW);
  jest.mocked(api.request).mockRejectedValueOnce(new ApiError('GET → 409', 409, null, null, null));
  await renewStatusGrant(PIN, NOW + 28 * DAY);
  expect(await storedGrant(PIN)).toBeNull();

  jest.mocked(api.request).mockResolvedValueOnce(issued(30 * DAY, 'http://enroll.example'));
  await renewStatusGrant(PIN, NOW);
  expect(await storedGrant(PIN)).toBeNull();
});

it('asks the coordinator with the grant and reads its answer', async () => {
  jest.mocked(api.request).mockResolvedValue(issued(30 * DAY));
  await renewStatusGrant(PIN, NOW);
  const fetcher = answer(200, { state: 'unreachable', since: 10, now: 20, possibleCauses: ['power_loss', 'network_loss'] });
  expect(await askCoordinator(PIN, NOW, fetcher)).toMatchObject({ state: 'unreachable', since: 10 });
  expect(fetcher).toHaveBeenCalledWith('https://enroll.example/v1/pond/status', expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'PondGrant cGF5bG9hZA==.c2ln' }),
  }));
});

it('asks nothing without a live grant, and forgets one the coordinator refuses', async () => {
  const fetcher = answer(200, { state: 'online', now: 1 });
  expect(await askCoordinator(PIN, NOW, fetcher)).toBeNull();
  jest.mocked(api.request).mockResolvedValue(issued(DAY));
  await renewStatusGrant(PIN, NOW);
  expect(await askCoordinator(PIN, NOW + 2 * DAY, fetcher)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();

  expect(await askCoordinator(PIN, NOW, answer(403, { error: 'device_not_enrolled' }))).toBeNull();
  expect(await storedGrant(PIN)).toBeNull();
});

it('answers null rather than throwing when the coordinator cannot be reached', async () => {
  jest.mocked(api.request).mockResolvedValue(issued(30 * DAY));
  await renewStatusGrant(PIN, NOW);
  const unreachable = jest.fn(async () => { throw new TypeError('Network request failed'); });
  expect(await askCoordinator(PIN, NOW, unreachable as unknown as typeof fetch)).toBeNull();
  expect(await storedGrant(PIN)).not.toBeNull();
});
