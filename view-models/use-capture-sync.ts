// Runs the automatic sending of screenshots and album photos whenever the app comes to the front,
// for a Pond that serves captures and a build that can read the library. Draws nothing.

import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useServer } from '@/providers/server-provider';
import { api } from '@/services/api-client';
import { captureLibrary } from '@/services/capture-library';
import { syncCaptures, type SyncState } from '@/services/capture-sync';
import { storageFamily } from '@/services/storage';
import { logFailure } from './describe-error';
import { useHub } from './use-hub';
import { shrinkShot } from './use-screenshots';

/** Coming back to the app twice in a minute is one look at the library, not two. */
export const CAPTURE_SYNC_GAP_MS = 60_000;

export function useCaptureSync(): void {
  const { hydrated, online, serverUrl } = useServer();
  const { hub } = useHub();
  const serves = hub?.captures === true;
  const running = useRef(false);
  const last = useRef(0);

  const run = useCallback(async () => {
    const library = captureLibrary();
    if (!serves || !library.available || running.current || Date.now() - last.current < CAPTURE_SYNC_GAP_MS) return;
    running.current = true;
    last.current = Date.now();
    try {
      const captures = await api.captures();
      if (!captures.available) return;
      const kept = storageFamily('captureSync');
      const outcome = await syncCaptures(captures.settings, {
        library,
        shrink: shrinkShot,
        send: (body) => api.sendCapture(body),
        load: () => kept.getJSON<SyncState>(serverUrl),
        save: (state) => kept.setJSON(serverUrl, state),
        now: Date.now,
      });
      console.info('[captures] sync', { kind: 'capture_sync', sent: outcome.sent, stopped: outcome.stopped });
    } catch (e) {
      logFailure('captures', 'sync failed', e);
    } finally {
      running.current = false;
    }
  }, [serves, serverUrl]);

  useEffect(() => {
    if (hydrated && online) void run();
  }, [hydrated, online, run]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run();
    });
    return () => sub.remove();
  }, [run]);
}
