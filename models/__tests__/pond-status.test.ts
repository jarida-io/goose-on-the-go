// The coordinator's account of the Pond, read from an untrusted body and turned into the reason the
// strip words.

import { parsePondStatus, pondOfflineReason, type CoordinatorPondStatus } from '@/models/pond-status';

const COORDINATOR_NOW = 1_800_000_000;
const status = (over: Partial<CoordinatorPondStatus>): CoordinatorPondStatus => ({ state: 'online', now: COORDINATOR_NOW, ...over });

describe('reading the answer', () => {
  it('keeps only the fields it knows, in the shapes it expects', () => {
    expect(parsePondStatus({ state: 'unreachable', since: 5, now: 9, possibleCauses: ['power_loss', 7], reason: 'nap', extra: true })).toEqual({
      state: 'unreachable', since: 5, now: 9, possibleCauses: ['power_loss'], lastSeen: undefined, reason: undefined,
    });
  });

  it('refuses what is not the coordinator speaking', () => {
    for (const body of [null, 'online', { state: 'online' }, { state: 'asleep', now: 1 }, { state: 'online', now: -1 }]) {
      expect(parsePondStatus(body)).toBeNull();
    }
  });
});

describe('why the Pond is offline', () => {
  it('names a restart or an update the Pond announced', () => {
    expect(pondOfflineReason(status({ state: 'planned_restart', reason: 'update', since: COORDINATOR_NOW - 60 }), 0)).toEqual({ kind: 'restarting', reason: 'update' });
    expect(pondOfflineReason(status({ state: 'planned_restart', reason: 'restart' }), 0)).toEqual({ kind: 'restarting', reason: 'restart' });
  });

  it('puts the coordinator\'s times on this phone\'s clock', () => {
    // This phone runs two minutes fast: the silence began at its 18:49 + 2 min.
    const phoneNow = COORDINATOR_NOW * 1000 + 120_000;
    const since = COORDINATOR_NOW - 30 * 60;
    expect(pondOfflineReason(status({ state: 'unreachable', since, possibleCauses: ['power_loss', 'network_loss'] }), phoneNow)).toEqual({
      kind: 'stopped_without_warning', since: since * 1000 + 120_000,
    });
    expect(pondOfflineReason(status({ state: 'planned_restart', reason: 'shutdown', since }), phoneNow)).toEqual({ kind: 'turned_off', since: since * 1000 + 120_000 });
  });

  it('says the Pond itself stopped when the home\'s connection is still up', () => {
    expect(pondOfflineReason(status({ state: 'unreachable', since: 1, possibleCauses: ['pond_stopped'] }), COORDINATOR_NOW * 1000)?.kind).toBe('pond_stopped');
  });

  it('has nothing to add when the coordinator sees the Pond up, back, or never heard of it', () => {
    for (const state of ['online', 'back', 'unknown'] as const) {
      expect(pondOfflineReason(status({ state, since: 1 }), 0)).toBeNull();
    }
    expect(pondOfflineReason(status({ state: 'unreachable' }), 0)).toBeNull();
  });
});
