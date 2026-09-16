/**
 * Schedules ViewModel
 * Fetches/mutates cron & one-off schedules on the paired Pond desktop, with
 * live updates via SSE (falling back to polling if the stream errors).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/services/api-client';
import { openSseStream } from '@/services/sse';
import { useServer } from '@/providers/server-provider';
import type {
  CreateScheduleInput,
  Schedule,
  ScheduleResultEvent,
  UpdateScheduleInput,
} from '@/models/schedule';

const ACTIVE_POLL_MS = 4_000;
const IDLE_POLL_MS = 30_000;

interface SchedulesState {
  schedules: Schedule[];
  loading: boolean;
  error: string | null;
  liveUpdates: 'sse' | 'polling';
  refetch: () => Promise<void>;
  create: (input: CreateScheduleInput) => Promise<Schedule>;
  update: (id: string, patch: UpdateScheduleInput) => Promise<Schedule>;
  remove: (id: string) => Promise<void>;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
  runNow: (id: string) => Promise<void>;
}

export function useSchedules(): SchedulesState {
  const { online, token, serverUrl } = useServer();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveUpdates, setLiveUpdates] = useState<'sse' | 'polling'>('sse');
  const schedulesRef = useRef<Schedule[]>(schedules);

  useEffect(() => {
    schedulesRef.current = schedules;
  }, [schedules]);

  const fetchSchedules = useCallback(async () => {
    if (!online || !token) {
      setSchedules([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setSchedules(await api.listSchedules());
    } catch (err) {
      setSchedules([]);
      setError(
        err instanceof Error ? err.message : 'Could not load schedules from the Pond desktop.',
      );
    } finally {
      setLoading(false);
    }
  }, [online, token]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  // Live updates: SSE primary, polling fallback.
  useEffect(() => {
    if (!online || !token) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      setLiveUpdates('polling');
      const hasActive = schedulesRef.current.some((s) => s.currently_running);
      interval = setInterval(fetchSchedules, hasActive ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    };

    setLiveUpdates('sse');
    const handle = openSseStream<ScheduleResultEvent>(
      `${serverUrl}/api/v1/schedules/events`,
      { Authorization: `Bearer ${token}` },
      (evt) => {
        setSchedules((prev) =>
          prev.map((s) =>
            s.id === evt.schedule_id
              ? {
                  ...s,
                  currently_running: evt.status === 'running',
                  last_run: evt.status !== 'running' ? new Date().toISOString() : s.last_run,
                }
              : s,
          ),
        );
      },
      () => {
        if (!interval) startPolling();
      },
    );

    return () => {
      handle.close();
      if (interval) clearInterval(interval);
    };
  }, [online, token, serverUrl, fetchSchedules]);

  const create = useCallback(async (input: CreateScheduleInput) => {
    const created = await api.createSchedule(input);
    setSchedules((prev) => [...prev, created]);
    return created;
  }, []);

  const update = useCallback(async (id: string, patch: UpdateScheduleInput) => {
    const updated = await api.updateSchedule(id, patch);
    setSchedules((prev) => prev.map((s) => (s.id === id ? updated : s)));
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api.deleteSchedule(id);
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const pause = useCallback(async (id: string) => {
    await api.pauseSchedule(id);
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, paused: true } : s)));
  }, []);

  const resume = useCallback(async (id: string) => {
    await api.resumeSchedule(id);
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, paused: false } : s)));
  }, []);

  const runNow = useCallback(async (id: string) => {
    await api.runScheduleNow(id);
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, currently_running: true } : s)));
  }, []);

  return {
    schedules,
    loading,
    error,
    liveUpdates,
    refetch: fetchSchedules,
    create,
    update,
    remove,
    pause,
    resume,
    runNow,
  };
}
