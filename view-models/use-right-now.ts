/**
 * The Home tab's "Right now" row: the outdoor temperature, what is playing, and the next routine.
 *
 * Each card is one read and each can be absent. A card with nothing true to say is not drawn,
 * which is the whole change: these used to show 72 degrees Fahrenheit from a Pond that reports
 * Celsius, Lo-fi Beats that were not playing, and a 2:00 PM Team Standup from a calendar the
 * product does not integrate with.
 *
 * The next-routine card replaced that meeting. Its data is real -- the Pond's own schedules,
 * soonest first -- but it is not what the card first claimed, so it is labelled a routine and
 * never an event.
 */
import type { IconName } from '@/constants/icons';
import { conditionIcon } from '@/models/weather-card';
import { useRef, useState } from 'react';

import { useServer } from '@/providers/server-provider';
import { api, type PondApiClient } from '@/services/api-client';
import i18n from '@/services/i18n';
import type { NowPlayingResponse, UpcomingSchedule } from '@/services/types';
import { useLive } from './use-live';

export type Greeting = 'morning' | 'afternoon' | 'evening';

export type NowPlaying =
  | {
      state: 'playing';
      track: string;
      artist: string | null;
      albumArt?: string | null;
      progressMs?: number;
      durationMs?: number;
    }
  | { state: 'idle' };

export interface NextRoutine {
  label: string;
  nextRun: Date;
}

export type Until = { unit: 'now' } | { unit: 'minutes' | 'hours' | 'days'; count: number };

/** Degrees Celsius outside, and the place they are for: the Pond's location, not the reader's. */
export interface Outdoor {
  temp: number;
  place: string | null;
  /** The sky's icon: the condition by day or night, a plain cloud when the Pond names none. */
  icon: IconName;
  cond?: string | null;
  hi?: number | null;
  lo?: number | null;
  hum?: number | null;
  wind?: number | null;
  isDay?: boolean | null;
}

export interface RightNow {
  /** Null when no location is configured, or the read failed. */
  outdoor: Outdoor | null;
  nowPlaying: NowPlaying | null;
  nextRoutine: NextRoutine | null;
}

export interface UseRightNow {
  data: RightNow;
}

/**
 * How often each card asks.
 *
 * Now Playing follows the desktop's cadence, and every call reaches Spotify. Weather is cached by
 * the Pond for fifteen minutes, so asking more often than every ten only re-reads that cache. The
 * next routine only moves when one runs or is edited.
 */
export const NOW_PLAYING_MS = 10_000;
export const NOW_PLAYING_BACKOFF_MS = 5 * 60_000;
export const ROUTINE_MS = 60_000;
export const WEATHER_MS = 10 * 60_000;

/** One Now Playing read: what the card shows, and whether the next ask should wait. */
export interface NowPlayingReading {
  card: NowPlaying | null;
  /** Spotify refused, or there is no account. Neither is fixed by asking again soon. */
  backOff: boolean;
}

/** Which greeting the phone's own clock calls for. */
export function greetingFor(hour: number): Greeting {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

/**
 * What the card may honestly say about playback, or null for nothing.
 *
 * `connected: true, playing: false` is the only answer that means "nothing is playing". An error
 * means Spotify answered and refused, and a claim of playback with no track cannot be named.
 */
export function nowPlayingOf(r: NowPlayingResponse): NowPlaying | null {
  if (!r.connected || r.error) return null;
  if (r.playing === false) return { state: 'idle' };
  if (r.playing && r.track) {
    return {
      state: 'playing',
      track: r.track,
      artist: r.artist ?? null,
      ...(r.album_art ? { albumArt: r.album_art } : {}),
      ...(typeof r.progress_ms === 'number' ? { progressMs: r.progress_ms } : {}),
      ...(typeof r.duration_ms === 'number' ? { durationMs: r.duration_ms } : {}),
    };
  }
  return null;
}

/** The soonest routine that will actually run: not paused, with a real time to run at. */
export function nextRoutineOf(upcoming: UpcomingSchedule[]): NextRoutine | null {
  for (const s of upcoming) {
    if (s.paused || !s.next_run) continue;
    const nextRun = new Date(s.next_run);
    if (Number.isNaN(nextRun.getTime())) continue;
    return { label: s.label, nextRun };
  }
  return null;
}

/**
 * How far off `at` is, in the largest whole unit that reads naturally.
 *
 * A time already passed is "due now": a scheduler that has not yet run a due routine leaves its
 * next_run behind the clock, and a negative countdown would read as a bug.
 */
export function untilOf(at: Date, now: Date): Until {
  const minutes = Math.round((at.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return { unit: 'now' };
  if (minutes < 60) return { unit: 'minutes', count: minutes };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { unit: 'hours', count: hours };
  return { unit: 'days', count: Math.round(hours / 24) };
}

/** How far off `at` is, as Home says it: "in 2 h", or "due now" once it has passed. */
export function untilText(at: Date, now: Date): string {
  const until = untilOf(at, now);
  if (until.unit === 'now') return i18n.t('home.dueNow');
  if (until.unit === 'minutes') return i18n.t('home.inMinutes', { count: until.count });
  if (until.unit === 'hours') return i18n.t('home.inHours', { count: until.count });
  return i18n.t('home.inDays', { count: until.count });
}

type RightNowReader = Pick<PondApiClient, 'weather' | 'nowPlaying' | 'upcomingSchedules'>;

/** What it is like outside, or null: no location configured, or the read failed. */
export async function readOutdoor(client: Pick<RightNowReader, 'weather'> = api): Promise<Outdoor | null> {
  try {
    const w = await client.weather();
    if (!w.enabled || typeof w.temp !== 'number') return null;
    return {
      temp: w.temp,
      place: w.location_name?.trim() || null,
      icon: conditionIcon(w.cond ?? '', typeof w.is_day === 'boolean' ? w.is_day : null),
      ...(w.cond ? { cond: w.cond } : {}),
      ...(typeof w.hi === 'number' ? { hi: w.hi } : {}),
      ...(typeof w.lo === 'number' ? { lo: w.lo } : {}),
      ...(typeof w.hum === 'number' ? { hum: w.hum } : {}),
      ...(typeof w.wind === 'number' ? { wind: w.wind } : {}),
      ...(typeof w.is_day === 'boolean' ? { isDay: w.is_day } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * What is playing, and whether to back off.
 *
 * Only an answer from Spotify can say "stop asking so often": a refusal, or no account. A Pond
 * that could not be reached has said nothing about Spotify, and backing off then would leave the
 * card five minutes stale after a blip -- the staleness this exists to fix.
 */
export async function readNowPlaying(client: Pick<RightNowReader, 'nowPlaying'> = api): Promise<NowPlayingReading> {
  try {
    const r = await client.nowPlaying();
    return { card: nowPlayingOf(r), backOff: !r.connected || !!r.error };
  } catch {
    return { card: null, backOff: false };
  }
}

export function nowPlayingDelay(reading: NowPlayingReading): number {
  return reading.backOff ? NOW_PLAYING_BACKOFF_MS : NOW_PLAYING_MS;
}

export async function readNextRoutine(client: Pick<RightNowReader, 'upcomingSchedules'> = api): Promise<NextRoutine | null> {
  try {
    // Paused schedules come back too, so ask for a few and take the first that will run.
    return nextRoutineOf(await client.upcomingSchedules(5));
  } catch {
    return null;
  }
}

/** Read the row in one pass. Never rejects: a card whose read fails is absent, not wrong. */
export async function readRightNow(client: RightNowReader = api): Promise<RightNow> {
  const [outdoor, playing, nextRoutine] = await Promise.all([
    readOutdoor(client),
    readNowPlaying(client),
    readNextRoutine(client),
  ]);
  return { outdoor, nowPlaying: playing.card, nextRoutine };
}

/**
 * The row, kept current while Home is in front.
 *
 * Three loops rather than one, because the cards cost different amounts and go stale at
 * different rates; a single cadence would either poll the weather cache every ten seconds or let
 * a track sit a minute after it ended.
 */
export function useRightNow(): UseRightNow {
  const [outdoor, setOutdoor] = useState<Outdoor | null>(null);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [nextRoutine, setNextRoutine] = useState<NextRoutine | null>(null);
  const lastPlaying = useRef<NowPlayingReading>({ card: null, backOff: false });

  // The base URL and bearer token arrive asynchronously; reading before they land calls the
  // default address unauthenticated and never retries.
  const { hydrated } = useServer();

  useLive(
    async () => {
      const reading = await readNowPlaying();
      lastPlaying.current = reading;
      setNowPlaying(reading.card);
    },
    () => nowPlayingDelay(lastPlaying.current),
    hydrated,
  );
  useLive(async () => setOutdoor(await readOutdoor()), WEATHER_MS, hydrated);
  useLive(async () => setNextRoutine(await readNextRoutine()), ROUTINE_MS, hydrated);

  return { data: { outdoor, nowPlaying, nextRoutine } };
}
