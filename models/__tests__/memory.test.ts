/**
 * The Memories screen's reading of the Pond's fields: which segments the chips
 * offer, what "Kept" means, and how a consolidation run's frames become
 * progress.
 */

import { consolidationStep, isKept, segmentsIn, type ConsolidationProgress } from '@/models/memory';
import type { ConsolidationEvent, MemoryFragment } from '@/services/types';
import { describeConsolidationError } from '@/view-models/use-consolidation';
import { describeMemoryError } from '@/view-models/use-memories';
import { describeApiError } from '@/view-models/describe-error';
import { ApiError } from '@/services/api-client';
import i18n from '@/services/i18n';

function memory(overrides: Partial<MemoryFragment>): MemoryFragment {
  return {
    id: 'id',
    profile_id: null,
    session_id: null,
    content: 'Likes tea',
    source: 'chat',
    tags: [],
    created_at: '2026-10-01T00:00:00Z',
    access_count: 0,
    ...overrides,
  };
}

describe('isKept', () => {
  it('is the permanent tier and nothing else', () => {
    expect(isKept(memory({ tier: 'permanent' }))).toBe(true);
    expect(isKept(memory({ tier: 'long', importance: 1 }))).toBe(false);
    expect(isKept(memory({ tags: ['pinned'] }))).toBe(false);
  });
});

describe('segmentsIn', () => {
  it('offers only the segments present, in chip order, skipping unsegmented memories', () => {
    const list = [
      memory({ segment: 'context' }),
      memory({ segment: 'preference' }),
      memory({}),
      memory({ segment: 'context' }),
    ];
    expect(segmentsIn(list)).toEqual(['preference', 'context']);
  });
});

describe('consolidationStep', () => {
  const run = (events: ConsolidationEvent[]) =>
    events.reduce<ConsolidationProgress>(consolidationStep, { status: 'idle' });

  it('follows a run through every stage to its tally', () => {
    const steps: ConsolidationEvent[] = [
      { type: 'started', memory_count: 20 },
      { type: 'proposer_done', proposals: [{}, {}, {}] },
      { type: 'adversary_done', challenges: [{}, {}, {}] },
      { type: 'judge_done', decisions: [{ accepted: true }, { accepted: false }, { accepted: true }] },
      { type: 'applied' },
    ];
    expect(run(steps)).toEqual({
      status: 'running',
      stage: 'applying',
      memoryCount: 20,
      proposals: 3,
      accepted: 2,
      applied: 1,
    });

    const done = run([...steps, { type: 'completed', result: { accepted_count: 2, rejected_count: 1, duration_ms: 5 } }]);
    expect(done).toEqual({ status: 'done', accepted: 2, rejected: 1 });
  });

  it('ends on a cancel or an error', () => {
    expect(run([{ type: 'started', memory_count: 3 }, { type: 'cancelled' }])).toEqual({ status: 'stopped' });
    expect(run([{ type: 'error', message: 'no model' }])).toEqual({ status: 'failed', message: 'no model' });
  });
});

describe('errors', () => {
  it('says consolidation is switched off on a 501', () => {
    expect(describeConsolidationError(new ApiError('x', 501, null))).toBe(i18n.t('memories.consolidate.notEnabled'));
  });

  it('shows the sentence a 400 came with, else the shared reading', () => {
    const blank = new ApiError('x', 400, null, 'a memory cannot be blank -- delete it instead');
    expect(describeMemoryError(blank)).toBe('a memory cannot be blank -- delete it instead');
    const bare = new ApiError('x', 500, null);
    expect(describeMemoryError(bare)).toBe(describeApiError(bare));
  });
});
