/**
 * Schedules — the Pond's cron and one-off tasks (issue #14).
 *
 * Live in two ways. `GET /schedules/events` says when a run starts and
 * finishes, which is what flips a card to "Running" and back; a poll on top
 * picks up what the stream does not carry, such as the next run the scheduler
 * worked out afterwards, and carries on alone while the stream is down.
 *
 * Behind the Developer toggle for `schedule`: on mock, the same cards render
 * `SAMPLE_SCHEDULES` and the actions change them locally.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useServer } from '@/providers/server-provider';
import { ApiError, api } from '@/services/api-client';
import i18n from '@/services/i18n';
import type { CreateScheduleRequest, Schedule } from '@/services/types';
import { SAMPLE_SCHEDULES, deviceTimeZone, isRule, timedSchedules } from '@/models/schedule';
import { describeApiError } from './describe-error';
import { MIN_POLL_MS, useLive } from './use-live';

/** While something is running, its result is worth seeing promptly. */
export const SCHEDULES_ACTIVE_MS = 5_000;
/** With the event stream up, the poll only refreshes next-run times. */
export const SCHEDULES_STREAMING_MS = 60_000;
/** With it down, the poll is all there is. */
export const SCHEDULES_IDLE_MS = 30_000;
/** How soon an event stream that ended is opened again, doubling while it keeps ending. */
export const SCHEDULES_STREAM_RETRY_MS = 5_000;
/** The longest wait between attempts; the poll covers the gap. */
export const SCHEDULES_STREAM_RETRY_MAX_MS = 60_000;

export interface UseSchedules {
  data: {
    /** Timed schedules, soonest first. Rules are left out: they have their own tab. */
    schedules: Schedule[];
    /** Whether run starts and finishes are arriving as they happen, or by poll. */
    live: 'stream' | 'poll';
  };
  loading: boolean;
  error: string | null;
  /**
   * A load failed and nothing has loaded from this source yet, so the list is
   * unknown rather than empty. `error` can be null even so: an unreachable or
   * refused Pond is the connection banner's to describe.
   */
  failed: boolean;
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
  const [failed, setFailed] = useState(false);
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
    setFailed(false);
    setStreamDown(false);
  }

  // Which source last loaded, so the first failure of a new one is reported.
  const loadedFrom = useRef<boolean | null>(null);
  // Back from mock, the real source has loaded nothing into the emptied list.
  useEffect(() => {
    if (!real) loadedFrom.current = null;
  }, [real]);
  // Bumped by every change made here. A read that began before one would put
  // back the list as it was, so its answer is dropped.
  const changes = useRef(0);
  // How many reads are out, whoever asked; a finished run starts none while any is.
  const reading = useRef(0);
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
      reading.current += 1;
      try {
        const list = await api.listSchedules();
        if (startedAt === changes.current) setAll(list);
        loadedFrom.current = real;
        setError(null);
        setFailed(false);
      } catch (e) {
        if (loud || loadedFrom.current !== real) setError(describeScheduleError(e));
        else console.warn('[schedules] refresh failed; showing the last result', e instanceof ApiError ? e.status : 'network');
        if (loadedFrom.current !== real) setFailed(true);
      } finally {
        reading.current -= 1;
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

  // The event stream, opened again whenever it ends. The Pond takes no stream
  // permit for it, so asking again costs no chat stream; the backoff is only
  // for a Pond that is not answering, and the poll covers the gap.
  useEffect(() => {
    if (!hydrated || !real) return;
    const controller = new AbortController();
    const { signal } = controller;
    let backoff = SCHEDULES_STREAM_RETRY_MS;
    let reopen: ReturnType<typeof setTimeout> | null = null;
    let followUp: ReturnType<typeof setTimeout> | null = null;
    let lastFollowUp = 0;

    // A finished run moved last_run and next_run; the event carries neither, so
    // a read follows. Runs can finish in a burst, so those reads are coalesced
    // to one per MIN_POLL_MS, and none starts while another read is out or
    // while the app is not in front.
    const readAfterRun = () => {
      if (followUp) return;
      followUp = setTimeout(
        () => {
          followUp = null;
          if (signal.aborted || reading.current > 0 || AppState.currentState !== 'active') return;
          lastFollowUp = Date.now();
          void load(false);
        },
        Math.max(0, lastFollowUp + MIN_POLL_MS - Date.now()),
      );
    };

    const open = () => {
      reopen = null;
      api
        .streamScheduleEvents(
          (event) => {
            // Rule fires come down the same stream, and `all` holds the rules too.
            if (!allRef.current.some((s) => s.id === event.schedule_id && !isRule(s))) return;
            const running = event.status === 'running';
            setAll((current) =>
              current.map((s) => (s.id === event.schedule_id ? { ...s, currently_running: running } : s)),
            );
            if (!running) readAfterRun();
          },
          signal,
          () => {
            backoff = SCHEDULES_STREAM_RETRY_MS;
            setStreamDown(false);
          },
        )
        .catch(() => undefined)
        .finally(() => {
          if (signal.aborted) return;
          setStreamDown(true);
          reopen = setTimeout(open, backoff);
          backoff = Math.min(backoff * 2, SCHEDULES_STREAM_RETRY_MAX_MS);
        });
    };
    open();

    return () => {
      controller.abort();
      if (reopen) clearTimeout(reopen);
      if (followUp) clearTimeout(followUp);
    };
  }, [hydrated, real, load]);

  const create = useCallback(
    async (req: Omit<CreateScheduleRequest, 'timezone'>) => {
      // Only a one-off carries the zone; see deviceTimeZone for why.
      const full: CreateScheduleRequest = req.once ? { ...req, timezone: deviceTimeZone() } : req;
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

  // Schedules whose run-now has not been answered. The Pond starts a run for
  // every request, with no check for one already going, so a second tap in
  // that window would start a second run.
  const starting = useRef(new Set<string>());

  /** Running from the tap rather than the answer, and put back if the Pond refuses. */
  const runNow = useCallback(
    async (schedule: Schedule) => {
      if (!real || starting.current.has(schedule.id)) return;
      starting.current.add(schedule.id);
      setError(null);
      // A poll that began before the tap would read it as idle and put the card
      // back, and so would one that began before the Pond took the request.
      changes.current += 1;
      setAll((current) => current.map((s) => (s.id === schedule.id ? { ...s, currently_running: true } : s)));
      try {
        await api.runScheduleNow(schedule.id);
        changes.current += 1;
      } catch (e) {
        changes.current += 1;
        setAll((current) =>
          current.map((s) => (s.id === schedule.id ? { ...s, currently_running: schedule.currently_running } : s)),
        );
        setError(describeScheduleError(e));
      } finally {
        starting.current.delete(schedule.id);
      }
    },
    [real],
  );

  return {
    data: { schedules: timedSchedules(all), live },
    loading,
    error,
    failed,
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
