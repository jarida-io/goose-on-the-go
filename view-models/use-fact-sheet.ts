// "About you": the fact sheet Goose works from, which the member pins, rewords, removes and adds to,
// and below it the things Goose won't suggest (pond docs/architecture/my-goose-hub.md, part 1,
// "The fact sheet and the don't-list"). A removed line is never learned again, so removing asks first.

import { useCallback, useEffect, useRef } from 'react';

import { EMPTY_SHEET, type DontRule, type FactCategory, type FactSheet, type SheetFact } from '@/models/fact-sheet';
import type { ConfirmFn } from '@/providers/confirm-provider';
import { api } from '@/services/api-client';
import { confirm } from '@/services/haptics';
import i18n from '@/services/i18n';
import { showSnackbar } from '@/services/snackbar';
import { hubAction, useHubRead } from './hub-read';

/** The sheet is rebuilt on the Pond's own schedule; a read every few minutes while in front. */
export const FACTS_MS = 5 * 60_000;

export function useFactSheet(enabled = true) {
  const sheet = useHubRead<FactSheet>('facts', () => api.facts(), EMPTY_SHEET, FACTS_MS, enabled);
  const rules = useHubRead<DontRule[]>('dont', () => api.dontList(), [], FACTS_MS, enabled);
  const { setData } = sheet;
  const latest = useRef(sheet.data);
  useEffect(() => {
    latest.current = sheet.data;
  });

  const replace = useCallback((fact: SheetFact) => setData((s) => ({ ...s, facts: s.facts.map((f) => (f.id === fact.id ? fact : f)) })), [setData]);

  const pin = useCallback(
    async (fact: SheetFact, pinned: boolean) => {
      replace({ ...fact, pinned });
      const done = await hubAction('facts', () => api.editFact(fact.id, { pinned }));
      replace(done ?? fact);
      return done !== null;
    },
    [replace],
  );

  /** Rewording a line makes it the member's own; the Pond refuses one another line already says. */
  const edit = useCallback(
    async (fact: SheetFact, words: string, category: FactCategory) => {
      const said = words.trim();
      if (!said) return false;
      const done = await hubAction('facts', () => api.editFact(fact.id, { fact: said, category }));
      if (!done) return false;
      replace(done);
      showSnackbar({ message: i18n.t('goose.facts.saved'), tone: 'success' });
      return true;
    },
    [replace],
  );

  /** Asks first: a removed line is never learned again, and nothing is built on it. */
  const remove = useCallback(
    async (fact: SheetFact, ask: ConfirmFn) => {
      const yes = await ask({
        title: i18n.t('goose.facts.removeTitle'),
        message: i18n.t('goose.facts.removeBody', { fact: fact.fact }),
        confirmLabel: i18n.t('goose.facts.remove'),
        destructive: true,
      });
      if (!yes) return false;
      const at = latest.current.facts.findIndex((f) => f.id === fact.id);
      setData((s) => ({ ...s, facts: s.facts.filter((f) => f.id !== fact.id) }));
      const done = await hubAction('facts', () => api.deleteFact(fact.id).then(() => true));
      if (!done) {
        setData((s) => (s.facts.some((f) => f.id === fact.id) ? s : { ...s, facts: [...s.facts.slice(0, Math.max(0, at)), fact, ...s.facts.slice(Math.max(0, at))] }));
        return false;
      }
      showSnackbar({ message: i18n.t('goose.facts.removed'), tone: 'success' });
      // The Pond leaves a rule so nothing is built on the line; the list below shows it.
      void rules.reload();
      return true;
    },
    [rules, setData],
  );

  const add = useCallback(
    async (category: FactCategory, words: string) => {
      const said = words.trim();
      if (!said) return false;
      const done = await hubAction('facts', () => api.addFact(category, said));
      if (!done) return false;
      setData(done);
      void confirm();
      showSnackbar({ message: i18n.t('goose.facts.added'), tone: 'success' });
      return true;
    },
    [setData],
  );

  const rebuild = useCallback(async () => {
    const done = await hubAction('facts', () => api.rebuildFacts().then(() => true), { retry: true });
    if (done) showSnackbar({ message: i18n.t('goose.facts.rebuilding'), tone: 'success' });
    return done !== null;
  }, []);

  const addRule = useCallback(
    async (words: string) => {
      const said = words.trim();
      if (!said) return false;
      const done = await hubAction('dont', () => api.addDont(said, 'never'));
      if (!done) return false;
      rules.setData(done);
      showSnackbar({ message: i18n.t('goose.dont.added'), tone: 'success' });
      return true;
    },
    [rules],
  );

  const removeRule = useCallback(
    async (rule: DontRule) => {
      const before = rules.data;
      rules.setData((list) => list.filter((r) => r.id !== rule.id));
      const done = await hubAction('dont', () => api.deleteDont(rule.id).then((left) => ({ left })));
      if (!done) {
        rules.setData(before);
        return false;
      }
      if (done.left) rules.setData(done.left);
      showSnackbar({ message: i18n.t('goose.dont.removed'), tone: 'success' });
      return true;
    },
    [rules],
  );

  return {
    ...sheet,
    rules: rules.data,
    rulesLoading: rules.loading,
    actions: {
      reload: async () => {
        await Promise.all([sheet.reload(), rules.reload()]);
      },
      pin,
      edit,
      remove,
      add,
      rebuild,
      addRule,
      removeRule,
    },
  };
}

export type UseFactSheet = ReturnType<typeof useFactSheet>;
