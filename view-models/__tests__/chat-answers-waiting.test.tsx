/**
 * A message typed while Goose waits on its questions goes at once, not behind the waiting turn:
 * the Pond takes it as the answer in a two-frame stream, the member's bubble shows with no empty
 * reply under it, the card learns it was answered, and the waiting turn carries on in its own stream.
 */

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { api } from '@/services/api-client';
import '@/services/i18n';
import { forgetAllThreads } from '@/services/chat-threads';
import { askAnsweredIn, resetAnsweredAsks } from '@/services/answered-asks';
import type { ChatFrame } from '@/services/types';
import { useChat, type UseChat } from '@/view-models/use-chat';

jest.mock('@/services/api-client', () => {
  const actual = jest.requireActual('@/services/api-client');
  return {
    ...actual,
    api: {
      listSessionMessages: jest.fn(),
      listSessions: jest.fn(),
      activeRun: jest.fn(),
      reattachRun: jest.fn(),
      streamChat: jest.fn(),
      cancelRun: jest.fn(),
    },
  };
});

jest.mock('@/providers/server-provider', () => ({
  useServer: () => ({ hydrated: true, isScreenReal: () => true }),
}));

jest.mock('@/services/card-cache', () => ({
  cardsFor: () => Promise.resolve({}),
  rememberCard: () => Promise.resolve(),
  forgetCalls: () => Promise.resolve(),
}));

const pond = jest.mocked(api);

interface Opened {
  onFrame: (frame: ChatFrame) => void;
  resolve: () => void;
}

/** Each call to a streaming route stays open until the test ends it. */
function holdOpen(route: jest.Mock): Opened[] {
  const opened: Opened[] = [];
  route.mockImplementation((...args: unknown[]) => {
    const onFrame = args.find((a) => typeof a === 'function') as (frame: ChatFrame) => void;
    return new Promise<void>((resolve) => opened.push({ onFrame, resolve }));
  });
  return opened;
}

async function mount(): Promise<{ readonly vm: UseChat; unmount: () => Promise<void> }> {
  let latest!: UseChat;
  const Probe = () => {
    latest = useChat();
    return null;
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<Probe />);
  });
  return {
    get vm() {
      return latest;
    },
    unmount: async () => {
      await act(async () => tree.unmount());
    },
  };
}

/** Let the stream's frames reach the screen, which batches them. */
const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 80)));

/** Frames as the Pond sends them, then the end of the stream if `end`. */
const deliver = (stream: Opened, frames: ChatFrame[], end = false) =>
  act(async () => {
    for (const frame of frames) stream.onFrame(frame);
    if (end) stream.resolve();
  });

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  jest.clearAllMocks();
  forgetAllThreads();
  resetAnsweredAsks();
  pond.listSessions.mockResolvedValue([]);
  pond.cancelRun.mockResolvedValue(undefined);
  pond.activeRun.mockResolvedValue(null);
  pond.listSessionMessages.mockResolvedValue([]);
});

const asking: ChatFrame[] = [
  { type: 'run_started', run_id: 'r1', session_id: 's1', epoch: 'e1', seq: 1 },
  { type: 'tool_call', tool: 'giap-questions__ask', id: 'a1', input: { questions: [{ header: 'Budget', text: 'What budget?', options: ['Under 20k', 'More'] }] }, seq: 2 },
];

describe('typing while Goose waits on its questions', () => {
  it('sends the message as the answer at once, draws only the member’s bubble, and the turn carries on', async () => {
    const streams = holdOpen(pond.streamChat);
    const chat = await mount();
    await act(async () => void chat.vm.actions.send('Plan the Diani trip'));
    await flush();
    await deliver(streams[0], asking);
    await flush();

    let sent!: Promise<string | null>;
    await act(async () => {
      sent = chat.vm.actions.send('about 30k');
    });
    expect(pond.streamChat).toHaveBeenCalledTimes(2);
    expect(pond.streamChat.mock.calls[1][0]).toMatchObject({ message: 'about 30k', session_id: 's1' });
    await deliver(streams[1], [{ type: 'question_answered', batch_id: 'b1', session_id: 's1' }, { done: true, session_id: 's1', question_answered: true }], true);
    await act(async () => {
      await sent;
    });
    await flush();

    expect(chat.vm.data.queued).toEqual([]);
    expect(chat.vm.data.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'Plan the Diani trip'],
      ['assistant', ''],
      ['user', 'about 30k'],
    ]);
    expect(askAnsweredIn('s1')).toEqual({ batchId: 'b1', text: 'about 30k' });

    await deliver(
      streams[0],
      [
        { type: 'tool_result', tool: 'giap-questions__ask', id: 'a1', content: 'Budget: Other: "about 30k"', seq: 3 },
        { type: 'text', content: 'Then a guesthouse in Galu.', seq: 4 },
        { done: true, session_id: 's1', seq: 5 },
      ],
      true,
    );
    await flush();
    expect(chat.vm.data.streaming).toBe(false);
    expect(chat.vm.data.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'Plan the Diani trip'],
      ['assistant', 'Then a guesthouse in Galu.'],
      ['user', 'about 30k'],
    ]);
    await chat.unmount();
  });

  it('asks the message as an ordinary turn, behind the waiting one, when the Pond did not take it as an answer', async () => {
    const streams = holdOpen(pond.streamChat);
    const chat = await mount();
    await act(async () => void chat.vm.actions.send('Plan the Diani trip'));
    await flush();
    await deliver(streams[0], asking);
    await flush();

    await act(async () => {
      void chat.vm.actions.send('about 30k');
    });
    await deliver(streams[1], [{ error: 'busy' }, { done: true }], true);
    await flush();
    expect(chat.vm.data.queued.map((m) => m.content)).toEqual(['about 30k']);
    expect(chat.vm.data.messages.map((m) => m.content)).toEqual(['Plan the Diani trip', '']);
    expect(askAnsweredIn('s1')).toBeNull();
    await deliver(streams[0], [{ done: true, session_id: 's1', seq: 3 }], true);
    await flush();
    await chat.unmount();
  });

  it('queues a message as before when no question is waiting', async () => {
    const streams = holdOpen(pond.streamChat);
    const chat = await mount();
    await act(async () => void chat.vm.actions.send('Plan the Diani trip'));
    await flush();
    await deliver(streams[0], [{ type: 'run_started', run_id: 'r1', session_id: 's1', epoch: 'e1', seq: 1 }, { type: 'text', content: 'Looking', seq: 2 }]);
    await flush();
    await act(async () => {
      void chat.vm.actions.send('and the weather');
    });
    expect(pond.streamChat).toHaveBeenCalledTimes(1);
    expect(chat.vm.data.queued.map((m) => m.content)).toEqual(['and the weather']);
    await deliver(streams[0], [{ done: true, session_id: 's1', seq: 3 }], true);
    await flush();
    await chat.unmount();
  });
});
