/**
 * One schedule's run history, for the sheet a card opens.
 *
 * Read once each time the sheet opens. History only grows at the schedule's
 * own pace, and the sheet is open for seconds.
 */

import { useEffect, useState } from 'react';

import { useServer } from '@/providers/server-provider';
import { api } from '@/services/api-client';
import type { ScheduleRun } from '@/services/types';
import { describeScheduleError } from './use-schedules';

export const RUNS_LIMIT = 10;

export interface UseScheduleRuns {
  data: { runs: ScheduleRun[] };
  loading: boolean;
  error: string | null;
}

/** `scheduleId` null means the sheet is closed, and nothing is read. */
export function useScheduleRuns(scheduleId: string | null): UseScheduleRuns {
  const { hydrated, isScreenReal } = useServer();
  // The samples have never run, and an empty history is the honest mock.
  const reading = scheduleId && hydrated && isScreenReal('schedule') ? scheduleId : null;

  const [runs, setRuns] = useState<ScheduleRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A different schedule's sheet starts empty, not showing the last one's runs.
  const [shown, setShown] = useState<string | null>(null);
  if (shown !== reading) {
    setShown(reading);
    setRuns([]);
    setError(null);
    setLoading(reading != null);
  }

  useEffect(() => {
    if (!reading) return;
    let current = true;
    api
      .listScheduleRuns(reading, RUNS_LIMIT)
      .then((list) => {
        if (current) setRuns(list);
      })
      .catch((e: unknown) => {
        if (current) setError(describeScheduleError(e));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [reading]);

  return { data: { runs }, loading, error };
}
