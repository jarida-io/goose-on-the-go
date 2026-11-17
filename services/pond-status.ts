/**
 * Asking the remote-access coordinator why the Pond does not answer.
 *
 * The phone holds no credential at the coordinator of its own: it enrolls through its Pond. So,
 * while the Pond answers, the phone keeps a read grant the Pond signs with its household key
 * (`GET /api/v1/remote-access/status-grant`), and presents it to the coordinator's
 * `GET /v1/pond/status` when the Pond does not answer. The coordinator honours it only while this
 * phone is still enrolled there. The grant is kept in secure storage with the pin of the Pond that
 * signed it, so a grant for one Pond is never used to ask about another.
 */

import { ApiError, api } from '@/services/api-client';
import { timeoutSignal } from '@/services/http';
import { SecureStorage } from '@/services/secure-storage';
import { parsePondStatus, type CoordinatorPondStatus } from '@/models/pond-status';
import { logFailure } from '@/view-models/describe-error';

/** A grant kept for the Pond with `pin`. `expiresAt` is the coordinator's Unix seconds. */
export interface StoredGrant {
  pin: string;
  enrollmentUrl: string;
  grant: string;
  expiresAt: number;
}

/** A grant with less than this left is renewed the next time the Pond answers. */
const RENEW_WITHIN_MS = 7 * 24 * 60 * 60 * 1000;
/** How long the coordinator gets to answer: the strip is waiting on it. */
const COORDINATOR_TIMEOUT_MS = 6_000;

function httpsOrigin(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (parsed.pathname !== '' && parsed.pathname !== '/') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/** The kept grant for the Pond with `pin`, or null when there is none or it is another Pond's. */
export async function storedGrant(pin: string): Promise<StoredGrant | null> {
  const raw = await SecureStorage.get('pondStatusGrant');
  if (!raw) return null;
  try {
    const kept = JSON.parse(raw) as Partial<StoredGrant>;
    if (kept.pin !== pin || typeof kept.grant !== 'string' || typeof kept.expiresAt !== 'number') return null;
    const origin = httpsOrigin(kept.enrollmentUrl);
    return origin ? { pin, enrollmentUrl: origin, grant: kept.grant, expiresAt: kept.expiresAt } : null;
  } catch {
    return null;
  }
}

/**
 * Renews the grant for the Pond with `pin` when there is none or it runs out within a week. Call
 * it while the Pond answers. A Pond with remote access off answers 409, and any kept grant is
 * dropped, since there is no coordinator to ask. Never throws: a failure is logged and the old
 * grant, if any, kept.
 */
export async function renewStatusGrant(pin: string, now: number = Date.now()): Promise<void> {
  const kept = await storedGrant(pin);
  if (kept && kept.expiresAt * 1000 - now > RENEW_WITHIN_MS) return;
  try {
    const answer = await api.request<{ enrollmentUrl?: unknown; grant?: unknown; expiresAt?: unknown }>(
      '/api/v1/remote-access/status-grant',
    );
    const origin = httpsOrigin(answer.enrollmentUrl);
    if (!origin || typeof answer.grant !== 'string' || typeof answer.expiresAt !== 'number') {
      console.warn('[pond-status] the Pond answered the status grant in an unexpected shape');
      return;
    }
    const fresh: StoredGrant = { pin, enrollmentUrl: origin, grant: answer.grant, expiresAt: answer.expiresAt };
    await SecureStorage.set('pondStatusGrant', JSON.stringify(fresh));
    console.info('[pond-status] status grant renewed');
  } catch (e) {
    if (e instanceof ApiError && (e.status === 409 || e.status === 404)) {
      // 409: remote access is off. 404: a Pond that predates the grant. Nothing to ask either way.
      await SecureStorage.remove('pondStatusGrant');
      return;
    }
    logFailure('pond-status', 'status grant not renewed', e);
  }
}

/**
 * The coordinator's account of the Pond, or null when there is no grant, the grant has run out,
 * or the coordinator cannot be reached or refuses it. Never throws.
 */
export async function askCoordinator(
  pin: string,
  now: number = Date.now(),
  fetcher: typeof fetch = fetch,
): Promise<CoordinatorPondStatus | null> {
  const kept = await storedGrant(pin);
  if (!kept || kept.expiresAt * 1000 <= now) return null;
  try {
    const response = await fetcher(`${kept.enrollmentUrl}/v1/pond/status`, {
      headers: { Authorization: `PondGrant ${kept.grant}`, Accept: 'application/json' },
      signal: timeoutSignal(COORDINATOR_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[pond-status] the coordinator answered ${response.status}`);
      // Refused for good: this phone is no longer enrolled, or the grant is not honoured.
      if (response.status === 401 || response.status === 403) await SecureStorage.remove('pondStatusGrant');
      return null;
    }
    const status = parsePondStatus(await response.json());
    if (!status) console.warn('[pond-status] the coordinator answered in an unexpected shape');
    return status;
  } catch (e) {
    logFailure('pond-status', 'coordinator not reached', e);
    return null;
  }
}
