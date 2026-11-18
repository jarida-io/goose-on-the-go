// The specialists the member switches on and off, and the Budget ledger the Budget specialist keeps
// (pond docs/architecture/my-goose-hub.md, part 1b). Every ledger route is refused while Budget is off.

import { useCallback, useEffect, useRef, useState } from 'react';

import { monthOf, plainAmount, stepMonth, type Ledger, type LedgerEntry, type Specialist } from '@/models/specialists';
import type { ConfirmFn } from '@/providers/confirm-provider';
import { api } from '@/services/api-client';
import { toggle } from '@/services/haptics';
import i18n from '@/services/i18n';
import { showSnackbar } from '@/services/snackbar';
import type { LedgerPatchWire } from '@/services/types';
import { hubAction, useHubRead } from './hub-read';

export const SPECIALISTS_MS = 10 * 60_000;
export const LEDGER_MS = 5 * 60_000;

export function useSpecialists(enabled = true) {
  const read = useHubRead<Specialist[]>('specialists', () => api.specialists(), [], SPECIALISTS_MS, enabled);
  const { setData } = read;
  const [busy, setBusy] = useState<string | null>(null);

  const setOn = useCallback(
    async (specialist: Specialist, on: boolean) => {
      setBusy(specialist.id);
      setData((list) => list.map((s) => (s.id === specialist.id ? { ...s, state: on ? 'on' : 'off' } : s)));
      const done = await hubAction('specialists', () => api.setSpecialist(specialist.id, on));
      setBusy(null);
      setData((list) => done ?? list.map((s) => (s.id === specialist.id ? specialist : s)));
      if (done) void toggle();
      return done !== null;
    },
    [setData],
  );

  const budget = read.data.find((s) => s.id === 'budget') ?? null;
  return { ...read, busy, budgetOn: budget?.state === 'on', actions: { reload: read.reload, setOn } };
}

export type UseSpecialists = ReturnType<typeof useSpecialists>;

const EMPTY_LEDGER: Ledger = { month: '', entries: [], totals: [] };

export function useLedger(enabled = true, now: () => Date = () => new Date()) {
  const [month, setMonth] = useState(() => monthOf(now()));
  const read = useHubRead<Ledger>('ledger', () => api.ledger(month), EMPTY_LEDGER, LEDGER_MS, enabled);
  const { reload, setData } = read;
  const shown = useRef(month);

  // A new month is a new read; what the last month said is not this one's.
  useEffect(() => {
    if (shown.current === month) return;
    shown.current = month;
    setData(EMPTY_LEDGER);
    void reload();
  }, [month, reload, setData]);

  const thisMonth = monthOf(now());
  const step = useCallback((delta: -1 | 1) => setMonth((m) => stepMonth(m, delta)), []);

  /** An amount is sent as the plain decimal the member typed; anything else is refused here. */
  const edit = useCallback(
    async (entry: LedgerEntry, change: { payee?: string; amount?: string; category?: LedgerEntry['category']; note?: string | null }) => {
      const body: LedgerPatchWire = {};
      if (change.payee !== undefined && change.payee.trim() && change.payee.trim() !== entry.payee) body.payee = change.payee.trim();
      if (change.amount !== undefined) {
        const amount = plainAmount(change.amount);
        if (amount === null) {
          showSnackbar({ message: i18n.t('goose.ledger.badAmount'), tone: 'danger' });
          return false;
        }
        if (amount !== entry.amount) body.amount = amount;
      }
      if (change.category && change.category !== entry.category) body.category = change.category;
      if (change.note !== undefined && (change.note?.trim() || null) !== entry.note) body.note = change.note?.trim() || null;
      if (Object.keys(body).length === 0) return true;
      const done = await hubAction('ledger', () => api.editLedgerEntry(entry.id, body));
      if (!done) return false;
      setData((l) => ({ ...l, entries: l.entries.map((e) => (e.id === done.id ? done : e)) }));
      // The totals are the Pond's sums; read them again rather than adding decimals here.
      void reload();
      showSnackbar({ message: i18n.t('goose.ledger.saved'), tone: 'success' });
      return true;
    },
    [reload, setData],
  );

  const remove = useCallback(
    async (entry: LedgerEntry, ask: ConfirmFn) => {
      const yes = await ask({
        title: i18n.t('goose.ledger.deleteTitle'),
        message: i18n.t('goose.ledger.deleteBody', { payee: entry.payee || i18n.t('goose.ledger.noPayee') }),
        confirmLabel: i18n.t('goose.ledger.delete'),
        destructive: true,
      });
      if (!yes) return false;
      const done = await hubAction('ledger', () => api.deleteLedgerEntry(entry.id).then(() => true));
      if (!done) return false;
      setData((l) => ({ ...l, entries: l.entries.filter((e) => e.id !== entry.id) }));
      void reload();
      return true;
    },
    [reload, setData],
  );

  return { ...read, month, isThisMonth: month === thisMonth, actions: { reload, step, edit, remove } };
}

export type UseLedger = ReturnType<typeof useLedger>;
