/**
 * About you: removing a line asks first and does nothing on no; on yes the line goes at once, the
 * don't-list is read again for the rule the Pond leaves, and a refusal puts the line back.
 */

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { groupFacts, readFactSheet, readRules } from '@/models/fact-sheet';
import { ApiError, api } from '@/services/api-client';
import { resetSnackbar } from '@/services/snackbar';
import { useFactSheet, type UseFactSheet } from '@/view-models/use-fact-sheet';

jest.mock('@/services/pond-trust', () => ({ assertPondTrust: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/services/secure-random', () => ({ randomBytes: (n: number) => new Uint8Array(n).fill(7) }));
jest.mock('@/services/haptics', () => ({ confirm: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/services/api-client', () => {
  const actual = jest.requireActual('@/services/api-client');
  return { ...actual, api: { facts: jest.fn(), dontList: jest.fn(), deleteFact: jest.fn(), editFact: jest.fn(), addFact: jest.fn(), addDont: jest.fn(), deleteDont: jest.fn(), rebuildFacts: jest.fn() } };
});
jest.mock('@/providers/server-provider', () => ({ useServer: () => ({ hydrated: true, isScreenReal: () => true }) }));
jest.mock('../use-live', () => ({
  useLive: (read: () => Promise<unknown>, _delay: unknown, enabled = true) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(() => {
      if (enabled) void read();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);
  },
}));

const pond = jest.mocked(api);

const sheet = () =>
  readFactSheet({
    facts: [
      { id: 'f1', category: 'home', fact: 'Lives in Kilimani', confidence: 'sure', source: { kind: 'memory', ref: null }, tools: ['get_weather'], pinned: false, state: 'active' },
      { id: 'f2', category: 'food', fact: 'Allergic to peanuts', confidence: 'sure', source: { kind: 'you' }, pinned: true, state: 'active' },
      { id: 'f3', category: 'food', fact: 'Likes nyama choma', confidence: 'likely', source: { kind: 'summary' }, pinned: false },
      { id: 'f4', category: 'work', fact: 'Removed line', state: 'removed' },
    ],
    limit: 100,
  });

async function mount(): Promise<{ readonly vm: UseFactSheet; unmount: () => Promise<void> }> {
  let latest!: UseFactSheet;
  const Probe = () => {
    latest = useFactSheet();
    return null;
  };
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<Probe />);
  });
  return {
    get vm() {
      return latest;
    },
    unmount: async () => {
      await act(async () => tree.unmount());
    },
  };
}

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  resetSnackbar();
  jest.resetAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  pond.facts.mockImplementation(async () => sheet());
  pond.dontList.mockResolvedValue(readRules({ rules: [{ id: 'r1', rule: 'Recipes built on a colour', strength: 'never', reasons: ['too_generic', 'nonsense'] }] }));
  pond.deleteFact.mockResolvedValue(undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('the fact sheet', () => {
  it('shows the active lines under their headings, pinned first', () => {
    const groups = groupFacts(sheet().facts);
    expect(groups.map((g) => g.category)).toEqual(['home', 'food']);
    expect(groups[1].facts.map((f) => f.id)).toEqual(['f2', 'f3']);
    expect(readRules({ rules: [{ id: 'r1', rule: 'x', reasons: ['too_generic', 'nonsense'] }] })[0].reasons).toEqual(['too_generic']);
  });

  it('removes nothing when the member says no', async () => {
    const m = await mount();
    const ask = jest.fn().mockResolvedValue(false);
    await act(async () => {
      await m.vm.actions.remove(m.vm.data.facts[0], ask);
    });
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ destructive: true }));
    expect(pond.deleteFact).not.toHaveBeenCalled();
    expect(m.vm.data.facts).toHaveLength(3);
    await m.unmount();
  });

  it('removes the line on yes, and reads the don’t-list again for the rule the Pond leaves', async () => {
    const m = await mount();
    const reads = pond.dontList.mock.calls.length;
    await act(async () => {
      await m.vm.actions.remove(m.vm.data.facts[0], jest.fn().mockResolvedValue(true));
    });
    expect(pond.deleteFact).toHaveBeenCalledWith('f1');
    expect(m.vm.data.facts.map((f) => f.id)).toEqual(['f2', 'f3']);
    expect(pond.dontList.mock.calls.length).toBe(reads + 1);
    await m.unmount();
  });

  it('puts the line back where it was when the Pond refuses', async () => {
    pond.deleteFact.mockRejectedValue(new ApiError('DELETE → 500', 500, null));
    const m = await mount();
    await act(async () => {
      await m.vm.actions.remove(m.vm.data.facts[1], jest.fn().mockResolvedValue(true));
    });
    expect(m.vm.data.facts.map((f) => f.id)).toEqual(['f1', 'f2', 'f3']);
    await m.unmount();
  });

  it('pins a line at once and keeps the Pond’s answer', async () => {
    pond.editFact.mockImplementation(async (id, change) => ({ ...sheet().facts.find((f) => f.id === id)!, pinned: change.pinned === true }));
    const m = await mount();
    await act(async () => {
      await m.vm.actions.pin(m.vm.data.facts[0], true);
    });
    expect(pond.editFact).toHaveBeenCalledWith('f1', { pinned: true });
    expect(m.vm.data.facts[0].pinned).toBe(true);
    await m.unmount();
  });
});
