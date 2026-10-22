/**
 * Live logs — the Pond's operational log (`GET /logs`), read as often as polling allows, for the
 * debug screen (issue #165).
 *
 * The Pond has no log stream yet (jarida-io/goose-in-a-pond#632), so "live" is a poll at the
 * floor `useLive` permits. When the stream lands, this is the one place to switch to it.
 *
 * Paused, the list holds still so a line can be read; a failed poll keeps the last lines.
 */

import { useCallback, useRef, useState } from 'react';

import { useServer } from '@/providers/server-provider';
import { ApiError, api } from '@/services/api-client';
import i18n from '@/services/i18n';
import type { LogEntry } from '@/services/types';
import { describeActivityError } from './use-activity';
import { MIN_POLL_MS, useLive } from './use-live';

/** Lines read per poll, newest first. The Pond allows 2000. */
export const LIVE_LOGS_LIMIT = 100;

/** The Pond's levels; `null` reads all of them. */
export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface UseLiveLogs {
  data: { entries: LogEntry[] };
  error: string | null;
  paused: boolean;
  actions: {
    setPaused: (paused: boolean) => void;
    refresh: () => Promise<void>;
  };
}

/** `open` is whether the logs are on screen; nothing is read while they are not. */
export function useLiveLogs(open: boolean, level: LogLevel | null = null): UseLiveLogs {
  const { hydrated } = useServer();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const landed = useRef(false);

  const load = useCallback(async () => {
    try {
      setEntries(await api.listLogs({ limit: LIVE_LOGS_LIMIT, level: level ?? undefined }));
      landed.current = true;
      setError(null);
    } catch (e) {
      if (!landed.current) setError(describeActivityError(e) ?? i18n.t('debug.logs.failed'));
      else console.warn('[live-logs] poll failed; showing the last lines', e instanceof ApiError ? e.status : 'network');
    }
  }, [level]);

  useLive(load, MIN_POLL_MS, hydrated && open && !paused);

  return { data: { entries }, error, paused, actions: { setPaused, refresh: load } };
}
