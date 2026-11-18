// Plans and the things a member follows ("anchors"), what Goose makes for them, the running job's
// steps and the questions Goose asks (pond docs/architecture/my-goose-hub.md, part 1a). A field of
// the wrong shape reads as missing, and an unknown state as the one that offers the least.

import type { TranslationKey } from '@/services/i18n';
import type { AnchorKindWire, AnchorStopWire, DeliverableRejectWire, RejectReasonWire } from '@/services/types';

import { count, list, oneOf, readAll, record, strings, text, textOrNull, time, webUrl } from './me-read';
import { readQuestion, type Question } from './questions';
import type { CitedSource } from './sources';

export type AnchorKind = AnchorKindWire;
export type AnchorState = 'candidate' | 'active' | 'ended' | 'stopped' | 'faded';
export type DeliverableKind = 'dossier' | 'plan' | 'shortlist' | 'digest' | 'checklist';
export type DeliverableState = 'queued' | 'making' | 'ready' | 'unsure' | 'rejected' | 'archived';
export type RejectReason = RejectReasonWire;
export type SpecialistId = 'trip' | 'work' | 'hunt' | 'budget';

export const ANCHOR_KINDS: readonly AnchorKind[] = ['event', 'trip', 'purchase', 'project', 'interest', 'standing'];
/** The kinds a member may add by hand: the everyday anchor is the Pond's own. */
export const ADDABLE_KINDS: readonly Exclude<AnchorKind, 'standing'>[] = ['trip', 'event', 'purchase', 'project', 'interest'];
const ANCHOR_STATES: readonly AnchorState[] = ['candidate', 'active', 'ended', 'stopped', 'faded'];
const DELIVERABLE_KINDS: readonly DeliverableKind[] = ['dossier', 'plan', 'shortlist', 'digest', 'checklist'];
const DELIVERABLE_STATES: readonly DeliverableState[] = ['queued', 'making', 'ready', 'unsure', 'rejected', 'archived'];
const SPECIALISTS: readonly SpecialistId[] = ['trip', 'work', 'hunt', 'budget'];
/** The reason chips, the same on every surface and in this order. */
export const REASONS: readonly RejectReason[] = ['too_generic', 'not_relevant', 'wrong_facts', 'already_know', 'bad_timing'];

export interface AnchorFact {
  label: string;
  value: string;
  /** `you` when the member wrote it. */
  source: string;
}

export interface JobStep {
  key: string;
  role: string;
  label: string;
  state: string;
  summary: string | null;
}

export interface EngineJobNow {
  kind: string;
  /** In words, never an id. */
  subject: string;
  state: 'queued' | 'running';
  rounds: number;
  /** Only on an anchor or deliverable read alone. */
  steps: JobStep[];
}

export interface DeliverableSummary {
  id: string;
  kind: DeliverableKind;
  slot: string;
  title: string;
  state: DeliverableState;
  hook: string;
  version: number;
  /** What the last refresh changed, or empty. */
  changed: string;
  unseen: boolean;
}

export interface Anchor {
  id: string;
  kind: AnchorKind;
  title: string;
  state: AnchorState;
  startsAt: string | null;
  endsAt: string | null;
  place: string | null;
  facts: AnchorFact[];
  agent: SpecialistId | null;
  origin: string;
  /** Why Goose offered it. */
  why: string;
  confirmedAt: string | null;
  endedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** The member owns it; false for one shared with them, which they read and answer only. */
  mine: boolean;
  /** The owner's name, on one shared with the member. */
  sharedBy: string | null;
  shares: string[];
  deliverables: DeliverableSummary[];
  openQuestions: number;
  job: EngineJobNow | null;
  /** Only on an anchor read alone. */
  questions: Question[];
}

export interface Objection {
  kind: string;
  about: string;
  fix: string;
}

export interface Deliverable extends DeliverableSummary {
  anchorId: string;
  anchorTitle: string;
  body: string;
  facts: AnchorFact[];
  sources: CitedSource[];
  objections: Objection[];
  taskId: string | null;
  refreshAt: string | null;
  mine: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  job: EngineJobNow | null;
}

function readFacts(raw: unknown): AnchorFact[] {
  return list(raw).flatMap((f) => {
    const r = record(f);
    const label = text(r?.label);
    const value = text(r?.value);
    return label && value ? [{ label, value, source: text(r?.source) }] : [];
  });
}

function readStep(raw: unknown): JobStep | null {
  const r = record(raw);
  const key = text(r?.key);
  const label = text(r?.label);
  return r && key && label ? { key, role: text(r.role), label, state: text(r.state), summary: textOrNull(r.summary) } : null;
}

function readJob(raw: unknown): EngineJobNow | null {
  const r = record(raw);
  if (!r) return null;
  return {
    kind: text(r.kind),
    subject: text(r.subject),
    state: r.state === 'running' ? 'running' : 'queued',
    rounds: count(r.rounds),
    steps: readAll(r.steps, 'steps', readStep),
  };
}

function readSummary(r: Record<string, unknown>): DeliverableSummary | null {
  const id = text(r.id);
  const title = text(r.title);
  if (!id || !title) return null;
  return {
    id,
    // An unknown kind reads as the plainest: a dossier.
    kind: oneOf(r.kind, DELIVERABLE_KINDS, 'dossier'),
    slot: text(r.slot),
    title,
    // An unknown state reads as still being made: nothing is offered to read that may not be there.
    state: oneOf(r.state, DELIVERABLE_STATES, 'making'),
    hook: text(r.hook),
    version: count(r.version),
    changed: text(r.changed),
    unseen: r.unseen === true,
  };
}

export function readDeliverableSummary(raw: unknown): DeliverableSummary | null {
  const r = record(raw);
  return r ? readSummary(r) : null;
}

export function readAnchor(raw: unknown): Anchor | null {
  const r = record(raw);
  const id = text(r?.id);
  const title = text(r?.title);
  if (!r || !id || !title) return null;
  return {
    id,
    kind: oneOf(r.kind, ANCHOR_KINDS, 'project'),
    title,
    // An unknown state is not offered as a candidate, which would ask the member to confirm it.
    state: oneOf(r.state, ANCHOR_STATES, 'active'),
    startsAt: time(r.starts_at),
    endsAt: time(r.ends_at),
    place: textOrNull(r.place),
    facts: readFacts(r.facts),
    agent: SPECIALISTS.find((s) => s === r.agent) ?? null,
    origin: text(r.origin),
    why: text(r.why),
    confirmedAt: time(r.confirmed_at),
    endedAt: time(r.ended_at),
    createdAt: time(r.created_at),
    updatedAt: time(r.updated_at),
    // A Pond that does not say is read as not the member's, so nothing offers a change it refuses.
    mine: r.mine === true,
    sharedBy: textOrNull(r.shared_by),
    shares: strings(r.shares),
    deliverables: readAll(r.deliverables, 'deliverables', readDeliverableSummary),
    openQuestions: count(r.open_questions),
    job: readJob(r.job),
    questions: readAll(r.questions, 'questions', readQuestion),
  };
}

export function readAnchors(raw: unknown): Anchor[] {
  return readAll(raw, 'anchors', readAnchor);
}

function readSources(raw: unknown): CitedSource[] {
  return list(raw).flatMap((s) => {
    const r = record(s);
    const url = webUrl(r?.url);
    return url ? [{ title: text(r?.title) || url, url }] : [];
  });
}

export function readDeliverable(raw: unknown): Deliverable | null {
  const r = record(raw);
  const summary = r ? readSummary(r) : null;
  if (!r || !summary) return null;
  return {
    ...summary,
    anchorId: text(r.anchor_id),
    anchorTitle: text(r.anchor_title),
    body: typeof r.body === 'string' ? r.body : '',
    facts: readFacts(r.facts),
    sources: readSources(r.sources),
    objections: list(r.objections).flatMap((o) => {
      const x = record(o);
      const about = text(x?.about);
      return about ? [{ kind: text(x?.kind), about, fix: text(x?.fix) }] : [];
    }),
    taskId: textOrNull(r.task_id),
    refreshAt: time(r.refresh_at),
    mine: r.mine === true,
    createdAt: time(r.created_at),
    updatedAt: time(r.updated_at),
    job: readJob(r.job),
  };
}

/** Finished work the member can read: ready, or shown marked unsure with the critic's objections. */
export function isReadable(d: Pick<DeliverableSummary, 'state'>): boolean {
  return d.state === 'ready' || d.state === 'unsure';
}

/** A ready deliverable not yet opened, with the anchor it was made for. */
export interface ReadyWork {
  deliverable: DeliverableSummary;
  anchor: Pick<Anchor, 'id' | 'title' | 'kind'>;
}

/** What is ready and unread, in the member's own anchors, newest anchor first as the Pond lists them. */
export function readyWork(anchors: readonly Anchor[]): ReadyWork[] {
  return anchors.flatMap((anchor) =>
    anchor.state === 'active' || anchor.state === 'candidate'
      ? anchor.deliverables.filter((d) => d.unseen && isReadable(d)).map((deliverable) => ({ deliverable, anchor: { id: anchor.id, title: anchor.title, kind: anchor.kind } }))
      : [],
  );
}

/** Plans Goose offered and is waiting on a yes for: only the member's own can be confirmed. */
export function candidates(anchors: readonly Anchor[]): Anchor[] {
  return anchors.filter((a) => a.state === 'candidate' && a.mine);
}

/** The anchors a list shows: active ones, the member's everyday anchor last. */
export function followed(anchors: readonly Anchor[]): Anchor[] {
  return anchors.filter((a) => a.state === 'active').sort((a, b) => Number(a.kind === 'standing') - Number(b.kind === 'standing'));
}

/** A step as the timeline draws it. */
export function stepState(step: Pick<JobStep, 'state'>): 'done' | 'current' | 'todo' {
  switch (step.state) {
    case 'done':
    case 'skipped':
    case 'failed':
      return 'done';
    case 'running':
    case 'started':
      return 'current';
    default:
      return 'todo';
  }
}

/** The stop body: words only when there are some, and `never` only when it is asked for. */
export function stopBody(reasons: readonly RejectReason[], words: string, never: boolean): AnchorStopWire {
  const said = words.trim();
  return { reasons: [...reasons], ...(said ? { text: said } : {}), ...(never ? { never: true } : {}) };
}

export function rejectBody(verb: DeliverableRejectWire['verb'], reasons: readonly RejectReason[], words: string): DeliverableRejectWire {
  const said = words.trim();
  return { verb, reasons: [...reasons], ...(said ? { text: said } : {}) };
}

export function reasonKey(reason: RejectReason): TranslationKey {
  switch (reason) {
    case 'too_generic':
      return 'goose.reasons.tooGeneric';
    case 'not_relevant':
      return 'goose.reasons.notRelevant';
    case 'wrong_facts':
      return 'goose.reasons.wrongFacts';
    case 'already_know':
      return 'goose.reasons.alreadyKnow';
    case 'bad_timing':
      return 'goose.reasons.badTiming';
  }
}

export function anchorKindKey(kind: AnchorKind): TranslationKey {
  switch (kind) {
    case 'event':
      return 'goose.plans.kind.event';
    case 'trip':
      return 'goose.plans.kind.trip';
    case 'purchase':
      return 'goose.plans.kind.purchase';
    case 'project':
      return 'goose.plans.kind.project';
    case 'interest':
      return 'goose.plans.kind.interest';
    case 'standing':
      return 'goose.plans.kind.standing';
  }
}

export function deliverableKindKey(kind: DeliverableKind): TranslationKey {
  switch (kind) {
    case 'dossier':
      return 'goose.deliverable.kind.dossier';
    case 'plan':
      return 'goose.deliverable.kind.plan';
    case 'shortlist':
      return 'goose.deliverable.kind.shortlist';
    case 'digest':
      return 'goose.deliverable.kind.digest';
    case 'checklist':
      return 'goose.deliverable.kind.checklist';
  }
}

/** A deliverable that is not readable yet, said plainly; null for one that is. */
export function deliverableStateKey(state: DeliverableState): TranslationKey | null {
  switch (state) {
    case 'queued':
      return 'goose.deliverable.state.queued';
    case 'making':
      return 'goose.deliverable.state.making';
    case 'rejected':
      return 'goose.deliverable.state.rejected';
    case 'archived':
      return 'goose.deliverable.state.archived';
    default:
      return null;
  }
}
