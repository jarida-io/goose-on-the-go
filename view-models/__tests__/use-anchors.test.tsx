/**
 * Plans: a yes starts Goose on the plan, a wave-off fades it and comes back when the Pond refuses,
 * and stopping one sends its reasons, the member's words and "never" only when they were given.
 */

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { candidates, readAnchor, readAnchors, readyWork, stepState, type Anchor } from '@/models/anchors';
import { ApiError, api } from '@/services/api-client';
import { currentSnackbar, resetSnackbar } from '@/services/snackbar';
import { useAnchor, useAnchors, type UseAnchor, type UseAnchors } from '@/view-models/use-anchors';

jest.mock('@/services/pond-trust', () => ({ assertPondTrust: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/services/secure-random', () => ({ randomBytes: (n: number) => new Uint8Array(n).fill(7) }));
jest.mock('@/services/haptics', () => ({ confirm: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/services/api-client', () => {
  const actual = jest.requireActual('@/services/api-client');
  return {
    ...actual,
    api: { anchors: jest.fn(), anchor: jest.fn(), confirmAnchor: jest.fn(), dismissAnchor: jest.fn(), stopAnchor: jest.fn(), addAnchor: jest.fn(), editAnchor: jest.fn(), shareAnchor: jest.fn() },
  };
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

const wire = {
  anchors: [
    {
      id: 'a1',
      kind: 'trip',
      title: 'Diani trip',
      state: 'active',
      starts_at: '2026-12-12T00:00:00Z',
      ends_at: '2026-12-18T00:00:00Z',
      place: 'Diani',
      facts: [{ label: 'Flights', value: 'Booked', source: 'you' }, { label: '', value: 'no label' }],
      agent: 'trip',
      origin: 'chat',
      why: 'You said you are going in December',
      mine: true,
      shares: [],
      deliverables: [
        { id: 'd1', kind: 'plan', slot: 'plan', title: 'Plan for Diani trip', state: 'ready', hook: 'Six days, two dives', version: 1, changed: '', unseen: true },
        { id: 'd2', kind: 'checklist', slot: 'packing', title: 'Packing list', state: 'making', hook: '', version: 0, changed: '', unseen: true },
        { id: 'd3', kind: 'dossier', slot: 'area', title: 'About Diani', state: 'ready', hook: 'The beach', version: 2, changed: 'New prices', unseen: false },
      ],
      open_questions: 2,
      job: { kind: 'deliverable', subject: 'Packing list', state: 'running', rounds: 1 },
    },
    { id: 'a2', kind: 'purchase', title: 'A new phone', state: 'candidate', why: 'You asked about phones three times', mine: true, deliverables: [], job: null },
    { id: 'a3', kind: 'event', title: 'Wanjiru’s wedding', state: 'candidate', mine: false, shared_by: 'Wanjiru', deliverables: [{ id: 'd4', kind: 'plan', title: 'Wedding plan', state: 'unsure', unseen: true }] },
    { id: '', title: 'No id' },
  ],
};

async function mounted<T>(use: () => T): Promise<{ readonly vm: T; unmount: () => Promise<void> }> {
  let latest!: T;
  const Probe = () => {
    latest = use();
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
  pond.anchors.mockImplementation(async () => readAnchors(wire));
  pond.anchor.mockImplementation(async (id: string) => readAnchor(wire.anchors.find((a) => a.id === id))!);
});

afterEach(() => jest.restoreAllMocks());

describe('reading plans', () => {
  it('keeps what the Pond sent and drops what it cannot use', () => {
    const anchors = readAnchors(wire);
    expect(anchors.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
    expect(anchors[0].facts).toEqual([{ label: 'Flights', value: 'Booked', source: 'you' }]);
    expect(anchors[0]).toMatchObject({ agent: 'trip', mine: true, openQuestions: 2, job: { state: 'running', steps: [] } });
    expect(anchors[2]).toMatchObject({ mine: false, sharedBy: 'Wanjiru' });
  });

  it('leads with unread work that is ready or unsure, and offers only the member’s own candidates', () => {
    const anchors = readAnchors(wire);
    expect(readyWork(anchors).map((w) => [w.deliverable.id, w.anchor.title])).toEqual([
      ['d1', 'Diani trip'],
      ['d4', 'Wanjiru’s wedding'],
    ]);
    expect(candidates(anchors).map((a) => a.id)).toEqual(['a2']);
  });

  it('draws a step as done, under way or still to come', () => {
    expect(stepState({ state: 'done' })).toBe('done');
    expect(stepState({ state: 'running' })).toBe('current');
    expect(stepState({ state: 'pending' })).toBe('todo');
  });
});

describe('the plans view-model', () => {
  it('confirms an offered plan and shows it as the Pond answered', async () => {
    const offered = readAnchors(wire)[1];
    pond.confirmAnchor.mockResolvedValue({ ...offered, state: 'active' } as Anchor);
    const m = await mounted<UseAnchors>(() => useAnchors());
    await act(async () => {
      await m.vm.actions.confirm(offered);
    });
    expect(pond.confirmAnchor).toHaveBeenCalledWith('a2');
    expect(m.vm.data.find((a) => a.id === 'a2')?.state).toBe('active');
    expect(currentSnackbar()?.tone).toBe('success');
    await m.unmount();
  });

  it('waves a plan off at once, and puts it back where it was when the Pond refuses', async () => {
    pond.dismissAnchor.mockRejectedValue(new ApiError('POST → 409', 409, null));
    const m = await mounted<UseAnchors>(() => useAnchors());
    const offered = m.vm.data[1];
    await act(async () => {
      await m.vm.actions.dismiss(offered);
    });
    expect(m.vm.data.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
    await m.unmount();
  });

  it('reads nothing on a Pond that does not serve plans', async () => {
    const m = await mounted<UseAnchors>(() => useAnchors(false));
    expect(pond.anchors).not.toHaveBeenCalled();
    expect(m.vm.loading).toBe(false);
    await m.unmount();
  });
});

describe('one plan', () => {
  it('stops it with the reasons and words given, and never only when asked', async () => {
    pond.stopAnchor.mockResolvedValue(undefined);
    const m = await mounted<UseAnchor>(() => useAnchor('a1'));
    await act(async () => {
      await m.vm.actions.stop(['too_generic', 'bad_timing'], '  not this year ', true);
    });
    expect(pond.stopAnchor).toHaveBeenCalledWith('a1', { reasons: ['too_generic', 'bad_timing'], text: 'not this year', never: true });
    expect(m.vm.data?.state).toBe('stopped');

    await act(async () => {
      await m.vm.actions.stop([], '   ', false);
    });
    expect(pond.stopAnchor).toHaveBeenLastCalledWith('a1', { reasons: [] });
    await m.unmount();
  });

  it('takes a wrong fact off by sending the list without it, and puts it back when refused', async () => {
    pond.editAnchor.mockRejectedValue(new ApiError('PATCH → 403', 403, null));
    const m = await mounted<UseAnchor>(() => useAnchor('a1'));
    await act(async () => {
      await m.vm.actions.removeFact({ label: 'Flights', value: 'Booked', source: 'you' });
    });
    expect(pond.editAnchor).toHaveBeenCalledWith('a1', { facts: [] });
    expect(m.vm.data?.facts).toHaveLength(1);
    await m.unmount();
  });
});
