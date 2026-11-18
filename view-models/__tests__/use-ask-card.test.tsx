/**
 * The chat's question card: drawn from the `ask` call at once, the stored batch looked up a bounded
 * number of times, the answers sent under the batch's ids and shown in place of the questions.
 */

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ToolCall } from '@/models/chat';
import { readQuestionBatches } from '@/models/questions';
import { ApiError, api } from '@/services/api-client';
import { currentSnackbar, resetSnackbar } from '@/services/snackbar';
import { markAskAnswered, resetAnsweredAsks } from '@/services/answered-asks';
import { ASK_LOOKUP_MS, askedId, useAskCard, type UseAskCard } from '@/view-models/use-ask-card';

jest.mock('@/services/haptics', () => ({ confirm: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/services/api-client', () => {
  const actual = jest.requireActual('@/services/api-client');
  return { ...actual, api: { questions: jest.fn(), answerQuestion: jest.fn(), answerQuestionBatch: jest.fn(), enoughQuestions: jest.fn() } };
});
jest.mock('@/providers/server-provider', () => ({ useServer: () => ({ hydrated: true, isScreenReal: () => true }) }));

const pond = jest.mocked(api);

const input = {
  questions: [
    { header: 'Dates', text: 'When do you go?', options: [{ label: '12-15 Dec', description: 'School holidays' }, { label: '19-22 Dec', description: 'Christmas' }], recommended: 1 },
    { header: 'Budget', text: 'What budget?', options: ['Under KSh 20,000', 'More'] },
  ],
};

const call = (over: Partial<ToolCall> = {}): ToolCall => ({ id: 'c1', name: 'giap-questions__ask', args: JSON.stringify(input), status: 'running', ...over });

const stored = () =>
  readQuestionBatches({
    batches: [
      {
        id: 'b1',
        purpose: 'chat',
        session_id: 's1',
        state: 'open',
        title: 'Diani',
        questions: input.questions.map((q, i) => ({ ...q, id: `q${i + 1}` })),
      },
    ],
  });

async function mount(shown: ToolCall, sessionId: string | null = 's1') {
  let latest!: UseAskCard;
  const Probe = ({ c, s }: { c: ToolCall; s: string | null }) => {
    latest = useAskCard(c, s);
    return null;
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<Probe c={shown} s={sessionId} />);
  });
  return {
    get vm() {
      return latest;
    },
    update: async (c: ToolCall, s: string | null = sessionId) => {
      await act(async () => tree.update(<Probe c={c} s={s} />));
    },
    unmount: async () => {
      await act(async () => tree.unmount());
    },
  };
}

const flush = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await act(async () => {});
};

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  jest.useFakeTimers();
  resetSnackbar();
  resetAnsweredAsks();
  jest.resetAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  pond.answerQuestionBatch.mockResolvedValue(undefined);
  pond.enoughQuestions.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('the chat question card', () => {
  it('draws the questions from the call at once, and lets them be sent once the batch is found', async () => {
    pond.questions.mockResolvedValueOnce([]).mockResolvedValue(stored());
    const m = await mount(call());
    expect(m.vm.view).toMatchObject({ kind: 'card', ready: false });
    await flush(0);
    expect(m.vm.view).toMatchObject({ kind: 'card', ready: false });
    await flush(ASK_LOOKUP_MS[1]);
    expect(pond.questions).toHaveBeenCalledWith('s1');
    expect(m.vm.view).toMatchObject({ kind: 'card', ready: true });
    await m.unmount();
  });

  it('sends the answers under the batch’s ids, and shows them in place of the questions', async () => {
    pond.questions.mockResolvedValue(stored());
    const m = await mount(call());
    await flush(0);
    const view = m.vm.view;
    if (view.kind !== 'card') throw new Error('no card');
    const [dates, budget] = view.questions;
    expect(dates.id).toBe(askedId(dates));
    await act(async () => {
      m.vm.actions.choose(dates, '19-22 Dec');
      m.vm.actions.chooseOther(budget, true);
    });
    await act(async () => {
      m.vm.actions.setOtherText(budget, 'about 30k');
    });
    expect(m.vm.canSend).toBe(true);
    await act(async () => {
      await m.vm.actions.submit();
    });
    expect(pond.answerQuestionBatch).toHaveBeenCalledWith('b1', {
      answers: [
        { question_id: 'q1', choices: ['19-22 Dec'] },
        { question_id: 'q2', choices: [], text: 'about 30k' },
      ],
    });
    expect(m.vm.view).toEqual({
      kind: 'answers',
      lines: [
        { header: 'Dates', answer: '19-22 Dec' },
        { header: 'Budget', answer: 'Other: "about 30k"' },
      ],
    });
    await m.unmount();
  });

  it('stops looking after a bounded number of reads, and offers a retry', async () => {
    pond.questions.mockRejectedValue(new ApiError('GET → 503', 503, null));
    const m = await mount(call());
    for (const ms of ASK_LOOKUP_MS) await flush(ms);
    expect(pond.questions).toHaveBeenCalledTimes(ASK_LOOKUP_MS.length);
    expect(m.vm.view).toMatchObject({ kind: 'card', ready: false, lost: true });
    await flush(60_000);
    expect(pond.questions).toHaveBeenCalledTimes(ASK_LOOKUP_MS.length);
    await m.unmount();
  });

  it('waits for the conversation’s session before it looks', async () => {
    pond.questions.mockResolvedValue(stored());
    const m = await mount(call(), null);
    await flush(10_000);
    expect(pond.questions).not.toHaveBeenCalled();
    await m.update(call(), 's1');
    await flush(0);
    expect(m.vm.view).toMatchObject({ kind: 'card', ready: true });
    await m.unmount();
  });

  it('shows a saved turn’s answers without asking the Pond', async () => {
    const m = await mount(call({ status: 'ok', result: 'Dates: 12-15 Dec\nBudget: More' }));
    await flush(0);
    expect(pond.questions).not.toHaveBeenCalled();
    expect(m.vm.view).toEqual({ kind: 'answers', lines: [{ header: 'Dates', answer: '12-15 Dec' }, { header: 'Budget', answer: 'More' }] });
    await m.unmount();
  });

  it('keeps a call that stopped waiting answerable while its batch waits, and draws nothing once it is gone', async () => {
    pond.questions.mockResolvedValue([{ ...stored()[0], state: 'waiting' }]);
    const waiting = await mount(call({ status: 'ok', result: 'Not answered yet; the questions wait in My Goose.' }));
    await flush(0);
    expect(pond.questions).toHaveBeenCalledTimes(1);
    expect(waiting.vm.view).toMatchObject({ kind: 'card', ready: true });
    await waiting.unmount();

    pond.questions.mockResolvedValue([]);
    const gone = await mount(call({ status: 'ok', result: 'Refused: that question was asked already.' }));
    await flush(0);
    expect(gone.vm.view).toEqual({ kind: 'none' });
    await gone.unmount();
  });

  it('reads the member’s go-ahead from a finished call, without asking the Pond', async () => {
    const m = await mount(call({ status: 'ok', result: 'The member wants you to go ahead with what you have.' }));
    await flush(0);
    expect(pond.questions).not.toHaveBeenCalled();
    expect(m.vm.view).toEqual({ kind: 'ended' });
    await m.unmount();
  });

  it('shows a message typed while it waited as the answer, for its own batch only', async () => {
    pond.questions.mockResolvedValue(stored());
    const m = await mount(call());
    await flush(0);
    await act(async () => markAskAnswered('s1', { batchId: 'other-batch', text: 'about 30k' }));
    expect(m.vm.view).toMatchObject({ kind: 'card' });
    await act(async () => markAskAnswered('s1', { batchId: 'b1', text: 'about 30k' }));
    expect(m.vm.view).toEqual({ kind: 'answers', lines: [{ header: 'Dates', answer: 'Other: "about 30k"' }] });
    await m.unmount();
  });

  it('reads the batch again when the Pond says it is no longer open, and keeps the answers on a refusal', async () => {
    pond.questions.mockResolvedValue(stored());
    const m = await mount(call());
    await flush(0);
    const view = m.vm.view;
    if (view.kind !== 'card') throw new Error('no card');
    await act(async () => m.vm.actions.choose(view.questions[0], '12-15 Dec'));
    pond.answerQuestionBatch.mockRejectedValueOnce(new ApiError('POST → 422', 422, null));
    await act(async () => {
      await m.vm.actions.submit();
    });
    expect(m.vm.view).toMatchObject({ kind: 'card', ready: true });
    expect(currentSnackbar()?.message).toBe("Goose couldn't take that answer. Check it and send again.");
    pond.answerQuestionBatch.mockRejectedValueOnce(new ApiError('POST → 409', 409, null));
    const reads = pond.questions.mock.calls.length;
    await act(async () => {
      await m.vm.actions.submit();
    });
    await flush(0);
    expect(pond.questions.mock.calls.length).toBe(reads + 1);
    expect(currentSnackbar()?.message).toBe('These questions were already answered or closed');
    await m.unmount();
  });

  it('ends the questions with Done', async () => {
    pond.questions.mockResolvedValue(stored());
    const m = await mount(call());
    await flush(0);
    await act(async () => {
      await m.vm.actions.enough();
    });
    expect(pond.enoughQuestions).toHaveBeenCalledWith('b1');
    expect(m.vm.view).toEqual({ kind: 'ended' });
    await m.unmount();
  });
});
