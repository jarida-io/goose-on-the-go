jest.mock('@/services/pond-trust', () => ({ assertPondTrust: jest.fn().mockResolvedValue(undefined) }));
/**
 * Tests for the API client's error surface.
 *
 * The push-token retry policy makes decisions off `ApiError.status` and
 * `retryAfterSecs`, so parsing them wrongly would silently turn a considerate
 * client back into an inconsiderate one.
 */

import { ApiError, PondApiClient } from '@/services/api-client';

/** A `fetch` returning one canned response. */
function stubFetch(init: { status: number; headers?: Record<string, string>; body?: unknown }) {
  return jest.fn(async () =>
    new Response(JSON.stringify(init.body ?? {}), {
      status: init.status,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    }),
  );
}

/**
 * Swap `fetch` via property descriptors rather than by reading and reassigning
 * it. Expo installs `fetch` as a lazy getter that initializes its native
 * bridge on first read — which cannot work in a Node test environment, and
 * warns during teardown if triggered. Descriptors let us replace it without
 * ever invoking that getter.
 */
const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');

function setFetch(impl: unknown) {
  Object.defineProperty(globalThis, 'fetch', {
    value: impl,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  if (originalFetch) {
    Object.defineProperty(globalThis, 'fetch', originalFetch);
  } else {
    delete (globalThis as { fetch?: unknown }).fetch;
  }
});

describe('ApiError', () => {
  it('treats 429 and 5xx as retryable', () => {
    expect(new ApiError('m', 429, 1).isRetryable).toBe(true);
    expect(new ApiError('m', 500, null).isRetryable).toBe(true);
    expect(new ApiError('m', 503, null).isRetryable).toBe(true);
  });

  /**
   * These describe a request that is wrong, not a moment that is wrong.
   * Retrying an unknown device or a malformed token can never succeed, and on
   * a rate-limited endpoint the attempt itself is the harm.
   */
  it('treats other 4xx as not retryable', () => {
    expect(new ApiError('m', 400, null).isRetryable).toBe(false);
    expect(new ApiError('m', 401, null).isRetryable).toBe(false);
    expect(new ApiError('m', 404, null).isRetryable).toBe(false);
  });

  it('is a real Error, so instanceof and message both work', () => {
    const e = new ApiError('POST /x → 429', 429, 5);
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.message).toBe('POST /x → 429');
  });
});

describe('request()', () => {
  it('throws an ApiError carrying the status and Retry-After', async () => {
    setFetch(stubFetch({ status: 429, headers: { 'Retry-After': '42' } }));
    const client = new PondApiClient('https://pond.test');

    const error: ApiError = await client
      .request('/api/v1/thing', { method: 'POST' })
      .then(() => {
        throw new Error('expected the request to reject');
      })
      .catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(429);
    expect(error.retryAfterSecs).toBe(42);
    // Unchanged message format — existing logs stay readable.
    expect(error.message).toBe('POST /api/v1/thing → 429');
  });

  it('reports a null Retry-After when the header is absent', async () => {
    setFetch(stubFetch({ status: 503 }));
    const client = new PondApiClient('https://pond.test');

    const error = (await client.request('/api/v1/thing').catch((e) => e)) as ApiError;

    expect(error.status).toBe(503);
    expect(error.retryAfterSecs).toBeNull();
  });

  /**
   * `Retry-After` also has an HTTP-date form. We only consume delta-seconds,
   * so anything else must read as "no advice" rather than NaN — a NaN would
   * silently poison the backoff arithmetic that depends on it.
   */
  it('ignores a Retry-After it cannot read as seconds', async () => {
    setFetch(stubFetch({
      status: 429,
      headers: { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' },
    }));
    const client = new PondApiClient('https://pond.test');

    const error = (await client.request('/api/v1/thing').catch((e) => e)) as ApiError;

    expect(error.retryAfterSecs).toBeNull();
  });

  it('returns the parsed body on success', async () => {
    setFetch(stubFetch({ status: 200, body: { ok: true } }));
    const client = new PondApiClient('https://pond.test');

    await expect(client.request('/api/v1/thing')).resolves.toEqual({ ok: true });
  });
});
