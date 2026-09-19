jest.mock('@/services/pond-trust', () => ({ assertPondTrust: jest.fn().mockResolvedValue(undefined) }));
/**
 * The route wrappers, and the three things in `request()` every one of them
 * inherits: envelope unwrapping, empty-body tolerance, and one shared refresh.
 *
 * These assert transport behaviour rather than route spelling. A wrapper that
 * compiles proves nothing about whether the server agrees with it — that needs a
 * live Pond, and is listed in the PR. What is worth pinning here is the handling
 * that would otherwise be wrong identically in thirty methods.
 */

import { PondApiClient } from '@/services/api-client';

const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');

function setFetch(impl: unknown) {
  Object.defineProperty(globalThis, 'fetch', { value: impl, configurable: true, writable: true });
}

/** A `Response` stand-in carrying only what `request()` reads. */
function reply(body: string, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

afterEach(() => {
  if (originalFetch) Object.defineProperty(globalThis, 'fetch', originalFetch);
  else delete (globalThis as { fetch?: unknown }).fetch;
});

describe('envelope unwrapping', () => {
  /**
   * `GET /devices` answers `{devices: [...]}`. The desktop client unwraps it, and
   * a wrapper that returned the envelope would make every caller do it again.
   */
  it('returns the list from an enveloped collection', async () => {
    setFetch(async () => reply('{"devices":[{"id":"d1","name":"Lamp","is_online":true}]}'));
    const api = new PondApiClient('https://pond.test:4000');

    await expect(api.listDevices()).resolves.toEqual([
      { id: 'd1', name: 'Lamp', is_online: true },
    ]);
  });

  /** Older ponds answer a bare array. Both shapes have to work. */
  it('returns the list when the server sends a bare array', async () => {
    setFetch(async () => reply('[{"id":"d1","name":"Lamp","is_online":true}]'));
    const api = new PondApiClient('https://pond.test:4000');

    await expect(api.listDevices()).resolves.toHaveLength(1);
  });
});

describe('empty bodies', () => {
  /**
   * DELETE answers 204. `res.json()` throws on an empty body, so without this
   * every successful delete would surface as a parse error.
   */
  it('resolves a 204 instead of failing to parse it', async () => {
    setFetch(async () => reply('', { status: 204 }));
    const api = new PondApiClient('https://pond.test:4000');

    await expect(api.deleteDevice('d1')).resolves.toBeUndefined();
  });

  it('resolves a 200 that carries no body', async () => {
    setFetch(async () => reply(''));
    const api = new PondApiClient('https://pond.test:4000');

    await expect(api.pauseSchedule('s1')).resolves.toBeUndefined();
  });
});

describe('concurrent 401s', () => {
  /**
   * Refresh tokens rotate, so a second refresh presents one the server has
   * already retired. Firing several would turn a recoverable expiry into a
   * forced re-pair — the first succeeds and the rest invalidate the session.
   */
  it('shares one refresh across requests that 401 together', async () => {
    let refreshes = 0;
    let refreshed = false;

    setFetch(async (url: string) => {
      if (url.endsWith('/handshake/refresh')) {
        refreshes++;
        // Resolve on a later tick so the other callers reach their own 401
        // first. If they each start a refresh, this counter climbs.
        await new Promise((r) => setTimeout(r, 0));
        refreshed = true;
        return reply('{"accepted":true,"session_token":"new","refresh_token":"r2"}');
      }
      // Every request rejects the stale token, which is the real situation:
      // three screens firing at once after a 24h session expiry.
      if (!refreshed) return reply('', { status: 401 });
      return reply('{"devices":[]}');
    });

    const api = new PondApiClient('https://pond.test:4000');
    api.setToken('stale');
    api.setRefreshToken('refresh-1');

    await Promise.all([
      api.listDevices().catch(() => undefined),
      api.listSessions().catch(() => undefined),
      api.listSchedules().catch(() => undefined),
    ]);

    expect(refreshes).toBe(1);
  });
});
