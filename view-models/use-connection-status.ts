/**
 * The connection's state as every surface tells it -- the strip, a stack screen's inline strip and
 * the Pond card on Home and Switch Pond -- so they cannot disagree, with the one action that helps.
 *
 * The countdown is live: while a check is due, this re-renders once a second, and only then.
 */

import { useCallback, useEffect, useState } from 'react';

import { useServer } from '@/providers/server-provider';
import { selectionTick } from '@/services/haptics';
import { logFailure } from '@/view-models/describe-error';
import { connectionWords, type ConnectionWords } from '@/view-models/connection-words';
import { usePondOfflineReason } from '@/view-models/use-pond-offline-reason';

export interface ConnectionStatusView extends ConnectionWords {
  /** Whether the saved pairing has been read back; before it, the state is a placeholder. */
  hydrated: boolean;
  /**
   * Why the Pond is offline as the remote-access coordinator saw it, once it is unreachable and
   * the coordinator could say: "Your Pond is restarting for an update."
   */
  why: string | null;
  /** Check now, restarting the back-off. */
  tryNow: () => void;
}

const TICK_MS = 1_000;

export function useConnectionStatus(): ConnectionStatusView {
  const { connectionState, connectionOutage, retryNow, hydrated } = useServer();
  const [now, setNow] = useState(() => Date.now());
  const counting = connectionState !== 'reconnecting' && connectionOutage?.nextCheckAt != null;

  useEffect(() => {
    if (!counting) return;
    const tick = () => setNow(Date.now());
    // At once as well, so a new outage does not count down from the clock of the last one.
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, TICK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [counting, connectionOutage]);

  const tryNow = useCallback(() => {
    void selectionTick();
    retryNow().catch((e: unknown) => logFailure('connection', 'check asked for failed', e));
  }, [retryNow]);

  const words = connectionWords(connectionState, connectionOutage, now);
  const why = usePondOfflineReason(words.phase);
  return { ...words, why, hydrated, tryNow };
}
