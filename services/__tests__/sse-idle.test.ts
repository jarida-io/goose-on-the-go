/**
 * The stall guard: silence longer than the window ends a stream as stalled, and a window given as
 * a function is read again after each chunk, so a frame that says the Pond will be quiet widens it.
 */

import { readSse, StreamStalledError } from '@/services/sse';

/** A response whose body yields the given chunks, then stays open until cancelled. */
function openResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  let cancel!: () => void;
  const closed = new Promise<{ done: true; value: undefined }>((resolve) => {
    cancel = () => resolve({ done: true, value: undefined });
  });
  const queue = chunks.map((c) => encoder.encode(c));
  const reader = {
    read: () => (queue.length ? Promise.resolve({ done: false, value: queue.shift()! }) : closed),
    cancel: () => {
      cancel();
      return Promise.resolve();
    },
  };
  return { response: { body: { getReader: () => reader } } as unknown as Response, cancel };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const settle = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('the stall guard', () => {
  it('ends a stream silent for longer than its window as stalled', async () => {
    const { response } = openResponse(['data: {"type":"text"}\n\n']);
    const read = readSse(response, () => {}, { idleMs: 60_000 });
    const outcome = read.then(
      () => 'ended',
      (e) => (e instanceof StreamStalledError ? 'stalled' : 'failed'),
    );
    await settle();
    jest.advanceTimersByTime(60_001);
    await expect(outcome).resolves.toBe('stalled');
  });

  it('waits as long as a frame says the Pond will be quiet', async () => {
    let waiting = false;
    const { response, cancel } = openResponse(['data: {"type":"tool_call"}\n\n']);
    let stalled = false;
    const read = readSse(response, () => (waiting = true), { idleMs: () => (waiting ? 660_000 : 60_000) }).catch((e) => {
      stalled = e instanceof StreamStalledError;
    });
    await settle();
    jest.advanceTimersByTime(9 * 60_000);
    await settle();
    expect(stalled).toBe(false);
    cancel();
    await read;
    expect(stalled).toBe(false);
  });
});
