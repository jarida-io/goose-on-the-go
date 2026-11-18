// The specialists the Pond ships (Trips, Projects, Purchases, Budget) and the Budget ledger it keeps
// from money pictures (pond docs/architecture/my-goose-hub.md, part 1b). An amount stays the
// decimal string the Pond sent: it is never turned into a float, and currencies are never added.

import type { TranslationKey } from '@/services/i18n';
import type { LedgerCategoryWire } from '@/services/types';

import { list, oneOf, readAll, record, text, textOrNull } from './me-read';

export type SpecialistState = 'on' | 'off' | 'offered' | 'declined';
export type LedgerCategory = LedgerCategoryWire;

export const LEDGER_CATEGORIES: readonly LedgerCategory[] = [
  'groceries',
  'eating_out',
  'transport',
  'bills',
  'rent',
  'health',
  'shopping',
  'travel',
  'entertainment',
  'transfers',
  'other',
];

export interface Specialist {
  id: string;
  title: string;
  about: string;
  state: SpecialistState;
  /** Why it is offered; empty otherwise. */
  why: string;
}

export interface LedgerEntry {
  id: string;
  occurredOn: string;
  payee: string;
  amount: string;
  currency: string;
  category: LedgerCategory;
  anchorId: string | null;
  note: string | null;
}

export interface LedgerTotal {
  currency: string;
  total: string;
  byCategory: { category: LedgerCategory; total: string }[];
}

export interface Ledger {
  month: string;
  entries: LedgerEntry[];
  totals: LedgerTotal[];
}

export function readSpecialists(raw: unknown): Specialist[] {
  return readAll(raw, 'agents', (a) => {
    const r = record(a);
    const id = text(r?.id);
    const title = text(r?.title);
    return r && id && title ? { id, title, about: text(r.about), state: oneOf(r.state, ['on', 'off', 'offered', 'declined'] as const, 'off'), why: text(r.why) } : null;
  });
}

/** A plain decimal, as the Pond writes and takes one: digits, an optional sign and point. */
const AMOUNT = /^-?\d+(\.\d+)?$/;

/** The amount as the member typed it, made plain, or null when it is not a number. */
export function plainAmount(typed: string): string | null {
  const s = typed.trim().replace(/[\s,]/g, '');
  return AMOUNT.test(s) ? s : null;
}

function amountOf(raw: unknown): string | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  const s = text(raw);
  return AMOUNT.test(s) ? s : null;
}

export function readLedgerEntry(raw: unknown): LedgerEntry | null {
  const r = record(raw);
  const id = text(r?.id);
  const amount = amountOf(r?.amount);
  if (!r || !id || amount === null) return null;
  return {
    id,
    occurredOn: text(r.occurred_on),
    payee: text(r.payee),
    amount,
    currency: text(r.currency),
    category: oneOf(r.category, LEDGER_CATEGORIES, 'other'),
    anchorId: textOrNull(r.anchor_id),
    note: textOrNull(r.note),
  };
}

export function readLedger(raw: unknown): Ledger {
  const r = record(raw);
  return {
    month: text(r?.month),
    entries: readAll(r?.entries, 'entries', readLedgerEntry),
    totals: list(r?.totals).flatMap((t) => {
      const x = record(t);
      const total = amountOf(x?.total);
      if (!x || total === null) return [];
      return [
        {
          currency: text(x.currency),
          total,
          byCategory: list(x.by_category).flatMap((c) => {
            const y = record(c);
            const sum = amountOf(y?.total);
            return y && sum !== null ? [{ category: oneOf(y.category, LEDGER_CATEGORIES, 'other'), total: sum }] : [];
          }),
        },
      ];
    }),
  };
}

/** `2026-11` for a date, in the phone's own calendar. */
export function monthOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** The month before or after `month`, as `YYYY-MM`. */
export function stepMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return monthOf(new Date(y, m - 1 + delta, 1));
}

/** An amount with its currency in front, grouped as the member's language groups numbers. */
export function moneyText(amount: string, currency: string, locale?: string): string {
  const [whole, fraction] = amount.replace(/^-/, '').split('.');
  const grouped = Number(whole).toLocaleString(locale, { maximumFractionDigits: 0 });
  const value = `${amount.startsWith('-') ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`;
  return currency ? `${currency} ${value}` : value;
}

export function ledgerCategoryKey(category: LedgerCategory): TranslationKey {
  switch (category) {
    case 'groceries':
      return 'goose.ledger.category.groceries';
    case 'eating_out':
      return 'goose.ledger.category.eatingOut';
    case 'transport':
      return 'goose.ledger.category.transport';
    case 'bills':
      return 'goose.ledger.category.bills';
    case 'rent':
      return 'goose.ledger.category.rent';
    case 'health':
      return 'goose.ledger.category.health';
    case 'shopping':
      return 'goose.ledger.category.shopping';
    case 'travel':
      return 'goose.ledger.category.travel';
    case 'entertainment':
      return 'goose.ledger.category.entertainment';
    case 'transfers':
      return 'goose.ledger.category.transfers';
    case 'other':
      return 'goose.ledger.category.other';
  }
}
