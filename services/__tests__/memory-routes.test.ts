jest.mock('@/services/pond-trust', () => ({ assertPondTrust: jest.fn().mockResolvedValue(undefined) }));
/**
 * The memory and consolidation wrappers.
 *
 * Routes and bodies are checked against `pond-api/src/routes.rs` and the
 * memory domain types; a live Pond is still the real test, and is listed in
 * the PR.
 */

import { ApiError, PondApiClient } from '@/services/api-client';
import type { ConsolidationEvent } from '@/services/types';

const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');

function setFetch(impl: unknown) {
  Object.defineProperty(globalThis, 'fetch', { value: impl, configurable: true, writable: true });
}

/** A `Response` stand-in carrying only what `request()` and `readSse()` read. */
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

interface Seen {
  url: string;
  method?: string;
  body?: unknown;
}

/** Records every request and answers each with `body`. */
function recordInto(seen: Seen[], body = '{}', status = 200) {
  setFetch(async (url: string, init?: { method?: string; body?: string }) => {
    seen.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined });
    return reply(body, { status });
  });
}

afterEach(() => {
  if (originalFetch) Object.defineProperty(globalThis, 'fetch', originalFetch);
  else delete (globalThis as { fetch?: unknown }).fetch;
});

const api = () => new PondApiClient('https://pond.test:4000');

describe('memories', () => {
  it('lists the bare array the Pond sends', async () => {
    const seen: Seen[] = [];
    recordInto(seen, '[{"id":"m1","content":"Likes tea","tags":[],"source":"chat","created_at":"2026-10-01T00:00:00Z","access_count":0}]');

    const list = await api().listMemories();

    expect(seen[0].url).toBe('https://pond.test:4000/api/v1/memories');
    expect(list.map((m) => m.id)).toEqual(['m1']);
  });

  it('saves with the segment and tier the Pond reads', async () => {
    const seen: Seen[] = [];
    recordInto(seen, '{"id":"m2"}');

    await api().saveMemory({ content: 'Likes tea', segment: 'preference', tier: 'permanent' });

    expect(seen[0]).toEqual({
      url: 'https://pond.test:4000/api/v1/memories',
      method: 'POST',
      body: { content: 'Likes tea', segment: 'preference', tier: 'permanent' },
    });
  });

  it('rewords with PUT, escaping the id, and sends nothing but the words', async () => {
    const seen: Seen[] = [];
    recordInto(seen, '');

    await api().updateMemory('a/b', 'Likes green tea');

    expect(seen[0]).toEqual({
      url: 'https://pond.test:4000/api/v1/memories/a%2Fb',
      method: 'PUT',
      body: { content: 'Likes green tea' },
    });
  });

  it('deletes by id', async () => {
    const seen: Seen[] = [];
    recordInto(seen, '');

    await api().deleteMemory('m1');

    expect(seen[0].method).toBe('DELETE');
    expect(seen[0].url).toBe('https://pond.test:4000/api/v1/memories/m1');
  });
});

describe('consolidation', () => {
  it('starts with POST and hands over each stage as it arrives', async () => {
    const frames: ConsolidationEvent[] = [
      { type: 'started', memory_count: 12 },
      { type: 'proposer_done', proposals: [{}, {}] },
      { type: 'completed', result: { accepted_count: 1, rejected_count: 1, duration_ms: 900 } },
    ];
    const seen: Seen[] = [];
    setFetch(async (url: string, init?: { method?: string }) => {
      seen.push({ url, method: init?.method });
      return reply(frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join(': keep-alive\n\n'));
    });

    const events: ConsolidationEvent[] = [];
    await api().streamConsolidation((event) => events.push(event));

    expect(seen).toEqual([{ url: 'https://pond.test:4000/api/v1/memory/consolidate', method: 'POST' }]);
    expect(events).toEqual(frames);
  });

  it('keeps the reason a 501 gives, which says whether it is off or missing', async () => {
    recordInto([], '{"error":"Memory consolidation is not enabled"}', 501);

    const failure = await api().streamConsolidation(() => {}).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(501);
    expect((failure as ApiError).detail).toBe('Memory consolidation is not enabled');
  });

  it('stops with POST', async () => {
    const seen: Seen[] = [];
    recordInto(seen, '');

    await api().stopConsolidation();

    expect(seen[0].method).toBe('POST');
    expect(seen[0].url).toBe('https://pond.test:4000/api/v1/memory/consolidate/stop');
  });
});
