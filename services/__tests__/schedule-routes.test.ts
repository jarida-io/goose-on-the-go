jest.mock('@/services/pond-trust', () => ({ assertPondTrust: jest.fn().mockResolvedValue(undefined) }));
/**
 * The schedule and rule wrappers (issue #14), and the refusal detail the
 * create forms show.
 *
 * Routes and bodies are checked against `pond-api/src/routes.rs` and the
 * scheduler's domain types; a live Pond is still the real test, and is listed
 * in the PR.
 */

import { ApiError, PondApiClient } from '@/services/api-client';
import type { ScheduleResultEvent } from '@/services/types';

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
function recordInto(seen: Seen[], body = '{}') {
  setFetch(async (url: string, init?: { method?: string; body?: string }) => {
    seen.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined });
    return reply(body);
  });
}

afterEach(() => {
  if (originalFetch) Object.defineProperty(globalThis, 'fetch', originalFetch);
  else delete (globalThis as { fetch?: unknown }).fetch;
});

describe('schedules', () => {
  it('creates with the fields the Pond reads, its zone included', async () => {
    const seen: Seen[] = [];
    recordInto(seen, '{"id":"s1"}');
    const api = new PondApiClient('https://pond.test:4000');

    await api.createSchedule({
      name: 'Morning briefing',
      cron: '0 0 7 * * 1-5',
      prompt: 'Summarise my day.',
      timezone: 'Africa/Nairobi',
      once: false,
    });

    expect(seen[0].method).toBe('POST');
    expect(seen[0].url).toBe('https://pond.test:4000/api/v1/schedules');
    expect(seen[0].body).toEqual({
      name: 'Morning briefing',
      cron: '0 0 7 * * 1-5',
      prompt: 'Summarise my day.',
      timezone: 'Africa/Nairobi',
      once: false,
    });
  });

  it('updates with PUT, escaping the id', async () => {
    const seen: Seen[] = [];
    recordInto(seen, '{"id":"a/b"}');
    const api = new PondApiClient('https://pond.test:4000');

    await api.updateSchedule('a/b', { cron: '0 30 6 * * *' });

    expect(seen[0].method).toBe('PUT');
    expect(seen[0].url).toBe('https://pond.test:4000/api/v1/schedules/a%2Fb');
    expect(seen[0].body).toEqual({ cron: '0 30 6 * * *' });
  });
});

describe('rules', () => {
  /** `GET /rules` answers a bare array of rule views. */
  it('lists the bare array the Pond sends', async () => {
    setFetch(async () => reply('[{"id":"r1","name":"Too warm"}]'));
    const api = new PondApiClient('https://pond.test:4000');

    await expect(api.listRules()).resolves.toEqual([{ id: 'r1', name: 'Too warm' }]);
  });

  it('pauses and resumes on the rule paths, not the schedule ones', async () => {
    const seen: Seen[] = [];
    recordInto(seen, '{}');
    const api = new PondApiClient('https://pond.test:4000');

    await api.pauseRule('r1');
    await api.resumeRule('r1');

    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'POST https://pond.test:4000/api/v1/rules/r1/pause',
      'POST https://pond.test:4000/api/v1/rules/r1/resume',
    ]);
  });
});

describe('a refusal', () => {
  /**
   * The scheduler's 400 says what was wrong, and the create forms show it. The
   * message stays the method, path and status, so logs read as they did.
   */
  it('carries the sentence the Pond sent', async () => {
    setFetch(async () =>
      reply('{"error":"a rule needs at least one action; without one it would fire and do nothing"}', {
        status: 400,
      }),
    );
    const api = new PondApiClient('https://pond.test:4000');

    const error = await api
      .createRule({ name: 'Nothing', source: { kind: 'sensor' }, actions: [] })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('POST /api/v1/rules → 400');
    expect((error as ApiError).detail).toBe(
      'a rule needs at least one action; without one it would fire and do nothing',
    );
  });

  it.each([
    ['a body that is not JSON', 'Bad Gateway'],
    ['JSON with no error', '{"status":"down"}'],
    ['an empty body', ''],
  ])('has no detail for %s', async (_, body) => {
    setFetch(async () => reply(body, { status: 502 }));
    const api = new PondApiClient('https://pond.test:4000');

    const error = await api.listSchedules().catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(502);
    expect((error as ApiError).detail).toBeNull();
  });
});

describe('the schedule event stream', () => {
  it('delivers each run event, and skips a frame that is not JSON', async () => {
    const running = { schedule_id: 's1', schedule_label: 'Morning', run_id: 'r1', status: 'running' };
    const done = { ...running, status: 'completed', duration_ms: 1200 };
    const seen: string[] = [];
    setFetch(async (url: string) => {
      seen.push(url);
      return reply(`data: ${JSON.stringify(running)}\n\ndata: not json\n\n: keep-alive\n\ndata: ${JSON.stringify(done)}\n\n`);
    });
    const api = new PondApiClient('https://pond.test:4000');

    const events: ScheduleResultEvent[] = [];
    await api.streamScheduleEvents((event) => events.push(event));

    expect(seen).toEqual(['https://pond.test:4000/api/v1/schedules/events']);
    expect(events).toEqual([running, done]);
  });
});
