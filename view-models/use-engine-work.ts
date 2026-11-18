// Goose's activity: the maker-and-critic runs it made for the member, with what its critic held
// against them, and the jobs the heartbeat left itself, each withdrawable while it waits (pond
// docs/architecture/my-goose-hub.md, "The engine log" and "Intentions").

import { useCallback } from 'react';

import type { EngineJob, Intention } from '@/models/engine-log';
import type { ConfirmFn } from '@/providers/confirm-provider';
import { api } from '@/services/api-client';
import i18n from '@/services/i18n';
import { showSnackbar } from '@/services/snackbar';
import { hubAction, useHubRead } from './hub-read';

export const ENGINE_LOG_MS = 60_000;
export const INTENTIONS_MS = 2 * 60_000;
/** How many runs the log shows: the Pond keeps more, and its default is thirty. */
export const ENGINE_LOG_LIMIT = 30;

export function useEngineWork(parts: { log: boolean; intentions: boolean }) {
  const jobs = useHubRead<EngineJob[]>('engine-log', () => api.engineJobs(ENGINE_LOG_LIMIT), [], ENGINE_LOG_MS, parts.log);
  const waiting = useHubRead<Intention[]>('intentions', () => api.intentions('waiting'), [], INTENTIONS_MS, parts.intentions);
  const { setData: setWaiting } = waiting;

  /** Withdraws a waiting job; the Pond refuses one already carried out or expired. */
  const withdraw = useCallback(
    async (intention: Intention, ask: ConfirmFn) => {
      const yes = await ask({
        title: i18n.t('goose.work.withdrawTitle'),
        message: i18n.t('goose.work.withdrawBody', { text: intention.text }),
        confirmLabel: i18n.t('goose.work.withdraw'),
      });
      if (!yes) return false;
      let at = -1;
      setWaiting((list) => {
        at = list.findIndex((i) => i.id === intention.id);
        return list.filter((i) => i.id !== intention.id);
      });
      const done = await hubAction('intentions', () => api.withdrawIntention(intention.id).then(() => true));
      if (!done) {
        setWaiting((list) => (list.some((i) => i.id === intention.id) ? list : [...list.slice(0, Math.max(0, at)), intention, ...list.slice(Math.max(0, at))]));
        return false;
      }
      showSnackbar({ message: i18n.t('goose.work.withdrawn'), tone: 'success' });
      return true;
    },
    [setWaiting],
  );

  return {
    jobs,
    waiting,
    loading: jobs.loading || waiting.loading,
    actions: {
      reload: async () => {
        await Promise.all([parts.log ? jobs.reload() : undefined, parts.intentions ? waiting.reload() : undefined]);
      },
      withdraw,
    },
  };
}

export type UseEngineWork = ReturnType<typeof useEngineWork>;
