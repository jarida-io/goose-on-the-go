// The connection's state in words: each phase with what happens next, and each reason the checks give.

import '@/services/i18n';
import type { ConnectionOutage, UnreachableReason } from '@/models/connection';
import { connectionWords, lastConnectedWords, pondOfflineWords, reasonWords } from '@/view-models/connection-words';

const outage = (over: Partial<ConnectionOutage> = {}): ConnectionOutage => ({
  failures: 0, reason: null, nextCheckAt: null, lastConnectedAt: null, ...over,
});
const NOW = new Date(2026, 10, 3, 9, 43, 0).getTime();
const DROPPED = new Date(2026, 10, 3, 9, 41, 0).getTime();

describe('the words for each phase', () => {
  it('says nothing more than the route while connected', () => {
    expect(connectionWords('local', null, NOW)).toMatchObject({
      phase: 'connected', title: 'Connected on this Wi-Fi', reason: null, next: null, retryable: false,
    });
    expect(connectionWords('remote', null, NOW).title).toBe('Connected from outside your home');
  });

  it('says it is connecting on a first check, with nothing to press', () => {
    expect(connectionWords('reconnecting', null, NOW)).toMatchObject({
      phase: 'connecting', title: 'Connecting to your Pond', next: 'Checking now…', retryable: false, checking: true,
    });
  });

  it('says when it tries again while reconnecting, and offers Try now', () => {
    const words = connectionWords('disconnected', outage({ failures: 1, reason: 'local', nextCheckAt: NOW + 8_000, lastConnectedAt: DROPPED }), NOW);
    expect(words).toMatchObject({
      phase: 'reconnecting', title: 'Reconnecting to your Pond', next: 'Trying again in 8 s', retryable: true, checking: false,
    });
    // Too early to blame anything.
    expect(words.reason).toBeNull();
    expect(words.lastConnected).toBeNull();
  });

  it('gives the reason, the last answer and the next check once the Pond is unreachable', () => {
    const words = connectionWords('disconnected', outage({ failures: 3, reason: 'local', nextCheckAt: NOW + 30_000, lastConnectedAt: DROPPED }), NOW);
    expect(words).toMatchObject({
      phase: 'unreachable',
      title: 'Cannot reach your Pond',
      reason: 'Not answering on this Wi-Fi',
      next: 'Trying again in 30 s',
      lastConnected: lastConnectedWords(DROPPED),
      retryable: true,
    });
    expect(words.lastConnected).toMatch(/^Last connected .*41/);
  });

  it('leaves out a last answer it does not have', () => {
    const words = connectionWords('disconnected', outage({ failures: 1, reason: 'remote_off', nextCheckAt: NOW + 1_000 }), NOW);
    expect(words.phase).toBe('unreachable');
    expect(words.lastConnected).toBeNull();
    expect(words.reason).toBe('Outside access is not set up, so mobile data cannot reach it');
  });

  it('keeps the reason up while the next check runs, and holds Try now', () => {
    const words = connectionWords('reconnecting', outage({ failures: 4, reason: 'remote', lastConnectedAt: DROPPED }), NOW);
    expect(words).toMatchObject({ phase: 'unreachable', next: 'Checking now…', checking: true, reason: 'Not answering from outside your home' });
  });

  it('offers pairing, not Try now, where only pairing helps', () => {
    for (const state of ['unpaired', 'upgrade', 'revoked'] as const) {
      expect(connectionWords(state, null, NOW)).toMatchObject({ phase: 'pairing', retryable: false, next: null });
    }
    expect(connectionWords('revoked', null, NOW).title).toBe('Your Pond no longer recognises this phone');
  });

  it('tells a Pond that answered with the wrong key apart, and still tries again', () => {
    const words = connectionWords('trust', outage({ failures: 1, reason: 'local', nextCheckAt: NOW + 2_000 }), NOW);
    expect(words).toMatchObject({ phase: 'trust', retryable: true, next: 'Trying again in 2 s', reason: null });
    expect(words.title).toMatch(/Could not verify this Pond/);
  });
});

describe('the words for each reason', () => {
  it.each<[UnreachableReason, string]>([
    ['local', 'Not answering on this Wi-Fi'],
    ['local_and_remote', 'Not answering on this Wi-Fi or from outside'],
    ['remote', 'Not answering from outside your home'],
    ['remote_link', 'Outside access on this phone has not started'],
    ['remote_off', 'Outside access is not set up, so mobile data cannot reach it'],
  ])('%s', (reason, words) => {
    expect(reasonWords(reason)).toBe(words);
  });
});

describe('why the Pond is offline, as the coordinator saw it', () => {
  const SINCE = new Date(2026, 10, 3, 8, 49, 0).getTime();

  it('says a power cut or the home internet when the Pond stopped without warning', () => {
    const words = pondOfflineWords({ kind: 'stopped_without_warning', since: SINCE }, NOW);
    expect(words).toMatch(/^Your Pond has been offline since .*49.*\. It stopped without warning, which usually means a power cut or the home internet is down\.$/);
  });

  it('says a restart or an update the Pond announced, with no time to read', () => {
    expect(pondOfflineWords({ kind: 'restarting', reason: 'update' }, NOW)).toBe('Your Pond is restarting for an update.');
    expect(pondOfflineWords({ kind: 'restarting', reason: 'restart' }, NOW)).toBe('Your Pond is restarting.');
  });

  it('names the day as well when the Pond went offline on another one', () => {
    const yesterday = new Date(2026, 10, 2, 22, 5, 0).getTime();
    const sameDay = pondOfflineWords({ kind: 'turned_off', since: SINCE }, NOW);
    const otherDay = pondOfflineWords({ kind: 'turned_off', since: yesterday }, NOW);
    expect(sameDay).toMatch(/^Your Pond was turned off at .*49.*\.$/);
    expect(otherDay.length).toBeGreaterThan(sameDay.length);
    expect(pondOfflineWords({ kind: 'pond_stopped', since: SINCE }, NOW)).toMatch(/home internet is up, so the Pond itself has stopped\.$/);
  });
});
