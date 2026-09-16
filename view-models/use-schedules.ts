/**
 * Schedules — the Pond's cron and one-off tasks (issue #14).
 *
 * Live in two ways. `GET /schedules/events` says when a run starts and
 * finishes, which is what flips a card to "Running" and back; a poll on top
 * picks up what the stream does not carry, such as the next run the scheduler
 * worked out afterwards, and takes over entirely if the stream drops.
 *
 * Behind the Developer toggle for `schedule`: on mock, the same cards render
 * `SAMPLE_SCHEDULES` and the actions change them locally.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useServer } from '@/providers/server-provider';
import { ApiError, api } from '@/services/api-client';
import i18n from '@/services/i18n';
import type { CreateScheduleRequest, Schedule } from '@/services/types';
import { SAMPLE_SCHEDULES, deviceTimeZone, timedSchedules } from '@/models/schedule';
import { describeApiError } from './describe-error';
import { useLive } from './use-live';

/** While something is running, its result is worth seeing promptly. */
export const SCHEDULES_ACTIVE_MS = 5_000;
/** With the event stream up, the poll only refreshes next-run times. */
export const SCHEDULES_STREAMING_MS = 60_000;
/** With it down, the poll is all there is. */
export const SCHEDULES_IDLE_MS = 30_000;

export interface UseSchedules {
  data: {
    /** Timed schedules, soonest first. Rules are left out: they have their own tab. */
    schedules: Schedule[];
    /** Whether run starts and finishes are arriving as they happen, or by poll. */
    live: 'stream' | 'poll';
  };
  loading: boolean;
  error: string | null;
  actions: {
    refresh: () => Promise<void>;
    /** Resolves to why the Pond refused it, or null once it exists. */
    create: (req: Omit<CreateScheduleRequest, 'timezone'>) => Promise<string | null>;
    setPaused: (schedule: Schedule, paused: boolean) => Promise<void>;
    runNow: (schedule: Schedule) => Promise<void>;
  };
}

/**
 * What a schedule or rule failure means here. A 400 from the scheduler names
 * the field it disliked, so that sentence is shown as it came; a 503 is the
 * Pond running without a scheduler, which no retry will change.
 */
export function describeScheduleError(e: unknown): string | null {
  if (e instanceof ApiError) {
    if (e.status === 400 && e.detail) return e.detail;
    if (e.status === 404) return i18n.t('schedule.errors.gone');
    if (e.status === 503) return i18n.t('schedule.errors.noScheduler');
  }
  return describeApiError(e);
}

export function useSchedules(): UseSchedules {
  const { hydrated, isScreenReal } = useServer();
  const real = isScreenReal('schedule');

  const [all, setAll] = useState<Schedule[]>(() => (real ? [] : SAMPLE_SCHEDULES));
  const [loading, setLoading] = useState(real);
  const [error, setError] = useState<string | null>(null);
  const [streamDown, setStreamDown] = useState(false);
  const live = streamDown ? 'poll' : 'stream';

  // Flipping the Developer toggle swaps the data source under a mounted
  // screen. Reset while rendering, React's pattern for state that follows a
  // prop, rather than in an effect that would first paint the old source.
  const [source, setSource] = useState(real);
  if (source !== real) {
    setSource(real);
    setAll(real ? [] : SAMPLE_SCHEDULES);
    setLoading(real);
    setError(null);
    setStreamDown(false);
  }

  // Which source last loaded, so the first failure of a new one is reported.
  const loadedFrom = useRef<boolean | null>(null);
  // Bumped by every change made here. A read that began before one would put
  // back the list as it was, so its answer is dropped.
  const changes = useRef(0);
  const allRef = useRef(all);
  useEffect(() => {
    allRef.current = all;
  }, [all]);

  /** `loud` is a read somebody asked for; a poll is quiet and keeps the last good data. */
  const load = useCallback(
    async (loud: boolean) => {
      if (!real) return;
      if (loud) {
        setLoading(true);
        setError(null);
      }
      const startedAt = changes.current;
      try {
        const list = await api.listSchedules();
        if (startedAt === changes.current) setAll(list);
        loadedFrom.current = real;
        setError(null);
      } catch (e) {
        if (loud || loadedFrom.current !== real) setError(describeScheduleError(e));
        else console.warn('[schedules] refresh failed; showing the last result', e instanceof ApiError ? e.status : 'network');
      } finally {
        setLoading(false);
      }
    },
    [real],
  );

  const refresh = useCallback(() => load(true), [load]);

  const delay = useCallback(() => {
    if (allRef.current.some((s) => s.currently_running)) return SCHEDULES_ACTIVE_MS;
    return live === 'stream' ? SCHEDULES_STREAMING_MS : SCHEDULES_IDLE_MS;
  }, [live]);

  useLive(() => load(false), delay, hydrated && real);

  // The event stream. One attempt per mount: if it ends, the poll carries on
  // alone rather than this reopening a stream the Pond may be refusing.
  useEffect(() => {
    if (!hydrated || !real) return;
    const controller = new AbortController();
    api
      .streamScheduleEvents((event) => {
        const running = event.status === 'running';
        setAll((current) =>
          current.map((s) => (s.id === event.schedule_id ? { ...s, currently_running: running } : s)),
        );
        // A finished run moved last_run and next_run; the event carries neither.
        if (!running) void load(false);
      }, controller.signal)
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setStreamDown(true);
      });
    return () => controller.abort();
  }, [hydrated, real, load]);

  const create = useCallback(
    async (req: Omit<CreateScheduleRequest, 'timezone'>) => {
      const full: CreateScheduleRequest = { ...req, timezone: deviceTimeZone() };
      if (!real) {
        changes.current += 1;
        setAll((current) => [...current, mockSchedule(full)]);
        return null;
      }
      try {
        const created = await api.createSchedule(full);
        changes.current += 1;
        setAll((current) => [...current, created]);
        return null;
      } catch (e) {
        return describeScheduleError(e) ?? i18n.t('schedule.errors.createFailed');
      }
    },
    [real],
  );

  /** Optimistic, and put back if the Pond refuses: a switch that lies is worse than a slow one. */
  const setPaused = useCallback(
    async (schedule: Schedule, paused: boolean) => {
      changes.current += 1;
      setAll((current) => current.map((s) => (s.id === schedule.id ? { ...s, paused } : s)));
      if (!real) return;
      try {
        await (paused ? api.pauseSchedule(schedule.id) : api.resumeSchedule(schedule.id));
      } catch (e) {
        changes.current += 1;
        setAll((current) => current.map((s) => (s.id === schedule.id ? { ...s, paused: schedule.paused } : s)));
        setError(describeScheduleError(e));
      }
    },
    [real],
  );

  const runNow = useCallback(
    async (schedule: Schedule) => {
      if (!real) return;
      setError(null);
      try {
        await api.runScheduleNow(schedule.id);
        // The stream will say when it starts; without one, the next poll will.
        setAll((current) => current.map((s) => (s.id === schedule.id ? { ...s, currently_running: true } : s)));
      } catch (e) {
        setError(describeScheduleError(e));
      }
    },
    [real],
  );

  return {
    data: { schedules: timedSchedules(all), live },
    loading,
    error,
    actions: { refresh, create, setPaused, runNow },
  };
}

/** What the Pond would have answered, for the mock path. */
function mockSchedule(req: CreateScheduleRequest): Schedule {
  return {
    id: `mock-${Date.now()}`,
    label: req.name,
    cron: req.cron,
    fire_at: null,
    timezone: req.timezone ?? 'UTC',
    kind: { type: 'agent_prompt', prompt: req.prompt ?? '' },
    paused: false,
    currently_running: false,
    last_run: null,
    next_run: null,
    created_at: new Date().toISOString(),
  };
}
