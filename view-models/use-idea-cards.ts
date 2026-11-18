// Idea cards (pond docs/architecture/idea-cards.md): the member's new and saved cards, the state of
// the set Goose is making, and what each button does. Read only from a Pond whose `/me/hub` serves them.

import { useCallback, useState } from 'react';
import { router } from 'expo-router';

import { EMPTY_SET, askMessage, dismissBody, isMaking, type IdeaCard, type IdeaCardDone, type IdeaCardSet } from '@/models/idea-cards';
import type { RejectReason } from '@/models/anchors';
import { api } from '@/services/api-client';
import { confirm } from '@/services/haptics';
import i18n from '@/services/i18n';
import { showSnackbar } from '@/services/snackbar';
import { hubAction, useHubRead } from './hub-read';

/** A set changes once a morning or on a tap; quicker while one is being made. */
export const IDEA_CARDS_MS = 5 * 60_000;
export const IDEA_CARDS_MAKING_MS = 5_000;

export type IdeaCardBusy = { id: string; what: 'do' | 'deeper' | 'save' | 'dismiss' } | null;

/** The plan Goose went deeper in, or every plan when the Pond named none. */
function openPlan(anchorId: string | null): void {
  if (anchorId) router.push({ pathname: '/(stack)/goose-anchor', params: { id: anchorId } });
  else router.push('/(stack)/goose-plans');
  showSnackbar({ message: i18n.t('goose.ideaCards.deeperStarted'), tone: 'success' });
}

/** Where "Do it" leads once the Pond has done its part. */
export function followDone(done: IdeaCardDone): void {
  const { result } = done;
  if (result.kind === 'chat' && result.prompt) {
    router.push({ pathname: '/conversation', params: { ask: result.prompt } });
    return;
  }
  if (result.kind === 'go_deeper') {
    openPlan(result.anchorId);
    return;
  }
  const said = result.kind === 'todo' ? 'goose.ideaCards.todoAdded' : result.kind === 'reminder' ? 'goose.ideaCards.reminderAdded' : result.kind === 'watch' ? 'goose.ideaCards.watchStarted' : 'goose.ideaCards.done';
  showSnackbar({ message: i18n.t(said), tone: 'success' });
}

export function useIdeaCards(enabled = true) {
  const read = useHubRead<IdeaCardSet>('ideaCards', () => api.ideaCards(), EMPTY_SET, (d) => (isMaking(d.set.state) ? IDEA_CARDS_MAKING_MS : IDEA_CARDS_MS), enabled);
  const { setData } = read;
  const [busy, setBusy] = useState<IdeaCardBusy>(null);
  const [refreshing, setRefreshing] = useState(false);

  const without = useCallback((id: string) => setData((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== id) })), [setData]);
  const put = useCallback((card: IdeaCard) => setData((d) => ({ ...d, cards: d.cards.map((c) => (c.id === card.id ? card : c)) })), [setData]);

  /** Asks Goose for a new set; the read then polls quickly until it is ready. */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    const state = await hubAction('ideaCards', () => api.refreshIdeaCards());
    setRefreshing(false);
    if (!state) return false;
    setData((d) => ({ ...d, set: { ...d.set, state } }));
    showSnackbar({ message: i18n.t('goose.ideaCards.refreshing'), tone: 'success' });
    return true;
  }, [setData]);

  /** "Do it": the Pond carries out the card's action and marks it done, so it leaves the set. */
  const doIt = useCallback(
    async (card: IdeaCard): Promise<IdeaCardDone | null> => {
      setBusy({ id: card.id, what: 'do' });
      const done = await hubAction('ideaCards', () => api.doIdeaCard(card.id));
      setBusy(null);
      if (!done) return null;
      without(card.id);
      void confirm();
      followDone(done);
      return done;
    },
    [without],
  );

  /**
   * An ask card's question answered: the card is done on the Pond like any Do it, and the chosen
   * options, not the action's prompt, go to chat as the member's own message.
   */
  const answerAsk = useCallback(
    async (card: IdeaCard, labels: readonly string[]): Promise<boolean> => {
      const message = askMessage(labels);
      if (!message) return false;
      setBusy({ id: card.id, what: 'do' });
      const done = await hubAction('ideaCards', () => api.doIdeaCard(card.id));
      setBusy(null);
      if (!done) return false;
      without(card.id);
      void confirm();
      router.push({ pathname: '/conversation', params: { ask: message } });
      return true;
    },
    [without],
  );

  /** "Other" on an ask card: the member says it in their own words, in a new chat. */
  const askOther = useCallback(() => router.push('/conversation'), []);

  /** "Go deeper" on any card: the Pond finds or makes its plan, and the plan opens. */
  const deeper = useCallback(
    async (card: IdeaCard) => {
      setBusy({ id: card.id, what: 'deeper' });
      const done = await hubAction('ideaCards', () => api.deeperIdeaCard(card.id));
      setBusy(null);
      if (!done) return false;
      if (done.card) put(done.card);
      void confirm();
      openPlan(done.anchorId);
      return true;
    },
    [put],
  );

  /** Save keeps a card past its fade; a second tap lets it fade again. */
  const toggleSave = useCallback(
    async (card: IdeaCard) => {
      const saving = card.state !== 'saved';
      setBusy({ id: card.id, what: 'save' });
      const done = await hubAction('ideaCards', () => api.saveIdeaCard(card.id, saving));
      setBusy(null);
      if (!done) return false;
      put(done);
      showSnackbar({ message: i18n.t(saving ? 'goose.ideaCards.savedNote' : 'goose.ideaCards.unsavedNote'), tone: 'success' });
      return true;
    },
    [put],
  );

  /** "Not this": gone at once, back where it was if the Pond refuses. */
  const dismiss = useCallback(
    async (card: IdeaCard, reasons: readonly RejectReason[], words: string) => {
      let at = -1;
      setData((d) => {
        at = d.cards.findIndex((c) => c.id === card.id);
        return { ...d, cards: d.cards.filter((c) => c.id !== card.id) };
      });
      const done = await hubAction('ideaCards', () => api.dismissIdeaCard(card.id, dismissBody(reasons, words)).then(() => true));
      if (!done) {
        setData((d) => {
          if (d.cards.some((c) => c.id === card.id)) return d;
          const i = Math.max(0, at);
          return { ...d, cards: [...d.cards.slice(0, i), card, ...d.cards.slice(i)] };
        });
        return false;
      }
      showSnackbar({ message: i18n.t('goose.ideaCards.dismissed'), tone: 'success' });
      return true;
    },
    [setData],
  );

  const create = useCallback(
    async (body: { title: string; why?: string; notes?: string; kind?: string }) => {
      const created = await hubAction('ideaCards', () => api.createIdeaCard(body));
      if (!created) return null;
      setData((d) => ({ ...d, cards: [created, ...d.cards.filter((c) => c.id !== created.id)] }));
      showSnackbar({ message: 'Idea added — Goose will learn from it too.', tone: 'success' });
      return created;
    },
    [setData],
  );

  const cards = read.data.cards;
  return {
    ...read,
    cards,
    fresh: cards.filter((c) => c.state === 'new'),
    saved: cards.filter((c) => c.state === 'saved'),
    making: isMaking(read.data.set.state),
    busy,
    refreshing,
    actions: { reload: read.reload, refresh, doIt, answerAsk, askOther, deeper, toggleSave, dismiss, create },
  };
}

export type UseIdeaCards = ReturnType<typeof useIdeaCards>;
