/**
 * My Goose: everything the Goose is holding for this member. A Pond that serves the hub
 * (`/me/hub`) gets `useMyGooseHub`, composed from each part's own view-model; an older Pond keeps
 * `useOlderMyGoose`, read from the routes it already had, exactly as before the hub.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { priceMove, atTarget } from '@/models/cart';
import { featuredIdea } from '@/models/ideas';
import type { MeHub } from '@/models/hub';
import { formatMoney } from '@/models/me-read';
import { cartsFrom, formatPrice, gooseClauses, hubClauses, watchesWithHits } from '@/models/my-goose';
import { nextUp } from '@/models/todos';
import { useServer } from '@/providers/server-provider';
import type { AgentSuggestion } from '@/services/types';
import { useAgentsSource } from './agents-source';
import { useBriefs } from './use-briefs';
import { AGENT_IDEAS_MS } from './use-home-ideas';
import { useLive } from './use-live';
import { useProposals } from './use-proposals';
import { useReminders } from './use-reminders';
import { useSavedItems } from './use-saved-items';
import { useSuggestions } from './use-suggestions';
import { useWebWatches } from './use-web-watches';
import { useCart } from './use-cart';
import { useCatalog } from './use-catalog';
import { useConnectors } from './use-connectors';
import { useIdeas } from './use-ideas';
import { useInterests } from './use-interests';
import { useNews } from './use-news';
import { useTodos } from './use-todos';
import { EMPTY_CAPTURES, type Captures } from '@/models/captures';
import { EMPTY_SHEET, type FactSheet } from '@/models/fact-sheet';
import { api } from '@/services/api-client';
import { useHubRead } from './hub-read';
import { useAnchors } from './use-anchors';
import { CAPTURES_MS } from './use-captures';
import { FACTS_MS } from './use-fact-sheet';
import { useQuestions } from './use-questions';
import { useSpecialists } from './use-specialists';

/** Agents the Pond could run for this household, and saying yes or no to one. */
export function useAgentIdeas() {
  const { hydrated } = useServer();
  const agents = useAgentsSource();
  const [ideas, setIdeas] = useState<AgentSuggestion[]>([]);
  const [enabling, setEnabling] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIdeas(await agents.listSuggestions());
    } catch {
      // An offer, not a record: a Pond without the route offers none.
    }
  }, [agents]);
  useLive(refresh, AGENT_IDEAS_MS, hydrated);

  const enable = useCallback(
    async (template: string) => {
      setEnabling(template);
      try {
        await agents.enableSuggestion(template);
        setIdeas((all) => all.filter((i) => i.template !== template));
      } finally {
        setEnabling(null);
      }
    },
    [agents],
  );
  const dismiss = useCallback(
    async (template: string) => {
      setIdeas((all) => all.filter((i) => i.template !== template));
      await agents.dismissSuggestion(template).catch(() => undefined);
    },
    [agents],
  );

  return { ideas, enabling, refresh, enable, dismiss };
}

/** The older My Goose, for a Pond without `/me/hub`: unchanged from before the hub. */
export function useOlderMyGoose() {
  const proposals = useProposals();
  // Asked as a new chat asks, so the questions offered here are the ones a chat would offer.
  const suggestions = useSuggestions(null);
  const watches = useWebWatches();
  const saved = useSavedItems();
  const briefs = useBriefs();
  const reminders = useReminders();
  const agentIdeas = useAgentIdeas();

  // Watches and saved cards read once on mount; a return to the tab is when a chat may have added one.
  const returned = useRef(false);
  const { refresh: refreshWatches } = watches.actions;
  const { refresh: refreshSaved } = saved.actions;
  useFocusEffect(
    useCallback(() => {
      if (!returned.current) {
        returned.current = true;
        return;
      }
      void refreshWatches();
      void refreshSaved();
    }, [refreshWatches, refreshSaved]),
  );

  const offers = proposals.data.rows;
  // Only what the Pond composed: the fixed starters belong in an empty chat, not on a shelf.
  const prompts = suggestions.data.prompts.filter((p) => p.id !== null);
  const carts = useMemo(() => cartsFrom(saved.data.items), [saved.data.items]);
  const hits = useMemo(() => watchesWithHits(watches.data.watches), [watches.data.watches]);
  const kept = carts.reduce((sum, c) => sum + c.lines.length, 0);
  const lowest = carts.map((c) => c.low).filter((p) => p !== null)[0] ?? null;
  const brief = briefs.data.briefs[0] ?? null;
  const ideas = prompts.length + agentIdeas.ideas.length;

  const clauses = gooseClauses({
    offers: offers.length,
    watchHits: hits,
    brief,
    reminders: reminders.data.rows.length,
    cart: kept > 0 ? { count: kept, low: lowest ? formatPrice(lowest) : null } : null,
    ideas,
  });

  const { refresh: refreshProposals, decide } = proposals.actions;
  const { refresh: refreshBriefs } = briefs.actions;
  const { refresh: refreshReminders } = reminders.actions;
  const { refresh: refreshAgentIdeas } = agentIdeas;
  const refresh = useCallback(async () => {
    await Promise.all([
      refreshProposals(),
      refreshWatches(),
      refreshSaved(),
      refreshBriefs(),
      refreshReminders(),
      refreshAgentIdeas(),
    ]);
  }, [refreshProposals, refreshWatches, refreshSaved, refreshBriefs, refreshReminders, refreshAgentIdeas]);

  const loading =
    (proposals.loading && offers.length === 0) ||
    (watches.loading && watches.data.watches.length === 0) ||
    (saved.loading && saved.data.items.length === 0);

  return {
    data: {
      clauses,
      offers,
      watches: watches.data.watches,
      hits,
      carts,
      kept,
      briefs: briefs.data.briefs,
      asking: briefs.data.asking,
      prompts,
      agentIdeas: agentIdeas.ideas,
      reminders: reminders.data.rows,
    },
    loading,
    /** Reads that failed, so an empty shelf there says nothing rather than "nothing". */
    failed: {
      offers: proposals.failed,
      watches: watches.error !== null && watches.data.watches.length === 0,
      cart: saved.error !== null && saved.data.items.length === 0,
      news: briefs.error !== null && briefs.data.briefs.length === 0,
    },
    deciding: proposals.deciding,
    startingNews: briefs.starting,
    enabling: agentIdeas.enabling,
    actions: {
      refresh,
      approve: (id: string) => decide(id, 'approve'),
      decline: (id: string) => decide(id, 'reject'),
      taken: suggestions.actions.taken,
      startMorningNews: briefs.actions.startMorningNews,
      runBriefNow: briefs.actions.runNow,
      enableAgent: agentIdeas.enable,
      dismissAgent: agentIdeas.dismiss,
    },
  };
}

export type UseOlderMyGoose = ReturnType<typeof useOlderMyGoose>;

function sameDay(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** The hub: each part the Pond serves, read by its own view-model, and the sentence over them all. */
export function useMyGooseHub(hub: MeHub) {
  const news = useNews(hub.news);
  const todos = useTodos(hub.todos);
  const cart = useCart(hub.cart);
  const ideas = useIdeas(hub.ideas);
  const interests = useInterests(hub.interests);
  const connectors = useConnectors(hub.connectors);
  const catalog = useCatalog(hub.catalog);
  const watches = useWebWatches();
  const anchors = useAnchors(hub.anchors);
  const questions = useQuestions(undefined, hub.questions);
  const specialists = useSpecialists(hub.agents);
  const facts = useHubRead<FactSheet>('facts', () => api.facts(), EMPTY_SHEET, FACTS_MS, hub.facts);
  const captures = useHubRead<Captures>('captures', () => api.captures(), EMPTY_CAPTURES, CAPTURES_MS, hub.captures);

  const now = new Date();
  const moved = cart.data.find((i) => atTarget(i)) ?? cart.data.find((i) => priceMove(i)?.direction === 'down') ?? null;
  const move = moved ? priceMove(moved) : null;
  const idea = featuredIdea(ideas.data.ideas);
  const newMember = hub.interests && !interests.loading && !interests.failed && interests.groups.confirmed.length === 0;
  const clauses = hubClauses({
    checkins: todos.data.asking.map((t) => ({ text: t.text })),
    offers: todos.data.offers.length,
    newMember,
    digest: news.data.digest ? { id: news.data.digest.id, stories: news.data.digest.sections.length } : null,
    stories: news.data.stories.filter((s) => !s.read).length,
    cart: moved ? { id: moved.id, title: moved.title, by: move ? formatMoney(move.by) : null, atTarget: atTarget(moved) } : null,
    dueToday: todos.data.upcoming.filter((t) => {
      const at = nextUp(t);
      return at !== null && sameDay(at, now);
    }).length,
    idea: idea ? { title: idea.title } : null,
  });

  const { reload: reloadNews } = news.actions;
  const { reload: reloadTodos } = todos.actions;
  const { reload: reloadCart } = cart.actions;
  const { reload: reloadIdeas } = ideas.actions;
  const { reload: reloadInterests } = interests.actions;
  const { reload: reloadConnectors } = connectors.actions;
  const { reload: reloadCatalog } = catalog;
  const { refresh: reloadWatches } = watches.actions;
  const { reload: reloadAnchors } = anchors;
  const { reload: reloadQuestions } = questions;
  const { reload: reloadSpecialists } = specialists;
  const { reload: reloadFacts } = facts;
  const { reload: reloadCaptures } = captures;
  const reload = useCallback(async () => {
    await Promise.all([
      hub.news ? reloadNews() : null,
      hub.todos ? reloadTodos() : null,
      hub.cart ? reloadCart() : null,
      hub.ideas ? reloadIdeas() : null,
      hub.interests ? reloadInterests() : null,
      hub.connectors ? reloadConnectors() : null,
      hub.catalog ? reloadCatalog() : null,
      hub.anchors ? reloadAnchors() : null,
      hub.questions ? reloadQuestions() : null,
      hub.agents ? reloadSpecialists() : null,
      hub.facts ? reloadFacts() : null,
      hub.captures ? reloadCaptures() : null,
      reloadWatches(),
    ]);
  }, [
    hub,
    reloadNews,
    reloadTodos,
    reloadCart,
    reloadIdeas,
    reloadInterests,
    reloadConnectors,
    reloadCatalog,
    reloadAnchors,
    reloadQuestions,
    reloadSpecialists,
    reloadFacts,
    reloadCaptures,
    reloadWatches,
  ]);

  const loading = (hub.news && news.loading) || (hub.todos && todos.loading) || (hub.interests && interests.loading);

  return {
    hub,
    clauses,
    newMember,
    loading,
    news,
    todos,
    cart,
    ideas,
    interests,
    connectors,
    catalog,
    watches,
    anchors,
    questions,
    specialists,
    /** How many lines the fact sheet holds, for its row; null until read. */
    factCount: facts.loading || facts.failed ? null : facts.data.facts.length,
    captures: captures.data,
    reload,
  };
}

export type UseMyGooseHub = ReturnType<typeof useMyGooseHub>;
