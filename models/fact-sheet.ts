// The member's fact sheet, at most a hundred lines Goose works from, and the don't-list built from
// what they waved off (pond docs/architecture/my-goose-hub.md, part 1, "The fact sheet").

import type { TranslationKey } from '@/services/i18n';
import type { FactCategoryWire, RejectReasonWire } from '@/services/types';

import { count, oneOf, readAll, record, strings, text, textOrNull, time } from './me-read';

export type FactCategory = FactCategoryWire;
export type Confidence = 'sure' | 'likely' | 'said';
export type RuleStrength = 'never' | 'avoid';

/** The order the sheet is shown in: who they are first, what to steer clear of near the end. */
export const FACT_CATEGORIES: readonly FactCategory[] = [
  'identity',
  'home',
  'work',
  'people',
  'plan',
  'hunt',
  'interest',
  'food',
  'health',
  'style',
  'routine',
  'avoid',
  'other',
];

/** The sheet's size, when the Pond does not say. */
export const FACT_LIMIT = 100;

export interface SheetFact {
  id: string;
  category: FactCategory;
  fact: string;
  confidence: Confidence;
  since: string | null;
  /** Where the line came from; `you` when the member wrote it. */
  sourceKind: string;
  tools: string[];
  pinned: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface FactSheet {
  facts: SheetFact[];
  limit: number;
}

export interface DontRule {
  id: string;
  rule: string;
  strength: RuleStrength;
  reasons: RejectReasonWire[];
  said: string | null;
  createdAt: string | null;
}

export const EMPTY_SHEET: FactSheet = { facts: [], limit: FACT_LIMIT };

export function readSheetFact(raw: unknown): SheetFact | null {
  const r = record(raw);
  const id = text(r?.id);
  const fact = text(r?.fact);
  // A removed line is not on the sheet, whatever else the Pond sent with it.
  if (!r || !id || !fact || (typeof r.state === 'string' && r.state !== 'active')) return null;
  return {
    id,
    category: oneOf(r.category, FACT_CATEGORIES, 'other'),
    fact,
    confidence: oneOf(r.confidence, ['sure', 'likely', 'said'] as const, 'said'),
    since: textOrNull(r.since),
    sourceKind: text(record(r.source)?.kind),
    tools: strings(r.tools),
    pinned: r.pinned === true,
    createdAt: time(r.created_at),
    updatedAt: time(r.updated_at),
  };
}

export function readFactSheet(raw: unknown): FactSheet {
  const r = record(raw);
  return { facts: readAll(r?.facts, 'facts', readSheetFact), limit: count(r?.limit) || FACT_LIMIT };
}

const REASONS: readonly RejectReasonWire[] = ['too_generic', 'not_relevant', 'wrong_facts', 'already_know', 'bad_timing'];

export function readRule(raw: unknown): DontRule | null {
  const r = record(raw);
  const id = text(r?.id);
  const rule = text(r?.rule);
  if (!r || !id || !rule) return null;
  return {
    id,
    rule,
    strength: r.strength === 'avoid' ? 'avoid' : 'never',
    reasons: strings(r.reasons).flatMap((x) => REASONS.filter((reason) => reason === x)),
    said: textOrNull(r.said),
    createdAt: time(r.created_at),
  };
}

export function readRules(raw: unknown): DontRule[] {
  return readAll(raw, 'rules', readRule);
}

export interface FactGroup {
  category: FactCategory;
  facts: SheetFact[];
}

/** The sheet under its headings, each heading only when it holds a line, pinned lines first in each. */
export function groupFacts(facts: readonly SheetFact[]): FactGroup[] {
  return FACT_CATEGORIES.map((category) => ({
    category,
    facts: facts.filter((f) => f.category === category).sort((a, b) => Number(b.pinned) - Number(a.pinned)),
  })).filter((g) => g.facts.length > 0);
}

export function factCategoryKey(category: FactCategory): TranslationKey {
  switch (category) {
    case 'identity':
      return 'goose.facts.category.identity';
    case 'home':
      return 'goose.facts.category.home';
    case 'work':
      return 'goose.facts.category.work';
    case 'people':
      return 'goose.facts.category.people';
    case 'plan':
      return 'goose.facts.category.plan';
    case 'hunt':
      return 'goose.facts.category.hunt';
    case 'interest':
      return 'goose.facts.category.interest';
    case 'food':
      return 'goose.facts.category.food';
    case 'health':
      return 'goose.facts.category.health';
    case 'style':
      return 'goose.facts.category.style';
    case 'routine':
      return 'goose.facts.category.routine';
    case 'avoid':
      return 'goose.facts.category.avoid';
    case 'other':
      return 'goose.facts.category.other';
  }
}
