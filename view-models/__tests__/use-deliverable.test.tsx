/**
 * A piece of finished work: opening it marks it read once, "Not this one" and "Never this" send the
 * verb, the reasons and the member's words, and a refused reject leaves it as it was.
 */

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { readDeliverable } from '@/models/anchors';
import { ApiError, api } from '@/services/api-client';
import { resetSnackbar } from '@/services/snackbar';
import { useDeliverable, type UseDeliverable } from '@/view-models/use-deliverable';

jest.mock('@/services/pond-trust', () => ({ assertPondTrust: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/services/secure-random', () => ({ randomBytes: (n: number) => new Uint8Array(n).fill(7) }));
jest.mock('@/services/haptics', () => ({ confirm: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/services/report-share', () => ({ shareReportFile: jest.fn().mockResolvedValue(undefined), SharingUnavailableError: class extends Error {} }));
jest.mock('@/services/api-client', () => {
  const actual = jest.requireActual('@/services/api-client');
  return { ...actual, api: { deliverable: jest.fn(), deliverableSeen: jest.fn(), rejectDeliverable: jest.fn(), refreshDeliverable: jest.fn(), deliverableFile: jest.fn() } };
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
  id: 'd1',
  anchor_id: 'a1',
  anchor_title: 'Diani trip',
  kind: 'plan',
  slot: 'plan',
  title: 'Plan for Diani trip',
  state: 'unsure',
  hook: 'Six days, two dives',
  body: '# Plan\n\nDay one.\n\n## Sources\n- [Diani](https://example.org/diani)',
  facts: [{ label: 'Days', value: '6', source: 'web' }],
  sources: [{ title: 'Diani', url: 'https://example.org/diani' }, { title: 'Bad', url: 'javascript:alert(1)' }],
  objections: [{ kind: 'grounding', about: 'The ferry times are a year old', fix: 'Check the operator' }],
  changed: '',
  version: 1,
  task_id: null,
  unseen: true,
  mine: true,
  job: null,
};

async function mount(id = 'd1'): Promise<{ readonly vm: UseDeliverable; unmount: () => Promise<void> }> {
  let latest!: UseDeliverable;
  const Probe = () => {
    latest = useDeliverable(id);
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
  pond.deliverable.mockImplementation(async () => readDeliverable(wire)!);
  pond.deliverableSeen.mockResolvedValue(undefined);
  pond.rejectDeliverable.mockResolvedValue(undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('a piece of finished work', () => {
  it('reads the critic’s objections and only web sources', () => {
    const d = readDeliverable(wire)!;
    expect(d.objections).toEqual([{ kind: 'grounding', about: 'The ferry times are a year old', fix: 'Check the operator' }]);
    expect(d.sources).toEqual([{ title: 'Diani', url: 'https://example.org/diani' }]);
  });

  it('is marked read once on opening', async () => {
    let seen = false;
    pond.deliverable.mockImplementation(async () => readDeliverable({ ...wire, unseen: !seen })!);
    pond.deliverableSeen.mockImplementation(async () => {
      seen = true;
    });
    const m = await mount();
    await act(async () => {
      await m.vm.reload();
    });
    expect(pond.deliverableSeen).toHaveBeenCalledTimes(1);
    expect(pond.deliverableSeen).toHaveBeenCalledWith('d1');
    expect(m.vm.data?.unseen).toBe(false);
    await m.unmount();
  });

  it('marks nothing read for a member it is only shared with', async () => {
    pond.deliverable.mockImplementation(async () => readDeliverable({ ...wire, mine: false })!);
    const m = await mount();
    expect(pond.deliverableSeen).not.toHaveBeenCalled();
    await m.unmount();
  });

  it('sends "Not this one" with its reasons and words, and shows it waved off', async () => {
    const m = await mount();
    await act(async () => {
      await m.vm.actions.reject('not_this', ['already_know'], '  I booked it already ');
    });
    expect(pond.rejectDeliverable).toHaveBeenCalledWith('d1', { verb: 'not_this', reasons: ['already_know'], text: 'I booked it already' });
    expect(m.vm.data?.state).toBe('rejected');
    await m.unmount();
  });

  it('sends "Never this" without words when none were given', async () => {
    const m = await mount();
    await act(async () => {
      await m.vm.actions.reject('never', ['not_relevant', 'too_generic'], '');
    });
    expect(pond.rejectDeliverable).toHaveBeenCalledWith('d1', { verb: 'never', reasons: ['not_relevant', 'too_generic'] });
    await m.unmount();
  });

  it('leaves it as it was when the Pond refuses', async () => {
    pond.rejectDeliverable.mockRejectedValue(new ApiError('POST → 409', 409, null));
    const m = await mount();
    let done = true;
    await act(async () => {
      done = await m.vm.actions.reject('not_this', [], '');
    });
    expect(done).toBe(false);
    expect(m.vm.data?.state).toBe('unsure');
    await m.unmount();
  });
});
