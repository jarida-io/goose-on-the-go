/**
 * Memories, as the Memories screen reads them.
 *
 * The wire type is the Pond's `MemoryFragment` and lives in `services/types.ts`.
 * The screen's two older ideas map onto its fields, not onto fields of its own:
 *
 * - **Category chips are the `segment`.** The Pond classifies every extracted
 *   memory into one, and the segment sets its default importance and tier. The
 *   old "Reminder" chip is gone: reminders are their own table and route
 *   (`/reminders`), not a kind of memory.
 * - **"Pinned" is `tier: 'permanent'`, shown as "Kept".** That tier is the one
 *   thing decay cleanup reads that means "never fade, never prune" (consolidation
 *   does not check it yet: it can still merge a kept memory). A reserved
 *   tag or an importance threshold would be a flag the Pond ignores: the memory
 *   would look pinned here and still be archived. A memory can be kept when it
 *   is saved; changing it afterwards needs the Pond's `PUT /memories/{id}` to
 *   take a tier, which today rewords only (docs/MEMORIES.md).
 */

import i18n from '@/services/i18n';
import type { ConsolidationEvent, MemoryFragment, MemorySegment } from '@/services/types';

/** Every segment, in the order the chips show them: most personal first. */
export const MEMORY_SEGMENTS: readonly MemorySegment[] = [
  'preference',
  'routine',
  'relationship',
  'identity',
  'project',
  'knowledge',
  'correction',
  'context',
];

/** Kept forever: decay cleanup never archives or prunes a permanent memory. */
export function isKept(memory: MemoryFragment): boolean {
  return memory.tier === 'permanent';
}

/** The segments the list holds, in chip order. A filter with nothing in it is not offered. */
export function segmentsIn(memories: MemoryFragment[]): MemorySegment[] {
  const present = new Set(memories.map((m) => m.segment));
  return MEMORY_SEGMENTS.filter((s) => present.has(s));
}

/**
 * A segment's label, one literal key per branch so the i18n test can see each.
 * The switch is exhaustive: a new segment without a label fails type-checking.
 */
export function segmentLabel(segment: MemorySegment): string {
  switch (segment) {
    case 'identity': return i18n.t('memories.segment.identity');
    case 'preference': return i18n.t('memories.segment.preference');
    case 'correction': return i18n.t('memories.segment.correction');
    case 'relationship': return i18n.t('memories.segment.relationship');
    case 'project': return i18n.t('memories.segment.project');
    case 'routine': return i18n.t('memories.segment.routine');
    case 'knowledge': return i18n.t('memories.segment.knowledge');
    case 'context': return i18n.t('memories.segment.context');
  }
}

/**
 * Where a consolidation run has got to. The Pond's run is a trial: a proposer
 * suggests merges, prunes and splits, an adversary challenges each, a judge
 * rules, and the accepted ones are applied.
 */
export type ConsolidationProgress =
  | { status: 'idle' }
  | {
      status: 'running';
      stage: 'proposing' | 'challenging' | 'judging' | 'applying';
      memoryCount: number;
      proposals: number;
      accepted: number;
      applied: number;
    }
  | { status: 'done'; accepted: number; rejected: number }
  | { status: 'stopped' }
  | { status: 'failed'; message: string | null };

/** Stages in order, so a meter can say how far along a run is. */
export const CONSOLIDATION_STAGES = ['proposing', 'challenging', 'judging', 'applying'] as const;

const RUNNING_START = {
  status: 'running',
  stage: 'proposing',
  memoryCount: 0,
  proposals: 0,
  accepted: 0,
  applied: 0,
} as const;

/** The progress after one frame of `POST /memory/consolidate`. */
export function consolidationStep(progress: ConsolidationProgress, event: ConsolidationEvent): ConsolidationProgress {
  const running = progress.status === 'running' ? progress : RUNNING_START;
  switch (event.type) {
    case 'started': return { ...RUNNING_START, memoryCount: event.memory_count };
    case 'proposer_done': return { ...running, stage: 'challenging', proposals: event.proposals.length };
    case 'adversary_done': return { ...running, stage: 'judging' };
    case 'judge_done':
      return { ...running, stage: 'applying', accepted: event.decisions.filter((d) => d.accepted).length };
    case 'applied': return { ...running, applied: running.applied + 1 };
    case 'completed':
      return { status: 'done', accepted: event.result.accepted_count, rejected: event.result.rejected_count };
    case 'error': return { status: 'failed', message: event.message };
    case 'cancelled': return { status: 'stopped' };
  }
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

function sample(
  id: string,
  content: string,
  segment: MemorySegment,
  importance: number,
  tier: MemoryFragment['tier'],
  days: number,
): MemoryFragment {
  return {
    id,
    profile_id: null,
    session_id: null,
    content,
    source: 'extraction',
    tags: [],
    created_at: daysAgo(days),
    segment,
    importance,
    tier,
    access_count: 0,
    lifecycle: 'active',
  };
}

/** What the screen shows while its Developer toggle is on mock. */
export const SAMPLE_MEMORIES: MemoryFragment[] = [
  sample('sample-1', 'Prefers lights at 60% warmth in the evening', 'preference', 0.7, 'permanent', 2),
  sample('sample-2', 'Orders from Glovo on Fridays, usually sushi or Thai', 'routine', 0.65, 'long', 7),
  sample('sample-3', "Partner's name is Sam, arrives home around 6 PM", 'relationship', 0.7, 'long', 21),
  sample('sample-4', 'Dislikes notification sounds between 10 PM and 7 AM', 'preference', 0.7, 'long', 60),
];
