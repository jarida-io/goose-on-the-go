/**
 * Web watches ViewModel: the member's watches, one watch with its changes, and the few things a
 * member changes on one (pause, how often, stop).
 */

import { useCallback, useState } from 'react';

import type { WebWatch, WebWatchDetail } from '@/models/web-watches';
import { useServer } from '@/providers/server-provider';
import { ApiError, api } from '@/services/api-client';
import i18n from '@/services/i18n';
import { useLive } from './use-live';

/** Hours a member may pick between checks; the Pond keeps any value from 1 to 168. */
export const WATCH_INTERVALS = [1, 3, 6, 12, 24] as const;

/** A watch the Pond checked meanwhile shows its new state without leaving the screen. */
export const WEB_WATCHES_MS = 60_000;

function failure(e: unknown): string {
  return e instanceof ApiError ? i18n.t('webWatches.errors.status', { status: e.status }) : i18n.t('webWatches.errors.unreachable');
}

export function useWebWatches() {
  const { hydrated } = useServer();
  const [watches, setWatches] = useState<WebWatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** `loud` is a read somebody asked for; one on arrival or a poll changes nothing until it lands. */
  const load = useCallback(async (loud: boolean) => {
    if (loud) {
      setLoading(true);
      setError(null);
    }
    try {
      setWatches(await api.listWebWatches());
      setError(null);
    } catch (e) {
      setError(failure(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => load(true), [load]);
  useLive(() => load(false), WEB_WATCHES_MS, hydrated);

  const create = useCallback(
    async (body: { url?: string; looking_for: string; interval_hours?: number; title?: string }) => {
      try {
        const created = await api.createWebWatch(body);
        setWatches((prev) => [created, ...prev]);
        setError(null);
        return created;
      } catch (e) {
        setError(failure(e));
        return null;
      }
    },
    [],
  );

  return { data: { watches }, loading, error, actions: { refresh, create } };
}

export function useWebWatch(id: string) {
  const { hydrated } = useServer();
  const [watch, setWatch] = useState<WebWatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [gone, setGone] = useState(false);

  /** `loud` is a read somebody asked for; one on arrival or a poll changes nothing until it lands. */
  const load = useCallback(async (loud: boolean) => {
    if (!id) return;
    if (loud) {
      setLoading(true);
      setError(null);
    }
    try {
      setWatch(await api.webWatch(id));
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setGone(true);
      else setError(failure(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  const refresh = useCallback(() => load(true), [load]);
  const pollMs = watch && watch.lastCheckedAt === null ? 3_000 : WEB_WATCHES_MS;
  useLive(() => load(false), pollMs, hydrated);

  const edit = useCallback(
    async (change: { paused?: boolean; interval_hours?: number }) => {
      setSaving(true);
      setError(null);
      try {
        const saved = await api.editWebWatch(id, change);
        setWatch((w) => (w ? { ...w, ...saved } : w));
        return true;
      } catch (e) {
        setError(failure(e));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [id],
  );

  const stop = useCallback(async () => {
    setSaving(true);
    try {
      await api.deleteWebWatch(id);
      setGone(true);
      return true;
    } catch (e) {
      setError(failure(e));
      return false;
    } finally {
      setSaving(false);
    }
  }, [id]);

  return { watch, loading, error, saving, gone, actions: { refresh, edit, stop } };
}
