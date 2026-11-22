/**
 * Why the Pond is offline, in words, while the strip says it cannot be reached; and, while the
 * Pond answers, keeping the grant that lets this phone ask (`services/pond-status.ts`).
 *
 * Several surfaces read the connection at once, so the coordinator's answer is shared between
 * them for a while rather than asked for by each.
 */

import { useEffect, useState } from 'react';

import type { ConnectionPhase } from '@/models/connection';
import { pondOfflineReason } from '@/models/pond-status';
import { useServer } from '@/providers/server-provider';
import { startPondOfflineWatch } from '@/services/pond-offline-watch';
import { askCoordinator, renewStatusGrant, storedGrant } from '@/services/pond-status';
import { pondOfflineWords } from '@/view-models/connection-words';

/** How often the coordinator is asked again while the Pond stays unreachable. */
export const ASK_EVERY_MS = 60_000;
/** How often, at most, a Pond that answers is asked whether the grant needs renewing. */
const RENEW_EVERY_MS = 60 * 60_000;

let lastRenewal: { pin: string; at: number } | null = null;
let lastAnswer: { pin: string; at: number; words: string | null } | null = null;

/** Forgets what is shared between surfaces; for tests. */
export function resetPondOfflineReason(): void {
  lastRenewal = null;
  lastAnswer = null;
}

async function wordsFor(pin: string): Promise<string | null> {
  const now = Date.now();
  if (lastAnswer && lastAnswer.pin === pin && now - lastAnswer.at < ASK_EVERY_MS / 2) return lastAnswer.words;
  const status = await askCoordinator(pin, now);
  const why = status ? pondOfflineReason(status, Date.now()) : null;
  const words = why ? pondOfflineWords(why, Date.now()) : null;
  lastAnswer = { pin, at: now, words };
  return words;
}

export function usePondOfflineReason(phase: ConnectionPhase): string | null {
  const { pairedPin } = useServer();
  // Kept with the pin it is about, and shown only while the Pond is unreachable, so an answer
  // about an earlier outage or another Pond is never shown.
  const [answer, setAnswer] = useState<{ pin: string; words: string | null } | null>(null);

  useEffect(() => {
    if (phase !== 'connected' || !pairedPin) return;
    const now = Date.now();
    if (lastRenewal && lastRenewal.pin === pairedPin && now - lastRenewal.at < RENEW_EVERY_MS) return;
    lastRenewal = { pin: pairedPin, at: now };
    // With a grant kept, the background watch can ask the coordinator while the app is closed.
    void renewStatusGrant(pairedPin).then(async () => {
      if (await storedGrant(pairedPin)) await startPondOfflineWatch();
    });
  }, [phase, pairedPin]);

  useEffect(() => {
    if (phase !== 'unreachable' || !pairedPin) return;
    let live = true;
    const ask = () => {
      void wordsFor(pairedPin).then((words) => {
        if (live) setAnswer({ pin: pairedPin, words });
      });
    };
    ask();
    const timer = setInterval(ask, ASK_EVERY_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [phase, pairedPin]);

  return phase === 'unreachable' && answer && answer.pin === pairedPin ? answer.words : null;
}
