/**
 * Schedule Runs ViewModel
 * Fetches run history for a single schedule (used by the run-history sheet).
 */

import { useCallback, useEffect, useState } from 'react';

import { api } from '@/services/api-client';
import { useServer } from '@/providers/server-provider';
import type { ScheduleRun } from '@/models/schedule';

interface ScheduleRunsState {
  runs: ScheduleRun[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useScheduleRuns(scheduleId: string | null, limit = 10): ScheduleRunsState {
  const { online, token } = useServer();
  const [runs, setRuns] = useState<ScheduleRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    if (!online || !token || !scheduleId) {
      setRuns([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRuns(await api.getScheduleRuns(scheduleId, limit));
    } catch (err) {
      setRuns([]);
      setError(err instanceof Error ? err.message : 'Could not load run history.');
    } finally {
      setLoading(false);
    }
  }, [online, token, scheduleId, limit]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  return { runs, loading, error, refetch: fetchRuns };
}
