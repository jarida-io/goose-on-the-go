// The question card a chat turn draws where Goose called `giap-questions__ask`
// (pond docs/architecture/structured-questions.md, section 5). The card is drawn from the call's own
// input at once; the stored batch, which holds the ids an answer needs, is read from the Pond beside it.

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import type { ToolCall } from '@/models/chat';
import { matchBatch, readAskInput, readAskResult, type AnswerLine, type AskedQuestion, type Question, type QuestionBatch } from '@/models/questions';
import { useServer } from '@/providers/server-provider';
import { askAnsweredIn, onAskAnswered, type TypedAnswer } from '@/services/answered-asks';
import { api } from '@/services/api-client';
import { confirm } from '@/services/haptics';
import i18n from '@/services/i18n';
import { logFailure } from './describe-error';
import { answerAction, answerLines, canSubmit, sendAnswers, useDrafts, type Drafts } from './use-questions';

/**
 * While the call runs the Pond may not have stored the batch yet, so the read is tried a few times,
 * spaced out; bounded, since a Pond's rate limit is shared with everything else the phone asks.
 */
export const ASK_LOOKUP_MS: readonly number[] = [0, 600, 1500, 3000, 5000];

export type AskCardView =
  | { kind: 'none' }
  | { kind: 'card'; questions: Question[]; ready: boolean; lost: boolean }
  | { kind: 'answers'; lines: AnswerLine[] }
  | { kind: 'ended' };

const textKey = (text: string) => text.trim().toLowerCase();

/** A question of the call's input, keyed by its words until the batch's ids are known. */
export function askedId(question: Pick<AskedQuestion, 'text'>): string {
  return `ask:${textKey(question.text)}`;
}

/** The call's questions as the card draws them: the stored batch's, which the Pond may have cut, once known. */
export function cardQuestions(asked: readonly AskedQuestion[], batch: QuestionBatch | null): Question[] {
  const all = asked.map((q) => ({ ...q, id: askedId(q) }));
  if (!batch) return all;
  return all.filter((q) => batch.questions.some((b) => textKey(b.text) === textKey(q.text)));
}

/** The member's choices, moved from the card's own keys to the batch's question ids. */
export function draftsForBatch(batch: QuestionBatch, drafts: Drafts): Drafts {
  const out: Drafts = {};
  for (const q of batch.questions) {
    const draft = drafts[askedId(q)];
    if (draft) out[q.id] = draft;
  }
  return out;
}

/** A message typed while the card waited, as the card shows it: "Other" for its first question. */
export function typedLines(questions: readonly Pick<AskedQuestion, 'header' | 'text'>[], typed: TypedAnswer): AnswerLine[] {
  const first = questions[0];
  return first ? [{ header: first.header || first.text, answer: i18n.t('goose.questions.otherSaid', { words: typed.text }) }] : [];
}

export function useAskCard(call: ToolCall, sessionId: string | null) {
  const { isScreenReal } = useServer();
  const real = isScreenReal('chat');
  const asked = useMemo(() => readAskInput(call.args), [call.args]);
  const running = call.status === 'running';
  const result = useMemo(() => (running ? null : readAskResult(call.result, asked)), [running, call.result, asked]);
  const returned = result?.kind === 'answers' ? result.lines : [];
  const typedIn = useSyncExternalStore(onAskAnswered, () => askAnsweredIn(sessionId));
  const drafts = useDrafts();
  const [batch, setBatch] = useState<QuestionBatch | null>(null);
  /** Every read failed: the Pond could not be asked for the batch's ids. */
  const [lost, setLost] = useState(false);
  const [sent, setSent] = useState<AnswerLine[] | null>(null);
  const [ended, setEnded] = useState(false);
  const [busy, setBusy] = useState<'send' | 'enough' | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Only a typed answer to this card's batch, or to a batch it never found while it waited, is its own.
  const typed = typedIn && running && (batch === null || typedIn.batchId === null || typedIn.batchId === batch.id) ? typedIn : null;
  const settled = sent !== null || ended || returned.length > 0 || result?.kind === 'enough' || typed !== null;
  const wanted = real && asked.length > 0 && !settled && sessionId !== null;

  useEffect(() => {
    if (!wanted || !sessionId) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // A finished call is read once: its batch is either still waiting for the member or gone.
    const delays = running ? ASK_LOOKUP_MS : [0];
    const look = (i: number, failed: boolean) => {
      if (i >= delays.length) {
        // Gone from the open ones: answered elsewhere, or the chat's session was deleted.
        if (!failed) setBatch(null);
        setLost(failed);
        return;
      }
      timer = setTimeout(async () => {
        try {
          const found = matchBatch(await api.questions(sessionId), asked);
          if (!live) return;
          if (found) {
            setBatch(found);
            setLost(false);
            return;
          }
          look(i + 1, false);
        } catch (e) {
          if (!live) return;
          logFailure('questions', 'chat batch read failed', e);
          look(i + 1, true);
        }
      }, delays[i]);
    };
    look(0, false);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [wanted, sessionId, running, asked, attempt]);

  const questions = useMemo(() => cardQuestions(asked, batch), [asked, batch]);

  const retry = useCallback(() => {
    setLost(false);
    setAttempt((n) => n + 1);
  }, []);

  /** The batch is no longer open: read again, which finds it gone or under its new state. */
  const reread = useCallback(() => {
    setBatch(null);
    retry();
  }, [retry]);

  const submit = useCallback(async (): Promise<boolean> => {
    if (!batch) return false;
    const mine = draftsForBatch(batch, drafts.latest.current);
    if (!canSubmit(batch.questions, mine)) return false;
    setBusy('send');
    const outcome = await answerAction(() => sendAnswers(batch, mine));
    setBusy(null);
    if (outcome === 'closed') reread();
    if (outcome !== 'ok') return false;
    void confirm();
    setSent(answerLines(batch.questions, mine));
    return true;
  }, [batch, drafts.latest, reread]);

  const enough = useCallback(async (): Promise<boolean> => {
    if (!batch) return false;
    setBusy('enough');
    const outcome = await answerAction(() => api.enoughQuestions(batch.id));
    setBusy(null);
    if (outcome === 'closed') reread();
    if (outcome === 'ok') setEnded(true);
    return outcome === 'ok';
  }, [batch, reread]);

  const view: AskCardView = sent
    ? { kind: 'answers', lines: sent }
    : typed
      ? { kind: 'answers', lines: typedLines(questions.length ? questions : asked, typed) }
      : ended || result?.kind === 'enough'
        ? { kind: 'ended' }
      : returned.length > 0
        ? { kind: 'answers', lines: returned }
        : asked.length === 0 || questions.length === 0
          ? { kind: 'none' }
          : running || batch !== null
            ? { kind: 'card', questions, ready: batch !== null, lost: running && lost }
            : { kind: 'none' };

  return {
    view,
    batch,
    busy,
    canSend: canSubmit(questions, drafts.drafts),
    draftOf: drafts.draftOf,
    actions: { choose: drafts.choose, chooseOther: drafts.chooseOther, setOtherText: drafts.setOtherText, submit, enough, retry },
  };
}

export type UseAskCard = ReturnType<typeof useAskCard>;
