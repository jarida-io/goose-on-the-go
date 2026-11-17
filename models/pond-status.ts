/**
 * Why the Pond does not answer, as the remote-access coordinator saw it. The Pond reports to the
 * coordinator while it runs, before it stops on purpose and after it starts (goose-in-a-pond
 * `docs/remote-access.md`, "Why the Pond is offline"); a phone that cannot reach the Pond asks the
 * coordinator instead. Pure: the request is `services/pond-status.ts`, the words
 * `view-models/connection-words.ts`.
 */

/** The coordinator's answer to `GET /v1/pond/status`, the fields this app reads. Times are its Unix seconds. */
export interface CoordinatorPondStatus {
  state: 'unknown' | 'online' | 'back' | 'planned_restart' | 'unreachable';
  lastSeen?: number;
  since?: number;
  reason?: 'restart' | 'update' | 'shutdown';
  possibleCauses?: string[];
  /** The coordinator's clock when it answered, to allow for this phone's own clock. */
  now: number;
}

/** Why the Pond is offline, in the terms the strip words. `since` is in this phone's epoch ms. */
export type PondOfflineReason =
  | { kind: 'restarting'; reason: 'restart' | 'update' }
  | { kind: 'turned_off'; since: number }
  /** It stopped without warning: a power cut or the home internet; from outside they look alike. */
  | { kind: 'stopped_without_warning'; since: number }
  /** The home's connection is up, so the Pond itself stopped. */
  | { kind: 'pond_stopped'; since: number };

const STATES = new Set(['unknown', 'online', 'back', 'planned_restart', 'unreachable']);
const REASONS = new Set(['restart', 'update', 'shutdown']);

/** The answer read from an untrusted body, or null when it is not the shape the coordinator sends. */
export function parsePondStatus(body: unknown): CoordinatorPondStatus | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const seconds = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  if (typeof b.state !== 'string' || !STATES.has(b.state) || seconds(b.now) === undefined) return null;
  return {
    state: b.state as CoordinatorPondStatus['state'],
    lastSeen: seconds(b.lastSeen),
    since: seconds(b.since),
    reason: typeof b.reason === 'string' && REASONS.has(b.reason) ? (b.reason as CoordinatorPondStatus['reason']) : undefined,
    possibleCauses: Array.isArray(b.possibleCauses) ? b.possibleCauses.filter((c): c is string => typeof c === 'string') : undefined,
    now: b.now as number,
  };
}

/**
 * What to tell the household, or null when the coordinator has nothing that explains the silence:
 * it sees the Pond online or just back (so the trouble is on this phone's side), or never heard
 * from it. `phoneNow` corrects the coordinator's times for this phone's clock.
 */
export function pondOfflineReason(status: CoordinatorPondStatus, phoneNow: number): PondOfflineReason | null {
  const local = (seconds: number) => seconds * 1000 + (phoneNow - status.now * 1000);
  if (status.state === 'planned_restart') {
    if (status.reason === 'shutdown') return status.since != null ? { kind: 'turned_off', since: local(status.since) } : null;
    return { kind: 'restarting', reason: status.reason === 'update' ? 'update' : 'restart' };
  }
  if (status.state !== 'unreachable' || status.since == null) return null;
  if (status.possibleCauses?.includes('pond_stopped')) return { kind: 'pond_stopped', since: local(status.since) };
  return { kind: 'stopped_without_warning', since: local(status.since) };
}
