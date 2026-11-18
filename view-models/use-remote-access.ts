import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useServer } from '@/providers/server-provider';
import {
  cancelRemoteAccess,
  enableRemoteAccess,
  remoteBackgroundPaused,
  RemoteInfrastructureUnavailableError,
  RemoteReplacementUnavailableError,
  type RemoteProgress,
} from '@/services/remote-access';
import { ApiError } from '@/services/api-client';
import i18n from '@/services/i18n';
import { describeLapse, lapseIn } from '@/models/lapse';
import { Storage } from '@/services/storage';

/**
 * Turn a failure into something worth reading.
 *
 * Every error `remote-access.ts` raises on purpose is already worded for a
 * person, so its message is shown as-is. An `ApiError` is not: its message is
 * built for a log line, and `POST /api/v1/remote-access/enrollment -> 503`
 * reached the screen exactly as written. It is mapped by status instead, and
 * anything unrecognised falls back to the generic failure rather than leaking
 * whatever string it happened to carry.
 *
 * Returns the copy and whether setting up again could plausibly help: a 503 is
 * the Pond saying it cannot reach coordination at all, which the Recover button
 * cannot fix, so that button is hidden for it.
 */
export function describeRemoteFailure(cause: unknown): { message: string; unavailable: boolean } {
  if (cause instanceof RemoteInfrastructureUnavailableError) {
    return { message: cause.message, unavailable: true };
  }
  // Recovery itself was refused, so pointing at Recover would be circular. The
  // message says what actually unblocks it, and the button is hidden because
  // pressing it again cannot help.
  if (cause instanceof RemoteReplacementUnavailableError) {
    return { message: cause.message, unavailable: true };
  }
  if (cause instanceof ApiError) {
    // The pond reached the coordinator and the coordinator refused: this phone
    // is already enrolled. Recovery is exactly the flow for that, so the
    // message points at it and `unavailable` stays false so the button showing
    // it is not hidden. Reporting this as unavailable told a household with
    // working remote access that it had none.
    if (cause.status === 409) {
      return { message: i18n.t('remote.alreadyEnrolled'), unavailable: false };
    }
    // A 503 is the pond unable to reach coordination, which recovery cannot
    // fix either -- but it is NOT proof the household has no coordinator. Only
    // RemoteInfrastructureUnavailableError, raised when the pond reports no
    // control URL at all, means that.
    //
    // Hiding Recover for every 503 turned one failed replacement into a dead
    // end: the failure hid the control that would have retried it, leaving
    // Enable as the only button, which could not succeed either. The message
    // says what happened; the button stays.
    if (cause.status === 503) return { message: i18n.t('remote.failed'), unavailable: false };
    if (cause.status === 401 || cause.status === 403) {
      return { message: i18n.t('remote.approval'), unavailable: false };
    }
    return { message: i18n.t('remote.failed'), unavailable: false };
  }
  if (cause instanceof Error && cause.message) return { message: cause.message, unavailable: false };
  return { message: i18n.t('remote.failed'), unavailable: false };
}
export function useRemoteAccess() {
  const { profileId, serverUrl, setRemoteEndpoint, keepLocalOnly, remoteEnabled } = useServer();
  const [progress, setProgress] = useState<RemoteProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reviewKey, setReviewKey] = useState<string | null>(null);
  const [setupUnavailable, setSetupUnavailable] = useState(false);
  const [lapsesAt, setLapsesAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [backgroundPaused, setBackgroundPaused] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; void cancelRemoteAccess().catch(() => undefined); }; }, []);
  // The deadline is only readable at home, and the warning matters away from it, so keep
  // the last one learned rather than forgetting it with the screen.
  useEffect(() => {
    void Storage.get('remoteLapsesAt').then((at) => { if (alive.current && at) setLapsesAt((current) => current ?? at); })
      .catch(() => undefined);
  }, []);
  // Asked on opening and on every return to the foreground: that return is when Android may
  // allow the service again, and the read itself is what retries it.
  useEffect(() => {
    if (!remoteEnabled) return;
    const check = () => { void remoteBackgroundPaused().then((paused) => { if (alive.current) setBackgroundPaused(paused); }); };
    check();
    const subscription = AppState.addEventListener('change', (next) => { if (next === 'active') check(); });
    return () => subscription.remove();
  }, [remoteEnabled]);
  const start = useCallback(async (recovery = false, pin?: string) => {
    if (busy) return;
    setBusy(true); setError(null); setReviewId(null); setReviewKey(null); setProgress(null); setSetupUnavailable(false);
    try {
      await enableRemoteAccess(profileId, serverUrl, (next) => { if (alive.current) setProgress(next); },
        async (endpoint, control, current) => {
          if (!alive.current) throw new Error(i18n.t('remote.cancelled'));
          await setRemoteEndpoint(endpoint, control, current);
        }, recovery ? { onReview: (id, key) => { if (alive.current) { setReviewId(id); setReviewKey(key); } }, pin } : undefined,
        (at) => {
          void (at ? Storage.set('remoteLapsesAt', at) : Storage.remove('remoteLapsesAt')).catch(() => undefined);
          if (alive.current) setLapsesAt(at);
        });
    } catch (cause) {
      // Log the cause, not just the message shown on screen. Five different
      // failures in enableRemoteAccess surface as the same sentence, so without
      // this a failed setup is indistinguishable in a bug report from any other
      // failed setup -- which is exactly what happened while diagnosing this.
      console.warn('[remote] setup failed:',
        cause instanceof ApiError ? `ApiError ${cause.status} ${cause.message}` :
        cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause));
      if (alive.current) {
        const { message, unavailable } = describeRemoteFailure(cause);
        setSetupUnavailable(unavailable);
        setError(message);
      }
    } finally { if (alive.current) setBusy(false); }
  }, [busy, profileId, serverUrl, setRemoteEndpoint, keepLocalOnly, remoteEnabled]);
  const localOnly = useCallback(async () => {
    try { await keepLocalOnly(); return true; }
    catch { if (alive.current) setError(i18n.t('remote.failed')); return false; }
  }, [keepLocalOnly]);
  // Shown whether or not anything failed: the point is to say it before access
  // lapses, and nothing has gone wrong yet at that stage.
  const lapse = describeLapse(lapseIn(lapsesAt));
  return { setupUnavailable, reviewId, reviewKey, lapse, backgroundPaused: remoteEnabled && backgroundPaused, recover: (pin?: string) => start(true, pin), progress: remoteEnabled ? 'enabled' as const : progress, error, busy, enable: () => start(false), localOnly };
}
