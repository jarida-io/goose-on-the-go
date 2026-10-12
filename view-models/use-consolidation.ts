/**
 * Consolidation — tidying the memory store on request: merging duplicates,
 * pruning the stale, splitting the overloaded.
 *
 * The Pond also runs it on its own timer when it is switched on, but it says
 * nothing about those runs: progress only reaches the phone that started a
 * run, over that run's own stream. So this shows a run started here, from the
 * first stage to the tally, and nothing in between runs.
 *
 * On mock there is no run to start; `available` is false and the screen says so.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useServer } from '@/providers/server-provider';
import { ApiError, api } from '@/services/api-client';
import i18n from '@/services/i18n';
import { consolidationStep, type ConsolidationProgress } from '@/models/memory';
import { describeApiError } from './describe-error';

export interface UseConsolidation {
  progress: ConsolidationProgress;
  /** Whether this screen can start a run at all: only against a real Pond. */
  available: boolean;
  actions: {
    start: () => void;
    stop: () => void;
  };
}

/** A 501 is the Pond's setting or build, which no retry changes; the rest is the shared reading. */
export function describeConsolidationError(e: unknown): string | null {
  if (e instanceof ApiError && e.status === 501) return i18n.t('memories.consolidate.notEnabled');
  return describeApiError(e);
}

/** `onFinished` runs after a run that may have changed the store, so the list can reload. */
export function useConsolidation(onFinished: () => void): UseConsolidation {
  const { isScreenReal } = useServer();
  const available = isScreenReal('memory');
  const [progress, setProgress] = useState<ConsolidationProgress>({ status: 'idle' });
  const abort = useRef<AbortController | null>(null);

  // A screen that leaves closes the stream; the run itself carries on on the Pond.
  useEffect(() => () => abort.current?.abort(), []);

  const start = useCallback(() => {
    if (!available || abort.current) return;
    const controller = new AbortController();
    abort.current = controller;
    // Running from the tap, before the Pond's first frame; its count is 0 until then.
    let current = consolidationStep({ status: 'idle' }, { type: 'started', memory_count: 0 });
    setProgress(current);

    api
      .streamConsolidation((event) => {
        current = consolidationStep(current, event);
        setProgress(current);
      }, controller.signal)
      .then(() => {
        // The stream ended without saying how the run did.
        if (current.status === 'running') setProgress({ status: 'failed', message: null });
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        setProgress({ status: 'failed', message: describeConsolidationError(e) });
      })
      .finally(() => {
        if (abort.current === controller) abort.current = null;
        if (!controller.signal.aborted) onFinished();
      });
  }, [available, onFinished]);

  const stop = useCallback(() => {
    api.stopConsolidation().catch((e) => {
      console.warn('[consolidation] stop failed', e instanceof ApiError ? e.status : 'network');
    });
  }, []);

  return { progress, available, actions: { start, stop } };
}
