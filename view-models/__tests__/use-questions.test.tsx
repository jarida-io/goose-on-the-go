/**
 * Goose's questions: a batch’s choices and the member's own words under Other go in one request as
 * the Pond takes them, an older Pond gets them one by one, and an answered or ended batch leaves.
 */

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { readQuestionBatches, type Question } from '@/models/questions';
import { ApiError, api } from '@/services/api-client';
import { currentSnackbar, resetSnackbar } from '@/services/snackbar';
import { answerBody, answerLines, batchAnswerBody, canAnswer, canSubmit, EMPTY_DRAFT, pick, pickOther, useQuestions, type QuestionFilter, type UseQuestions } from '@/view-models/use-questions';

jest.mock('@/services/pond-trust', () => ({ assertPondTrust: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/services/secure-random', () => ({ randomBytes: (n: number) => new Uint8Array(n).fill(7) }));
jest.mock('@/services/haptics', () => ({ confirm: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/services/api-client', () => {
  const actual = jest.requireActual('@/services/api-client');
  return { ...actual, api: { questions: jest.fn(), answerQuestion: jest.fn(), answerQuestionBatch: jest.fn(), enoughQuestions: jest.fn() } };
});
jest.mock('@/providers/server-provider', () => ({ useServer: () => ({ hydrated: true, isScreenReal: () => true }) }));
jest.mock('../use-live', () => ({
  useLive: (read: () => Promise<unknown>, _delay: unknown, enabled = true) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(() => {
      if (enabled) void read();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);
  },
}));

const pond = jest.mocked(api);

const held = () =>
  readQuestionBatches({
    batches: [
      {
        id: 'b1',
        purpose: 'anchor',
        anchor_id: 'a1',
        title: 'Questions about Diani trip',
        state: 'open',
        questions: [
          { id: 'q1', header: 'Stay', text: 'Where will you stay?', options: ['A hotel', 'A villa', 'Other'], multi: false },
          {
            id: 'q2',
            header: 'Doing',
            text: 'What do you want to do?',
            options: [
              { label: 'Snorkel', description: 'Reef trips from the beach' },
              { label: 'Kitesurf', description: 'Lessons at Galu' },
            ],
            recommended: 0,
            multi: true,
          },
        ],
      },
      { id: 'b2', purpose: 'chat', session_id: 's1', state: 'waiting', title: 'Planning Diani', questions: [{ id: 'q3', header: 'Budget', text: 'What budget?', options: [{ label: 'Under KSh 20,000', description: 'Self-catering' }, { label: 'More', description: 'A hotel' }], multi: false }] },
      { id: 'b3', purpose: 'profile', questions: [] },
    ],
  });

async function mount(filter?: QuestionFilter): Promise<{ readonly vm: UseQuestions; unmount: () => Promise<void> }> {
  let latest!: UseQuestions;
  const Probe = () => {
    latest = useQuestions(filter);
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

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  resetSnackbar();
  jest.resetAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  pond.questions.mockImplementation(async () => held());
  pond.answerQuestion.mockResolvedValue(undefined);
  pond.answerQuestionBatch.mockResolvedValue(undefined);
  pond.enoughQuestions.mockResolvedValue(undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('choosing an answer', () => {
  const single: Pick<Question, 'multi'> = { multi: false };
  const multi: Pick<Question, 'multi'> = { multi: true };

  it('keeps one choice in a single-answer question, and Other stands in for the options', () => {
    const a = pick(single, EMPTY_DRAFT, 'A hotel');
    const b = pick(single, a, 'A villa');
    expect(b.choices).toEqual(['A villa']);
    expect(pickOther(single, b, true)).toEqual({ choices: [], other: true, text: '' });
  });

  it('toggles choices in a multi-answer question, beside Other', () => {
    const a = pickOther(multi, pick(multi, pick(multi, EMPTY_DRAFT, 'Snorkel'), 'Kitesurf'), true);
    expect(a).toMatchObject({ choices: ['Snorkel', 'Kitesurf'], other: true });
    expect(pick(multi, a, 'Snorkel').choices).toEqual(['Kitesurf']);
  });

  it('sends the words under Other only when Other holds some', () => {
    expect(canAnswer({ choices: [], other: true, text: '  ' })).toBe(false);
    expect(answerBody({ choices: [], other: true, text: ' A friend’s flat ' })).toEqual({ choices: [], text: 'A friend’s flat' });
    expect(answerBody({ choices: ['A hotel'], other: false, text: 'left over' })).toEqual({ choices: ['A hotel'] });
  });
});

describe('a batch’s answer', () => {
  const [batch] = held();

  it('holds every answered question in the batch’s order, with Other’s words only when it has some', () => {
    const drafts = {
      q2: { choices: ['Snorkel', 'Kitesurf'], other: true, text: '  Dhow trip ' },
      q1: { choices: [], other: true, text: 'With my aunt' },
    };
    expect(batchAnswerBody(batch.questions, drafts)).toEqual({
      answers: [
        { question_id: 'q1', choices: [], text: 'With my aunt' },
        { question_id: 'q2', choices: ['Snorkel', 'Kitesurf'], text: 'Dhow trip' },
      ],
    });
  });

  it('leaves out a question with nothing chosen, and can go once any question has an answer', () => {
    const drafts = { q1: { choices: [], other: true, text: '   ' }, q2: { choices: ['Snorkel'], other: false, text: '' } };
    expect(batchAnswerBody(batch.questions, drafts).answers.map((a) => a.question_id)).toEqual(['q2']);
    expect(canSubmit(batch.questions, drafts)).toBe(true);
    expect(canSubmit(batch.questions, { q1: drafts.q1 })).toBe(false);
  });

  it('reads back as each header with what was said', () => {
    const lines = answerLines(batch.questions, { q1: { choices: ['A villa'], other: false, text: '' }, q2: { choices: ['Kitesurf'], other: true, text: 'Dhow' } });
    expect(lines).toEqual([
      { header: 'Stay', answer: 'A villa' },
      { header: 'Doing', answer: 'Kitesurf, Other: "Dhow"' },
    ]);
  });
});

describe('the questions view-model', () => {
  it('reads open and waiting batches, and drops one with no questions and an option named Other', async () => {
    const m = await mount();
    expect(m.vm.batches.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(m.vm.batches[0].questions[0].options.map((o) => o.label)).toEqual(['A hotel', 'A villa']);
    expect(m.vm.batches[1]).toMatchObject({ purpose: 'chat', sessionId: 's1', state: 'waiting' });
    expect(m.vm.count).toBe(3);
    await m.unmount();
  });

  it('shows only the batch a notification named, or a plan’s batches', async () => {
    const named = await mount({ batchId: 'b2' });
    expect(named.vm.batches.map((b) => b.id)).toEqual(['b2']);
    await named.unmount();
    const plan = await mount({ anchorId: 'a1' });
    expect(plan.vm.batches.map((b) => b.id)).toEqual(['b1']);
    await plan.unmount();
  });

  it('sends the whole batch in one request, and the batch leaves the list', async () => {
    const m = await mount();
    const [q1, q2] = m.vm.batches[0].questions;
    await act(async () => {
      m.vm.actions.chooseOther(q1, true);
    });
    await act(async () => {
      m.vm.actions.setOtherText(q1, 'With my aunt in Ukunda');
      m.vm.actions.choose(q2, 'Snorkel');
    });
    expect(m.vm.canSend(m.vm.batches[0])).toBe(true);
    await act(async () => {
      await m.vm.actions.submit(m.vm.batches[0]);
    });
    expect(pond.answerQuestionBatch).toHaveBeenCalledTimes(1);
    expect(pond.answerQuestionBatch).toHaveBeenCalledWith('b1', {
      answers: [
        { question_id: 'q1', choices: [], text: 'With my aunt in Ukunda' },
        { question_id: 'q2', choices: ['Snorkel'] },
      ],
    });
    expect(pond.answerQuestion).not.toHaveBeenCalled();
    expect(m.vm.batches.map((b) => b.id)).toEqual(['b2']);
    expect(m.vm.draftOf('q1')).toEqual(EMPTY_DRAFT);
    await m.unmount();
  });

  it('answers question by question on a Pond with no batch route', async () => {
    pond.answerQuestionBatch.mockRejectedValue(new ApiError('POST → 404', 404, null));
    const m = await mount();
    const [q1, q2] = m.vm.batches[0].questions;
    await act(async () => {
      m.vm.actions.choose(q1, 'A villa');
      m.vm.actions.choose(q2, 'Kitesurf');
    });
    await act(async () => {
      await m.vm.actions.submit(m.vm.batches[0]);
    });
    expect(pond.answerQuestion.mock.calls).toEqual([
      ['q1', { choices: ['A villa'] }],
      ['q2', { choices: ['Kitesurf'] }],
    ]);
    expect(m.vm.batches.map((b) => b.id)).toEqual(['b2']);
    await m.unmount();
  });

  it('sends nothing without a choice or words', async () => {
    const m = await mount();
    let sent = true;
    await act(async () => {
      sent = await m.vm.actions.submit(m.vm.batches[0]);
    });
    expect(sent).toBe(false);
    expect(pond.answerQuestionBatch).not.toHaveBeenCalled();
    await m.unmount();
  });

  it('keeps the batch and its answers when the Pond refuses', async () => {
    pond.answerQuestionBatch.mockRejectedValue(new ApiError('POST → 422', 422, null));
    const m = await mount();
    const q3 = m.vm.batches[1].questions[0];
    await act(async () => {
      m.vm.actions.choose(q3, 'More');
    });
    await act(async () => {
      await m.vm.actions.submit(m.vm.batches[1]);
    });
    expect(pond.answerQuestion).not.toHaveBeenCalled();
    expect(m.vm.batches).toHaveLength(2);
    expect(m.vm.draftOf('q3').choices).toEqual(['More']);
    await m.unmount();
  });

  it('takes a batch no longer open off the list and reads again, and keeps one whose answer was refused', async () => {
    const m = await mount();
    const q3 = m.vm.batches[1].questions[0];
    await act(async () => m.vm.actions.choose(q3, 'More'));
    pond.answerQuestionBatch.mockRejectedValueOnce(new ApiError('POST → 422', 422, null));
    await act(async () => {
      await m.vm.actions.submit(m.vm.batches[1]);
    });
    expect(m.vm.batches.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(currentSnackbar()?.message).toBe("Goose couldn't take that answer. Check it and send again.");
    pond.answerQuestionBatch.mockRejectedValueOnce(new ApiError('POST → 409', 409, null));
    pond.questions.mockResolvedValue(held().slice(0, 1));
    await act(async () => {
      await m.vm.actions.submit(m.vm.batches[1]);
    });
    expect(pond.questions).toHaveBeenCalledTimes(2);
    expect(m.vm.batches.map((b) => b.id)).toEqual(['b1']);
    expect(currentSnackbar()?.message).toBe('These questions were already answered or closed');
    await m.unmount();
  });

  it('ends a batch with Done, which leaves the list', async () => {
    const m = await mount();
    await act(async () => {
      await m.vm.actions.enough(m.vm.batches[1]);
    });
    expect(pond.enoughQuestions).toHaveBeenCalledWith('b2');
    expect(m.vm.batches.map((b) => b.id)).toEqual(['b1']);
    await m.unmount();
  });
});
