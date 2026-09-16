/**
 * Schedules and rules, as the Schedule screen reads them (issue #14).
 *
 * The wire types are the Pond's and live in `services/types.ts`. What is here
 * is what the screen needs on top: telling the two kinds of task apart, the
 * cron a one-off becomes, and the sample data the screen shows while its
 * Developer toggle is on mock.
 *
 * Schedules and rules are kept apart on purpose. The Pond stores both in one
 * table, but a schedule fires on a clock and a rule fires on a reading: one has
 * a next run and a run-now, the other has a cooldown and neither. Shown in one
 * list they would each be missing half of what their card says, so the screen
 * has a tab for each.
 */

import type { CivilDate, CivilTime } from '@jarida/ink';

import i18n from '@/services/i18n';
import type { Rule, Schedule } from '@/services/types';

/** A sensor rule, which `GET /schedules` returns alongside the timed schedules. */
export function isRule(schedule: Schedule): boolean {
  return schedule.kind.type === 'sensor_trigger';
}

/** The timed schedules only, soonest first; ones with no next run go last, by name. */
export function timedSchedules(schedules: Schedule[]): Schedule[] {
  return schedules
    .filter((s) => !isRule(s))
    .sort((a, b) => {
      if (a.next_run && b.next_run) return a.next_run.localeCompare(b.next_run);
      if (a.next_run) return -1;
      if (b.next_run) return 1;
      return a.label.localeCompare(b.label);
    });
}

/**
 * The Pond's cron has six fields, seconds first (`sec min hour day month
 * weekday`). A five-field expression, the usual Unix shape, is refused with
 * "invalid cron expression", so the form checks the count before sending.
 */
export function isSixFieldCron(expr: string): boolean {
  return expr.trim().split(/\s+/).length === 6;
}

/**
 * The cron for a one-off at a date and time.
 *
 * `POST /schedules` takes no `fire_at`, so a one-off is a cron pinned to its
 * day and month, sent with `once: true`: the Pond runs it at the first match
 * and then removes it. Cron has no year, which is why the form only offers
 * dates from today on — a date already past this year would wait for next.
 */
export function oneOffCron(date: CivilDate, time: CivilTime): string {
  return `0 ${time.minute} ${time.hour} ${date.day} ${date.month} *`;
}

/**
 * The phone's IANA time zone, which every schedule is created in.
 *
 * Without one the Pond assumes UTC, and "every day at 07:00" fires at 07:00
 * UTC — 10:00 in Nairobi. `expo-localization` is native, so a JS-only run
 * falls back to UTC rather than throwing.
 */
export function deviceTimeZone(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const zone = require('expo-localization').getCalendars()[0]?.timeZone;
    return typeof zone === 'string' && zone ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * When a schedule runs or ran, in the words the card uses: "Today 7:00 AM",
 * "Tomorrow 9:30 AM", "Yesterday 6:00 PM", or a short date beyond that. Both
 * directions are needed — a next run is ahead, a last run behind.
 */
export function formatScheduleTime(iso: string, now = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const time = then.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  const dayOffset = Math.round((startOfDay(then) - startOfDay(now)) / 86_400_000);
  if (dayOffset === 0) return i18n.t('schedule.time.today', { time });
  if (dayOffset === 1) return i18n.t('schedule.time.tomorrow', { time });
  if (dayOffset === -1) return i18n.t('schedule.time.yesterday', { time });
  const date = then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return i18n.t('schedule.time.onDate', { date, time });
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// ── Mock data ────────────────────────────────────────────────────────────────
//
// What the screen shows with its Developer toggle on mock. Shaped exactly as
// the Pond sends them, so the mock and real paths render through the same
// cards and nothing has to be translated between the two.

const at = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();

export const SAMPLE_SCHEDULES: Schedule[] = [
  {
    id: 'sample-morning',
    label: 'Morning briefing',
    cron: '0 0 7 * * 1-5',
    fire_at: null,
    timezone: 'Africa/Nairobi',
    kind: { type: 'agent_prompt', prompt: 'Summarise my calendar, the weather and anything urgent.' },
    paused: false,
    currently_running: false,
    last_run: at(-17),
    next_run: at(7),
    created_at: at(-24 * 14),
  },
  {
    id: 'sample-plants',
    label: 'Water the plants',
    cron: '0 30 18 * * 0',
    fire_at: null,
    timezone: 'Africa/Nairobi',
    kind: { type: 'agent_prompt', prompt: 'Remind me to water the plants.' },
    paused: true,
    currently_running: false,
    last_run: null,
    next_run: null,
    created_at: at(-24 * 3),
  },
];

export const SAMPLE_RULES: Rule[] = [
  {
    id: 'sample-heat',
    name: 'Too warm in the living room',
    paused: false,
    currently_running: false,
    created_at: at(-24 * 5),
    last_fired: at(-30),
    cooldown_secs: 600,
    source: { kind: 'sensor', signal: 'temperature' },
    condition: { op: 'gt', value: 28 },
    actions: [{ type: 'notify', title: 'It is getting warm', body: 'The living room is above 28°.' }],
  },
];
