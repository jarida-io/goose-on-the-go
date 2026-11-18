/**
 * What to ask, offered by the Pond itself.
 *
 * `GET /api/v1/suggestions` answers up to four: the ones the Pond composed from
 * its memories while it was idle come first, then templates it has the facts
 * for — today's calendar, the devices it can see. pond-desktop's rule for when
 * it has nothing, or cannot be reached: keep the fixed starters on screen. A
 * row of chips that empties, or shows an error, reads as broken; one that says
 * something true is still useful.
 *
 * The session id decides whose data the Pond may read for them, so they are
 * fetched again when the conversation changes.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useServer } from '@/providers/server-provider';
import { api } from '@/services/api-client';
import type { TranslationKey } from '@/services/i18n';
import type { Suggestion } from '@/services/types';

const STARTERS: TranslationKey[] = [
  'chat.starters.capabilities',
  'chat.starters.memory',
  'chat.starters.devices',
];

export interface OfferedPrompt {
  /** The Pond's id, or null for a built-in starter. */
  id: string | null;
  prompt: string;
  /** Composed from a memory: the Pond should hear that it was used. */
  composed: boolean;
  /** Why the Pond offers it, in its own words; a starter has none. */
  because?: string;
  /** Deep operational instructions for the chat agent when tapped. */
  agentNotes?: string;
}

export interface UseSuggestions {
  data: { prompts: OfferedPrompt[] };
  actions: {
    /** Tell the Pond one was used, so it stops offering it. Fire and forget. */
    taken: (prompt: OfferedPrompt) => void;
  };
}

export function useSuggestions(sessionId: string | null): UseSuggestions {
  const { t } = useTranslation();
  const { hydrated } = useServer();
  const [offered, setOffered] = useState<Suggestion[]>([]);

  useEffect(() => {
    if (!hydrated) return;
    let live = true;
    void (async () => {
      try {
        const list = await api.listSuggestions(sessionId);
        if (live) setOffered(list.suggestions ?? []);
      } catch {
        // Keep whatever is on screen: the starters, or the last answer.
      }
    })();
    return () => {
      live = false;
    };
  }, [hydrated, sessionId]);

  const taken = useCallback((prompt: OfferedPrompt) => {
    if (!prompt.composed || !prompt.id) return;
    void api.takeSuggestion(prompt.id).catch(() => {});
  }, []);

  const prompts: OfferedPrompt[] =
    offered.length > 0
      ? offered.map((s) => ({
          id: s.id,
          prompt: s.prompt,
          composed: s.composed,
          because: s.because?.trim() || undefined,
          agentNotes: s.agent_notes?.trim() || undefined,
        }))
      : STARTERS.map((key) => ({ id: null, prompt: t(key), composed: false }));

  return { data: { prompts }, actions: { taken } };
}
