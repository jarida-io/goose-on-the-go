/**
 * Turns that outlive their screen, against a Pond that counts what it is asked.
 *
 * The bugs worth pinning here are the ones that talk too much: a reattach
 * that re-POSTs the question, a loop that keeps reattaching to a run the Pond
 * has forgotten, a suspended app spending its attempts while it cannot reach
 * anything, or a conversation opened on the wall that asks the Pond about a
 * run it could not possibly have. Each test says how many requests it took.
 */

import { ApiError } from '@/services/api-client';
import { ChatRuns, questionAnswered, type ChatRunsDeps } from '@/services/chat-runs';
import type { TurnNotice } from '@/services/reply-notices';
import type { ActiveRun, ChatFrame, SessionMessage } from '@/services/types';

interface Opened {
  onFrame: (frame: ChatFrame) => void;
  resolve: () => void;
  reject: (e: unknown) => void;
}

/** A streaming route whose every call stays open until the test ends it. */
function streamingRoute() {
  const opened: Opened[] = [];
  const fn = jest.fn((...args: unknown[]) => {
    const onFrame = args.find((a) => typeof a === 'function') as (frame: ChatFrame) => void;
    const signal = args.find((a) => a instanceof AbortSignal) as AbortSignal | undefined;
    return new Promise<void>((resolve, reject) => {
      signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
      opened.push({ onFrame, resolve, reject });
    });
  });
  return { fn, opened, last: () => opened[opened.length - 1] };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const dropped = () => new TypeError('Network request failed');

function harness(overrides: Partial<ChatRunsDeps> = {}) {
  const stream = streamingRoute();
  const reattach = streamingRoute();
  const api = {
    streamChat: stream.fn,
    reattachRun: reattach.fn,
    cancelRun: jest.fn().mockResolvedValue(undefined),
    activeRun: jest.fn<Promise<ActiveRun | null>, [string]>().mockResolvedValue(null),
    listSessionMessages: jest.fn<Promise<SessionMessage[]>, [string, number?]>().mockResolvedValue([]),
  };
  const state = { onScreen: true };
  const runs = new ChatRuns({
    api: api as unknown as ChatRunsDeps['api'],
    onScreen: () => state.onScreen,
    untilForeground: () => Promise.resolve(),
    sleep: () => Promise.resolve(),
    keepCard: jest.fn(),
    ...overrides,
  });
  const notices: TurnNotice[] = [];
  runs.onAnnounce((notice) => notices.push(notice));
  return { runs, api, stream, reattach, notices, state };
}

const started = (session = 's1', run = 'r1'): ChatFrame => ({
  type: 'run_started',
  run_id: run,
  session_id: session,
  epoch: 'e1',
  seq: 1,
});

const ask = { body: { message: 'Will it rain?', resumable: true } };

describe('a turn left by its screen', () => {
  it('keeps streaming, and its end is announced once, from one POST', async () => {
    const { runs, api, stream, notices } = harness();
    const { key, ended } = runs.start({ ...ask, title: 'Rain' });
    await settle();
    stream.last().onFrame(started());
    stream.last().onFrame({ type: 'text', content: 'It will ', seq: 2 });
    stream.last().onFrame({ type: 'text', content: 'rain.', seq: 3 });
    expect(runs.get(key)?.reply.content).toBe('It will rain.');
    stream.last().onFrame({ done: true, session_id: 's1', seq: 4 });
    stream.last().resolve();

    const end = await ended;
    await settle();
    expect(end.outcome).toBe('done');
    expect(end.reply.pending).toBe(false);
    expect(notices).toEqual([
      { kind: 'answered', sessionId: 's1', runId: 'r1', title: 'Rain', text: 'It will rain.' },
    ]);
    expect(api.streamChat).toHaveBeenCalledTimes(1);
    expect(api.reattachRun).not.toHaveBeenCalled();
  });

  it('is not announced to the person reading it, and is once they stop', async () => {
    const { runs, stream, notices } = harness();
    const release = runs.view('s1');

    const first = runs.start({ ...ask, body: { ...ask.body, session_id: 's1' } });
    await settle();
    stream.last().onFrame(started());
    stream.last().onFrame({ done: true, seq: 2 });
    stream.last().resolve();
    await first.ended;
    await settle();
    expect(notices).toHaveLength(0);

    release();
    const second = runs.start({ ...ask, body: { ...ask.body, session_id: 's1' } });
    await settle();
    stream.last().onFrame(started('s1', 'r2'));
    stream.last().onFrame({ done: true, seq: 2 });
    stream.last().resolve();
    await second.ended;
    await settle();
    expect(notices.map((n) => n.runId)).toEqual(['r2']);
  });

  it('is announced when the conversation is open but the app is not on screen', async () => {
    const { runs, stream, notices, state } = harness();
    runs.view('s1');
    state.onScreen = false;
    const { ended } = runs.start(ask);
    await settle();
    stream.last().onFrame(started());
    stream.last().onFrame({ done: true, seq: 2 });
    stream.last().resolve();
    await ended;
    await settle();
    expect(notices).toHaveLength(1);
  });

  it('says a turn that failed failed, and never announces one that was stopped', async () => {
    const { runs, api, stream, notices } = harness();
    const failing = runs.start(ask);
    await settle();
    stream.last().onFrame(started('s1', 'r1'));
    stream.last().onFrame({ error: 'model crashed', seq: 2 });
    stream.last().resolve();
    expect((await failing.ended).outcome).toBe('failed');

    const stopping = runs.start(ask);
    await settle();
    stream.last().onFrame(started('s2', 'r2'));
    runs.stop(stopping.key);
    expect((await stopping.ended).outcome).toBe('stopped');
    await settle();

    expect(notices.map((n) => [n.kind, n.runId])).toEqual([['failed', 'r1']]);
    expect(api.cancelRun).toHaveBeenCalledTimes(1);
    expect(api.cancelRun).toHaveBeenCalledWith('r2');
  });

  it('announces nothing for a question the Pond refused before it started', async () => {
    const { runs, stream, notices } = harness();
    const { ended } = runs.start(ask);
    await settle();
    stream.last().reject(new ApiError('POST /api/v1/chat/stream → 503', 503, null));
    const end = await ended;
    await settle();
    expect(end.outcome).toBe('failed');
    expect(end.error).toBeInstanceOf(ApiError);
    expect(notices).toHaveLength(0);
  });
});

describe('reattaching after a drop', () => {
  it('picks up after the last frame it saw, once, without asking the question again', async () => {
    const { runs, api, stream, reattach } = harness();
    const { key, ended } = runs.start(ask);
    await settle();
    stream.last().onFrame(started());
    stream.last().onFrame({ type: 'text', content: 'Sun ', seq: 2 });
    stream.last().reject(dropped());
    await settle();

    expect(api.reattachRun).toHaveBeenCalledTimes(1);
    expect(api.reattachRun.mock.calls[0].slice(0, 3)).toEqual(['r1', 2, 'e1']);
    reattach.last().onFrame({ type: 'reattached', run_id: 'r1', session_id: 's1', epoch: 'e1' });
    reattach.last().onFrame({ type: 'text', content: 'all day.', seq: 3 });
    reattach.last().onFrame({ done: true, seq: 4 });
    reattach.last().resolve();

    const end = await ended;
    expect(end.outcome).toBe('done');
    expect(end.reply.content).toBe('Sun all day.');
    expect(runs.get(key)).toBeUndefined();
    expect(api.streamChat).toHaveBeenCalledTimes(1);
  });

  it('spends no attempt while the app is in the background', async () => {
    let back!: () => void;
    const foreground = new Promise<void>((resolve) => {
      back = resolve;
    });
    const { runs, api, stream } = harness({ untilForeground: () => foreground });
    runs.start(ask);
    await settle();
    stream.last().onFrame(started());
    stream.last().reject(dropped());
    await settle();
    await settle();
    expect(api.reattachRun).not.toHaveBeenCalled();

    back();
    await settle();
    expect(api.reattachRun).toHaveBeenCalledTimes(1);
  });

  it('gives up after three attempts that each drop, and announces nothing', async () => {
    const { runs, api, stream, reattach, notices } = harness();
    const { ended } = runs.start(ask);
    await settle();
    stream.last().onFrame(started());
    stream.last().reject(dropped());
    for (let i = 0; i < 3; i += 1) {
      await settle();
      reattach.last().reject(dropped());
    }
    const end = await ended;
    await settle();
    expect(end.outcome).toBe('lost');
    expect(end.gone).toBe(false);
    expect(api.reattachRun).toHaveBeenCalledTimes(3);
    expect(api.listSessionMessages).not.toHaveBeenCalled();
    expect(notices).toHaveLength(0);
  });

  it('asks the saved conversation once about a run the Pond has forgotten, and stops', async () => {
    const { runs, api, stream, reattach, notices } = harness();
    api.listSessionMessages.mockResolvedValue([
      { id: 'm9', role: 'assistant', content: 'It rained.', created_at: '2026-10-23T10:00:00Z' } as SessionMessage,
    ]);
    const { ended } = runs.start(ask);
    await settle();
    stream.last().onFrame(started());
    stream.last().reject(dropped());
    await settle();
    reattach.last().reject(new ApiError('GET /api/v1/chat/runs/r1/events → 404', 404, null));

    const end = await ended;
    await settle();
    expect(end).toMatchObject({ outcome: 'lost', gone: true });
    expect(api.reattachRun).toHaveBeenCalledTimes(1);
    expect(api.listSessionMessages).toHaveBeenCalledTimes(1);
    expect(api.listSessionMessages).toHaveBeenCalledWith('s1', 1);
    expect(notices).toEqual([{ kind: 'answered', sessionId: 's1', runId: 'r1', title: null, text: 'It rained.' }]);
  });

  it('treats a Pond that restarted as a lost turn, with nothing to look up', async () => {
    const { runs, api, stream, reattach, notices } = harness();
    const { ended } = runs.start(ask);
    await settle();
    stream.last().onFrame(started());
    stream.last().reject(dropped());
    await settle();
    reattach.last().reject(new ApiError('GET /api/v1/chat/runs/r1/events → 410', 410, null));
    expect(await ended).toMatchObject({ outcome: 'lost', gone: false });
    await settle();
    expect(api.listSessionMessages).not.toHaveBeenCalled();
    expect(notices).toHaveLength(0);
  });

  it('marks a turn whose frames were evicted, so the saved copy is read instead', async () => {
    const { runs, stream } = harness();
    const { ended } = runs.start(ask);
    await settle();
    stream.last().onFrame(started());
    stream.last().onFrame({ type: 'replay_gap' });
    stream.last().onFrame({ done: true, seq: 9 });
    stream.last().resolve();
    expect(await ended).toMatchObject({ outcome: 'done', stale: true });
  });
});

describe('a turn waiting on Goose’s questions', () => {
  it('tells a reattached stream which ask calls it was waiting on, so its silence is not taken for a drop', async () => {
    const { runs, api, stream } = harness();
    runs.start(ask);
    await settle();
    stream.last().onFrame(started());
    stream.last().onFrame({ type: 'tool_call', tool: 'giap-questions__ask', id: 'a1', input: { questions: [] }, seq: 2 });
    stream.last().reject(dropped());
    await settle();
    expect(api.reattachRun).toHaveBeenCalledTimes(1);
    expect(api.reattachRun.mock.calls[0][5]).toEqual(new Set(['a1']));
  });

  it('reads a typed message taken as the answer, from either of its two frames', () => {
    expect(questionAnswered({ type: 'question_answered', batch_id: 'b1', session_id: 's1' })).toBe('b1');
    expect(questionAnswered({ done: true, session_id: 's1', question_answered: true })).toBeNull();
    expect(questionAnswered({ done: true, session_id: 's1' })).toBeUndefined();
    expect(questionAnswered({ type: 'text', content: 'Hello' })).toBeUndefined();
  });
});

describe('resuming a conversation on opening it', () => {
  it('costs nothing for a turn this phone is already holding', async () => {
    const { runs, api, stream } = harness();
    const held = runs.start({ ...ask, body: { ...ask.body, session_id: 's1' } });
    await settle();
    stream.last().onFrame(started());
    const found = await runs.resume('s1');
    expect(found?.key).toBe(held.key);
    expect(api.activeRun).not.toHaveBeenCalled();
    expect(api.reattachRun).not.toHaveBeenCalled();
  });

  it('looks the run up once, and follows a running one from its first frame', async () => {
    const { runs, api, reattach } = harness();
    api.activeRun.mockResolvedValue({
      run_id: 'r7',
      session_id: 's7',
      state: 'running',
      started_at: '2026-10-23T10:00:00Z',
      first_seq: 1,
      last_seq: 12,
      epoch: 'e7',
    });
    const found = await runs.resume('s7', 'Rain');
    await settle();
    expect(found).not.toBeNull();
    expect(api.activeRun).toHaveBeenCalledTimes(1);
    expect(api.reattachRun).toHaveBeenCalledTimes(1);
    expect(api.reattachRun.mock.calls[0].slice(0, 3)).toEqual(['r7', 0, 'e7']);
    expect(runs.answering().has('s7')).toBe(true);

    reattach.last().onFrame({ type: 'text', content: 'Yes.', seq: 2 });
    reattach.last().onFrame({ done: true, seq: 3 });
    reattach.last().resolve();
    expect((await found!.ended).reply.content).toBe('Yes.');
  });

  it('follows nothing when the Pond holds no run, or only a finished one', async () => {
    const { runs, api } = harness();
    expect(await runs.resume('s1')).toBeNull();
    api.activeRun.mockResolvedValue({
      run_id: 'r1',
      session_id: 's1',
      state: 'finished',
      started_at: '2026-10-23T10:00:00Z',
      first_seq: 1,
      last_seq: 40,
      epoch: 'e1',
    });
    expect(await runs.resume('s1')).toBeNull();
    expect(api.activeRun).toHaveBeenCalledTimes(2);
    expect(api.reattachRun).not.toHaveBeenCalled();
  });

  it('does not retry a lookup that failed', async () => {
    const { runs, api } = harness();
    api.activeRun.mockRejectedValue(dropped());
    expect(await runs.resume('s1')).toBeNull();
    expect(api.activeRun).toHaveBeenCalledTimes(1);
  });
});

describe('what the wall reads', () => {
  it('names a conversation as answering once the Pond does, and the same set until a turn ends', async () => {
    const { runs, stream } = harness();
    const { ended } = runs.start(ask);
    await settle();
    expect(runs.answering().size).toBe(0);
    stream.last().onFrame(started());
    const during = runs.answering();
    expect([...during]).toEqual(['s1']);
    stream.last().onFrame({ type: 'text', content: 'More', seq: 2 });
    expect(runs.answering()).toBe(during);
    stream.last().onFrame({ done: true, seq: 3 });
    stream.last().resolve();
    await ended;
    expect(runs.answering().size).toBe(0);
  });

  it('keeps a card that arrived before the conversation had a name, under the name', async () => {
    const keepCard = jest.fn();
    const { runs, stream } = harness({ keepCard });
    runs.start(ask);
    await settle();
    stream.last().onFrame({
      type: 'tool_result',
      id: 'c1',
      tool: 'giap-weather__get_current_weather',
      content: '23C',
      ui: { card_type: 'weather', data: { temperature: 23 } },
    });
    expect(keepCard).not.toHaveBeenCalled();
    stream.last().onFrame(started());
    expect(keepCard).toHaveBeenCalledWith('s1', 'c1', { type: 'weather', data: { temperature: 23 } });
  });
});
