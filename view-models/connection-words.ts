// The connection's state in a household's words: what is happening, why when the checks say, and
// what happens next. Each is an exhaustive switch, so a new state fails to compile here rather than
// shipping without words.

import {
  connectionPhase,
  nextCheck,
  type ConnectionOutage,
  type ConnectionPhase,
  type ConnectionState,
  type NextCheck,
  type UnreachableReason,
} from '@/models/connection';
import type { PondOfflineReason } from '@/models/pond-status';
import i18n from '@/services/i18n';

export function connectionTitle(phase: ConnectionPhase, state: ConnectionState): string {
  switch (phase) {
    case 'connected':
      return state === 'remote' ? i18n.t('connection.remote') : i18n.t('connection.local');
    case 'connecting':
      return i18n.t('connection.connecting');
    case 'reconnecting':
      return i18n.t('connection.reconnecting');
    case 'unreachable':
      return i18n.t('connection.disconnected');
    case 'trust':
      return i18n.t('connection.trust');
    case 'pairing':
      if (state === 'upgrade') return i18n.t('connection.upgrade');
      return state === 'revoked' ? i18n.t('connection.revoked') : i18n.t('connection.unpaired');
  }
}

export function reasonWords(reason: UnreachableReason): string {
  switch (reason) {
    case 'local':
      return i18n.t('connection.reason.local');
    case 'local_and_remote':
      return i18n.t('connection.reason.localAndRemote');
    case 'remote':
      return i18n.t('connection.reason.remote');
    case 'remote_link':
      return i18n.t('connection.reason.remoteLink');
    case 'remote_off':
      return i18n.t('connection.reason.remoteOff');
  }
}

export function nextCheckWords(next: NextCheck): string | null {
  switch (next.kind) {
    case 'checking':
      return i18n.t('connection.checkingNow');
    case 'waiting':
      return i18n.t('connection.retryIn', { seconds: next.seconds });
    case 'none':
      return null;
  }
}

export function lastConnectedWords(at: number): string {
  const time = new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return i18n.t('connection.lastConnected', { time });
}

/** A time the Pond went offline: the time alone on the same day, else with the weekday. */
function offlineSince(at: number, now: number): string {
  const sameDay = new Date(at).toDateString() === new Date(now).toDateString();
  return new Date(at).toLocaleString(undefined, sameDay
    ? { hour: '2-digit', minute: '2-digit' }
    : { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Why the Pond is offline as the coordinator saw it: "Your Pond is restarting for an update." */
export function pondOfflineWords(why: PondOfflineReason, now: number): string {
  switch (why.kind) {
    case 'restarting':
      return why.reason === 'update' ? i18n.t('connection.why.update') : i18n.t('connection.why.restart');
    case 'turned_off':
      return i18n.t('connection.why.turnedOff', { time: offlineSince(why.since, now) });
    case 'stopped_without_warning':
      return i18n.t('connection.why.withoutWarning', { time: offlineSince(why.since, now) });
    case 'pond_stopped':
      return i18n.t('connection.why.pondStopped', { time: offlineSince(why.since, now) });
  }
}

export interface ConnectionWords {
  phase: ConnectionPhase;
  title: string;
  /** Why nothing answered, once checks have failed: "Not answering on this Wi-Fi". */
  reason: string | null;
  /** What happens next: "Trying again in 8 s", or "Checking now". */
  next: string | null;
  /** "Last connected 09:41", once the Pond is called unreachable after answering in this run. */
  lastConnected: string | null;
  /** Whether another check can help, so Try now is offered. */
  retryable: boolean;
  /** A check is running, so Try now would join it rather than start one. */
  checking: boolean;
}

export function connectionWords(state: ConnectionState, outage: ConnectionOutage | null, now: number): ConnectionWords {
  const phase = connectionPhase(state, outage);
  const waiting = phase === 'connecting' || phase === 'reconnecting' || phase === 'unreachable' || phase === 'trust';
  const next = waiting ? nextCheck(state, outage, now) : ({ kind: 'none' } as const);
  const told = phase === 'unreachable';
  return {
    phase,
    title: connectionTitle(phase, state),
    reason: told && outage?.reason ? reasonWords(outage.reason) : null,
    next: nextCheckWords(next),
    lastConnected: told && outage?.lastConnectedAt != null ? lastConnectedWords(outage.lastConnectedAt) : null,
    retryable: phase === 'reconnecting' || phase === 'unreachable' || phase === 'trust',
    checking: next.kind === 'checking',
  };
}
