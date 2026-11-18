// Goose's question batches (pond docs/architecture/structured-questions.md): every question in a
// batch is answered with its options or the member's own words under "Other", and the batch goes in
// one request; Done tells Goose to go ahead with what it has. The screen offers "Other" itself.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AnswerLine, AskedQuestion, Question, QuestionBatch } from '@/models/questions';
import { ApiError, api } from '@/services/api-client';
import { confirm } from '@/services/haptics';
import i18n from '@/services/i18n';
import { showSnackbar } from '@/services/snackbar';
import type { QuestionAnswerWire, QuestionBatchAnswerWire } from '@/services/types';
import { describeApiError, logFailure } from './describe-error';
import { useHubRead } from './hub-read';

/** Questions arrive when Goose starts on a plan; a read every couple of minutes while in front. */
export const QUESTIONS_MS = 2 * 60_000;

/** What the member has chosen so far for one question. */
export interface AnswerDraft {
  /** Option labels. */
  choices: string[];
  /** "Other" is chosen; its words are `text`. */
  other: boolean;
  text: string;
}

export const EMPTY_DRAFT: AnswerDraft = { choices: [], other: false, text: '' };

export type Drafts = Record<string, AnswerDraft>;

/** One option picked: a single-answer question keeps only it, a multi one toggles it. */
export function pick(question: Pick<AskedQuestion, 'multi'>, draft: AnswerDraft, option: string): AnswerDraft {
  if (!question.multi) return { ...draft, choices: [option], other: false };
  const has = draft.choices.includes(option);
  return { ...draft, choices: has ? draft.choices.filter((c) => c !== option) : [...draft.choices, option] };
}

/** "Other" chosen or let go: in a single-answer question it stands in for the options. */
export function pickOther(question: Pick<AskedQuestion, 'multi'>, draft: AnswerDraft, on: boolean): AnswerDraft {
  if (!question.multi && on) return { ...draft, choices: [], other: true };
  return { ...draft, other: on };
}

/** Whether there is anything to send: a choice, or words under "Other". */
export function canAnswer(draft: AnswerDraft): boolean {
  return draft.choices.length > 0 || (draft.other && draft.text.trim().length > 0);
}

/** The answer as the Pond takes it: the choices, and the member's words only when "Other" holds some. */
export function answerBody(draft: AnswerDraft): QuestionAnswerWire {
  const words = draft.other ? draft.text.trim() : '';
  return { choices: [...draft.choices], ...(words ? { text: words } : {}) };
}

/** A batch can go once any question in it has an answer; the rest stay Goose's to assume. */
export function canSubmit(questions: readonly Question[], drafts: Drafts): boolean {
  return questions.some((q) => canAnswer(drafts[q.id] ?? EMPTY_DRAFT));
}

/** `POST /batches/{id}/answer`'s body: the questions answered, in the batch's order. */
export function batchAnswerBody(questions: readonly Question[], drafts: Drafts): QuestionBatchAnswerWire {
  return {
    answers: questions.flatMap((q) => {
      const draft = drafts[q.id] ?? EMPTY_DRAFT;
      return canAnswer(draft) ? [{ question_id: q.id, ...answerBody(draft) }] : [];
    }),
  };
}

/** What a sent batch shows in place of its questions. */
export function answerLines(questions: readonly Question[], drafts: Drafts): AnswerLine[] {
  return questions.flatMap((q) => {
    const draft = drafts[q.id] ?? EMPTY_DRAFT;
    if (!canAnswer(draft)) return [];
    const words = answerBody(draft).text;
    const parts = [...draft.choices, ...(words ? [i18n.t('goose.questions.otherSaid', { words })] : [])];
    return [{ header: q.header || q.text, answer: parts.join(', ') }];
  });
}

/**
 * Sends a batch's answers. A Pond from before batches has no batch route, so there each answer
 * goes on its own, as that Pond takes them.
 */
export async function sendAnswers(batch: Pick<QuestionBatch, 'id' | 'questions'>, drafts: Drafts): Promise<void> {
  const body = batchAnswerBody(batch.questions, drafts);
  try {
    await api.answerQuestionBatch(batch.id, body);
  } catch (e) {
    if (!(e instanceof ApiError) || (e.status !== 404 && e.status !== 405)) throw e;
    for (const answer of body.answers) {
      const { question_id: id, ...rest } = answer;
      await api.answerQuestion(id, rest);
    }
  }
}

export type AnswerOutcome = 'ok' | 'closed' | 'failed';

/**
 * Sends or ends a batch, saying what went wrong if it did. A 409 is a batch no longer open
 * (answered elsewhere, or expired), which the caller refreshes; a 422 is an answer the Pond refused.
 */
export async function answerAction(run: () => Promise<void>): Promise<AnswerOutcome> {
  try {
    await run();
    return 'ok';
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      showSnackbar({ message: i18n.t('goose.questions.closed'), tone: 'neutral' });
      return 'closed';
    }
    logFailure('questions', 'answer failed', e);
    const said = e instanceof ApiError && e.status === 422 ? i18n.t('goose.questions.refused') : (describeApiError(e) ?? i18n.t('goose.errors.action'));
    showSnackbar({ message: said, tone: 'danger' });
    return 'failed';
  }
}

/** The member's choices across the questions on screen, held until they are sent. */
export function useDrafts() {
  const [drafts, setDrafts] = useState<Drafts>({});
  const latest = useRef(drafts);
  useEffect(() => {
    latest.current = drafts;
  });

  const draftOf = useCallback((id: string) => drafts[id] ?? EMPTY_DRAFT, [drafts]);
  const change = useCallback((id: string, next: (d: AnswerDraft) => AnswerDraft) => setDrafts((all) => ({ ...all, [id]: next(all[id] ?? EMPTY_DRAFT) })), []);
  const choose = useCallback((question: Question, option: string) => change(question.id, (d) => pick(question, d, option)), [change]);
  const chooseOther = useCallback((question: Question, on: boolean) => change(question.id, (d) => pickOther(question, d, on)), [change]);
  const setOtherText = useCallback((question: Question, text: string) => change(question.id, (d) => ({ ...d, other: true, text })), [change]);
  const clear = useCallback((ids: readonly string[]) => {
    setDrafts((all) => {
      const rest = { ...all };
      for (const id of ids) delete rest[id];
      return rest;
    });
  }, []);

  return { drafts, latest, draftOf, choose, chooseOther, setOtherText, clear };
}

export type UseDrafts = ReturnType<typeof useDrafts>;

export interface QuestionFilter {
  /** Only the batches about this plan. */
  anchorId?: string | null;
  /** Only this batch, as a notification names it. */
  batchId?: string | null;
}

/** The batches a screen shows: one named batch, a plan's batches, or all of them. */
export function batchesFor(batches: readonly QuestionBatch[], filter: QuestionFilter | undefined): QuestionBatch[] {
  if (filter?.batchId) {
    const named = batches.filter((b) => b.id === filter.batchId);
    if (named.length) return named;
  }
  if (filter?.anchorId) return batches.filter((b) => b.anchorId === filter.anchorId);
  return [...batches];
}

export type QuestionsBusy = { id: string; what: 'send' | 'enough' } | null;

export function useQuestions(filter?: QuestionFilter, enabled = true) {
  const read = useHubRead<QuestionBatch[]>('questions', () => api.questions(), [], QUESTIONS_MS, enabled);
  const { data, setData, reload } = read;
  const drafts = useDrafts();
  const { latest, clear } = drafts;
  const [busy, setBusy] = useState<QuestionsBusy>(null);

  const anchorId = filter?.anchorId ?? null;
  const batchId = filter?.batchId ?? null;
  const batches = useMemo(() => batchesFor(data, { anchorId, batchId }), [data, anchorId, batchId]);

  const settle = useCallback(
    (batch: QuestionBatch) => {
      setData((all) => all.filter((b) => b.id !== batch.id));
      clear(batch.questions.map((q) => q.id));
    },
    [setData, clear],
  );

  /** Resolves whether the Pond took the answers. */
  const submit = useCallback(
    async (batch: QuestionBatch): Promise<boolean> => {
      const now = latest.current;
      if (!canSubmit(batch.questions, now)) return false;
      setBusy({ id: batch.id, what: 'send' });
      const outcome = await answerAction(() => sendAnswers(batch, now));
      setBusy(null);
      if (outcome === 'closed') {
        settle(batch);
        void reload();
      }
      if (outcome !== 'ok') return false;
      settle(batch);
      void confirm();
      // A waiting chat turn carries on in its chat, where the answers arrive as the member's message.
      const said = batch.purpose === 'chat' && batch.state === 'waiting' ? 'goose.questions.thanksChat' : 'goose.questions.thanks';
      showSnackbar({ message: i18n.t(said), tone: 'success' });
      return true;
    },
    [latest, settle, reload],
  );

  /** Done: Goose stops asking this chain and goes ahead with what it has. */
  const enough = useCallback(
    async (batch: QuestionBatch): Promise<boolean> => {
      setBusy({ id: batch.id, what: 'enough' });
      const outcome = await answerAction(() => api.enoughQuestions(batch.id));
      setBusy(null);
      if (outcome === 'closed') {
        settle(batch);
        void reload();
      }
      if (outcome !== 'ok') return false;
      settle(batch);
      showSnackbar({ message: i18n.t('goose.questions.enoughSaid'), tone: 'success' });
      return true;
    },
    [settle, reload],
  );

  const count = batches.reduce((n, b) => n + b.questions.length, 0);
  const canSend = useCallback((batch: QuestionBatch) => canSubmit(batch.questions, drafts.drafts), [drafts.drafts]);

  return {
    ...read,
    batches,
    count,
    busy,
    canSend,
    draftOf: drafts.draftOf,
    actions: { reload: read.reload, choose: drafts.choose, chooseOther: drafts.chooseOther, setOtherText: drafts.setOtherText, submit, enough },
  };
}

export type UseQuestions = ReturnType<typeof useQuestions>;
