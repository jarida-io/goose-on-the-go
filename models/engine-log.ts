// What Goose worked on for the member: every maker-and-critic run, and the jobs the heartbeat left
// itself, waiting on a condition (pond docs/architecture/my-goose-hub.md, "The engine log" and
// "Intentions").

import type { TranslationKey } from '@/services/i18n';

import { count, list, oneOf, readAll, record, text, textOrNull, time } from './me-read';
import type { Objection } from './anchors';

export type EngineJobState = 'queued' | 'running' | 'passed' | 'unsure' | 'dropped' | 'failed' | 'cancelled';
export type IntentionAct = 'push' | 'refresh' | 'look_into' | 'ask' | 'propose_todo';
export type IntentionState = 'waiting' | 'done' | 'expired' | 'dropped';

const JOB_STATES: readonly EngineJobState[] = ['queued', 'running', 'passed', 'unsure', 'dropped', 'failed', 'cancelled'];
const ACTS: readonly IntentionAct[] = ['push', 'refresh', 'look_into', 'ask', 'propose_todo'];
const INTENTION_STATES: readonly IntentionState[] = ['waiting', 'done', 'expired', 'dropped'];

export interface EngineJob {
  id: string;
  kind: string;
  subject: string;
  state: EngineJobState;
  rounds: number;
  objections: Objection[];
  outcome: string | null;
  anchorId: string | null;
  deliverableId: string | null;
  createdAt: string | null;
  finishedAt: string | null;
}

export interface Intention {
  id: string;
  act: IntentionAct;
  text: string;
  why: string;
  /** The condition, as the member reads it: "tomorrow at 7am". */
  when: string;
  until: string | null;
  state: IntentionState;
  outcome: string | null;
  anchorId: string | null;
  createdAt: string | null;
}

export function readEngineJob(raw: unknown): EngineJob | null {
  const r = record(raw);
  const id = text(r?.id);
  if (!r || !id) return null;
  return {
    id,
    kind: text(r.kind),
    subject: text(r.subject),
    state: oneOf(r.state, JOB_STATES, 'queued'),
    rounds: count(r.rounds),
    objections: list(r.objections).flatMap((o) => {
      const x = record(o);
      const about = text(x?.about);
      return about ? [{ kind: text(x?.kind), about, fix: text(x?.fix) }] : [];
    }),
    outcome: textOrNull(r.outcome),
    anchorId: textOrNull(r.anchor_id),
    deliverableId: textOrNull(r.deliverable_id),
    createdAt: time(r.created_at),
    finishedAt: time(r.finished_at),
  };
}

export function readEngineJobs(raw: unknown): EngineJob[] {
  return readAll(raw, 'jobs', readEngineJob);
}

export function readIntention(raw: unknown): Intention | null {
  const r = record(raw);
  const id = text(r?.id);
  const words = text(r?.text);
  if (!r || !id || !words) return null;
  return {
    id,
    act: oneOf(r.act, ACTS, 'push'),
    text: words,
    why: text(r.why),
    when: text(r.when),
    until: time(r.until) ?? textOrNull(r.until),
    // An unknown state is not offered to withdraw: only a waiting one can be.
    state: oneOf(r.state, INTENTION_STATES, 'done'),
    outcome: textOrNull(r.outcome),
    anchorId: textOrNull(r.anchor_id),
    createdAt: time(r.created_at),
  };
}

export function readIntentions(raw: unknown): Intention[] {
  return readAll(raw, 'intentions', readIntention);
}

export function jobStateKey(state: EngineJobState): TranslationKey {
  switch (state) {
    case 'queued':
      return 'goose.work.state.queued';
    case 'running':
      return 'goose.work.state.running';
    case 'passed':
      return 'goose.work.state.passed';
    case 'unsure':
      return 'goose.work.state.unsure';
    case 'dropped':
      return 'goose.work.state.dropped';
    case 'failed':
      return 'goose.work.state.failed';
    case 'cancelled':
      return 'goose.work.state.cancelled';
  }
}

export function actKey(act: IntentionAct): TranslationKey {
  switch (act) {
    case 'push':
      return 'goose.work.act.push';
    case 'refresh':
      return 'goose.work.act.refresh';
    case 'look_into':
      return 'goose.work.act.lookInto';
    case 'ask':
      return 'goose.work.act.ask';
    case 'propose_todo':
      return 'goose.work.act.proposeTodo';
  }
}
