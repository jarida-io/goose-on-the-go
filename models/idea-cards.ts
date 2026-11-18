// Idea cards: what Goose offers a member unprompted, each short, structured and sourced, with one
// action (pond docs/architecture/idea-cards.md, sections 1 and 4). A card missing what the Pond
// promises it carries (a why, a source) is dropped rather than drawn half.

import type { TranslationKey } from '@/services/i18n';
import type { IdeaCardDismissWire } from '@/services/types';

import { list, oneOf, readAll, record, text, textOrNull, time, webUrl } from './me-read';
import type { RejectReason } from './anchors';
import { readAskedQuestion, type AskedQuestion } from './questions';

export type IdeaCardKind = 'do' | 'next_step' | 'reminder' | 'ask';
export type IdeaCardState = 'new' | 'saved' | 'done' | 'dismissed';
export type IdeaSourceKind = 'memory' | 'fact' | 'plan' | 'interest' | 'todo' | 'web';
export type IdeaActionKind = 'todo' | 'reminder' | 'chat' | 'watch' | 'go_deeper';
export type IdeaSetState = 'none' | 'queued' | 'making' | 'ready';

const KINDS: readonly IdeaCardKind[] = ['do', 'next_step', 'reminder', 'ask'];
const STATES: readonly IdeaCardState[] = ['new', 'saved', 'done', 'dismissed'];
const SOURCE_KINDS: readonly IdeaSourceKind[] = ['memory', 'fact', 'plan', 'interest', 'todo', 'web'];
const ACTION_KINDS: readonly IdeaActionKind[] = ['todo', 'reminder', 'chat', 'watch', 'go_deeper'];
const SET_STATES: readonly IdeaSetState[] = ['none', 'queued', 'making', 'ready'];

export interface IdeaWhy {
  text: string;
  source: { kind: IdeaSourceKind; label: string; url: string | null };
}

export interface IdeaAction {
  kind: IdeaActionKind;
  label: string;
  prompt: string | null;
  text: string | null;
  due: string | null;
  url: string | null;
  /** An ask card's one structured question; the chosen option becomes the chat message. */
  question: AskedQuestion | null;
}

export interface IdeaSource {
  kind: IdeaSourceKind;
  title: string;
  url: string | null;
}

export interface IdeaCard {
  id: string;
  kind: IdeaCardKind;
  title: string;
  why: IdeaWhy;
  when: string | null;
  where: string | null;
  cost: string | null;
  effort: string | null;
  action: IdeaAction | null;
  sources: IdeaSource[];
  notes: { found: string; next: string; caveats: string };
  anchor: { id: string; title: string } | null;
  state: IdeaCardState;
  batchId: string;
  createdAt: string | null;
  fadesAt: string | null;
}

export interface IdeaCardSet {
  cards: IdeaCard[];
  /** `ahead`, while the set is queued: how many of the Pond's jobs run before it. */
  set: { state: IdeaSetState; madeAt: string | null; ahead: number | null };
}

export interface IdeaCardDone {
  card: IdeaCard | null;
  result: { kind: IdeaActionKind; prompt: string | null; anchorId: string | null; watchId: string | null };
}

/** `POST /me/idea-cards/{id}/deeper`: the plan Goose found or made for the card. */
export interface IdeaCardDeeper {
  card: IdeaCard | null;
  anchorId: string | null;
}

export function readIdeaCardDeeper(raw: unknown): IdeaCardDeeper {
  const r = record(raw);
  return { card: readIdeaCard(r?.card), anchorId: textOrNull(r?.anchor_id) };
}

export const EMPTY_SET: IdeaCardSet = { cards: [], set: { state: 'none', madeAt: null, ahead: null } };

function readWhy(raw: unknown): IdeaWhy | null {
  const r = record(raw);
  const source = record(r?.source);
  const words = text(r?.text);
  if (!words || !source) return null;
  return { text: words, source: { kind: oneOf(source.kind, SOURCE_KINDS, 'memory'), label: text(source.label), url: webUrl(source.url) } };
}

function readAction(raw: unknown): IdeaAction | null {
  const r = record(raw);
  // An unknown kind is one the phone cannot carry out, so the card offers no Do it.
  const kind = ACTION_KINDS.find((k) => k === r?.kind);
  if (!r || !kind) return null;
  return { kind, label: text(r.label), prompt: textOrNull(r.prompt), text: textOrNull(r.text), due: textOrNull(r.due), url: webUrl(r.url), question: readAskedQuestion(r.question) };
}

function readSource(raw: unknown): IdeaSource | null {
  const r = record(raw);
  const url = webUrl(r?.url);
  const title = text(r?.title) || url || '';
  if (!title) return null;
  return { kind: oneOf(r?.kind, SOURCE_KINDS, 'web'), title, url };
}

export function readIdeaCard(raw: unknown): IdeaCard | null {
  const r = record(raw);
  const id = text(r?.id);
  const title = text(r?.title);
  const why = readWhy(r?.why);
  const sources = list(r?.sources).flatMap((s) => {
    const read = readSource(s);
    return read ? [read] : [];
  });
  if (!r || !id || !title || !why || sources.length === 0) return null;
  const notes = record(r.notes);
  const anchor = record(r.anchor);
  const anchorId = text(anchor?.id);
  return {
    id,
    kind: oneOf(r.kind, KINDS, 'do'),
    title,
    why,
    when: textOrNull(r.when),
    where: textOrNull(r.where),
    cost: textOrNull(r.cost),
    effort: textOrNull(r.effort),
    action: readAction(r.action),
    sources,
    notes: { found: text(notes?.found), next: text(notes?.next), caveats: text(notes?.caveats) },
    anchor: anchorId ? { id: anchorId, title: text(anchor?.title) } : null,
    state: oneOf(r.state, STATES, 'new'),
    batchId: text(r.batch_id),
    createdAt: time(r.created_at),
    fadesAt: time(r.fades_at),
  };
}

export function readIdeaCardSet(raw: unknown): IdeaCardSet {
  const r = record(raw);
  const set = record(r?.set);
  const ahead = set?.ahead;
  return {
    cards: readAll(raw, 'cards', readIdeaCard),
    set: {
      state: oneOf(set?.state, SET_STATES, 'none'),
      madeAt: time(set?.made_at),
      ahead: typeof ahead === 'number' && Number.isInteger(ahead) && ahead >= 0 ? ahead : null,
    },
  };
}

export function readSetState(raw: unknown): IdeaSetState {
  return oneOf(record(raw)?.state, SET_STATES, 'queued');
}

export function readIdeaCardDone(raw: unknown): IdeaCardDone {
  const r = record(raw);
  const result = record(r?.result);
  return {
    card: readIdeaCard(r?.card),
    result: {
      kind: oneOf(result?.kind, ACTION_KINDS, 'todo'),
      prompt: textOrNull(result?.prompt),
      anchorId: textOrNull(result?.anchor_id),
      watchId: textOrNull(result?.watch_id),
    },
  };
}

export function dismissBody(reasons: readonly RejectReason[], words: string): IdeaCardDismissWire {
  const said = words.trim();
  return { reasons: [...reasons], ...(said ? { text: said } : {}) };
}

/** What an ask card's chosen options send as the member's chat message. */
export function askMessage(labels: readonly string[]): string {
  return labels.map((l) => l.trim()).filter(Boolean).join(', ');
}

/** A set is on its way: the phone reads again soon, and says so. */
export function isMaking(state: IdeaSetState): boolean {
  return state === 'queued' || state === 'making';
}

/**
 * What to say while a set is on its way. A queued one says how many jobs it waits behind: the Pond
 * runs one at a time for the household, and a refresh behind three plans read as stuck.
 */
export function makingWords(set: IdeaCardSet['set']): { key: 'goose.ideaCards.waiting' | 'goose.ideaCards.making'; count?: number } {
  if (set.state === 'queued' && set.ahead !== null && set.ahead > 0) return { key: 'goose.ideaCards.waiting', count: set.ahead };
  return { key: 'goose.ideaCards.making' };
}

export function factLine(parts: readonly (string | null)[]): string {
  return parts.filter(Boolean).join(', ');
}

/** The one or two structured lines a collapsed card shows: when and where, then cost and effort. */
export function factLines(card: IdeaCard): string[] {
  return [factLine([card.when, card.where]), factLine([card.cost, card.effort])].filter(Boolean);
}

export function ideaKindKey(kind: IdeaCardKind): TranslationKey {
  switch (kind) {
    case 'do':
      return 'goose.ideaCards.kind.do';
    case 'next_step':
      return 'goose.ideaCards.kind.nextStep';
    case 'reminder':
      return 'goose.ideaCards.kind.reminder';
    case 'ask':
      return 'goose.ideaCards.kind.ask';
  }
}

export function sourceKindKey(kind: IdeaSourceKind): TranslationKey {
  switch (kind) {
    case 'memory':
      return 'goose.ideaCards.source.memory';
    case 'fact':
      return 'goose.ideaCards.source.fact';
    case 'plan':
      return 'goose.ideaCards.source.plan';
    case 'interest':
      return 'goose.ideaCards.source.interest';
    case 'todo':
      return 'goose.ideaCards.source.todo';
    case 'web':
      return 'goose.ideaCards.source.web';
  }
}
