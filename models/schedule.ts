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

import type { CivilDate, CivilTime, InkTone } from '@jarida/ink';

import i18n from '@/services/i18n';
import type { TranslationKey } from '@/services/i18n';
import type { CreateScheduleRequest, Rule, Schedule, ScheduleRun, UpdateScheduleRequest } from '@/services/types';

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
 *
 * The seconds field must also be one literal second, 0 to 59. A `*`, step,
 * range or list there is valid cron that runs the agent several times a
 * minute; a step of 15 runs it every 15 seconds.
 */
export function isSixFieldCron(expr: string): boolean {
  const fields = expr.trim().split(/\s+/);
  return fields.length === 6 && /^\d{1,2}$/.test(fields[0]) && Number(fields[0]) <= 59;
}

/**
 * The cron for a one-off at a date and time.
 *
 * `POST /schedules` takes no `fire_at`, so a one-off is a cron pinned to its
 * day, month and year, sent with `once: true`: the Pond runs it at the first
 * match and then removes it. The year is the optional seventh field the
 * Pond's croner reads; without it a date a year or more out would match a
 * year early.
 */
export function oneOffCron(date: CivilDate, time: CivilTime): string {
  return `0 ${time.minute} ${time.hour} ${date.day} ${date.month} * ${date.year}`;
}

/**
 * The phone's IANA time zone, which every schedule made here is created in.
 *
 * The Pond reads a schedule's cron as wall-clock time in its own zone, one-off
 * and repeating alike, so "every day at 08:00" made on this phone is 08:00
 * here. Repeating schedules used to be sent without one, because the Pond
 * then fired every repeat in UTC whatever zone it named; it has since resolved
 * each occurrence in the schedule's zone (`next_occurrence` in its
 * `cron_scheduler.rs`), and a repeat sent in UTC now runs hours away from the
 * time the person picked.
 *
 * `expo-localization` is native, so a JS-only run falls back to UTC rather
 * than throwing.
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

/** The badge a run shows in the history: its colour and its word. */
export function runStatus(run: ScheduleRun): { tone: InkTone; key: TranslationKey } {
  switch (run.status) {
    case 'running':
      return { tone: 'brand', key: 'schedule.runs.statusRunning' };
    case 'completed':
      return { tone: 'success', key: 'schedule.runs.statusCompleted' };
    case 'failed':
      return { tone: 'danger', key: 'schedule.runs.statusFailed' };
    case 'skipped':
      return { tone: 'warning', key: 'schedule.runs.statusSkipped' };
  }
}

// ── Cron in words ────────────────────────────────────────────────────────────

/** A one-off: the Pond stores it with the `@once` cron and the instant in `fire_at`. */
export function isOneOff(schedule: Schedule): boolean {
  return schedule.fire_at != null || schedule.cron === '@once';
}

const NUMBER = /^\d{1,2}$/;
const ANY = new Set(['*', '?']);

function twoDigits(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * The weekdays a cron's weekday field names, 0 for Sunday, or null for a shape
 * this does not read (names such as `MON`, steps, `L`, `#`). `7` is Sunday too,
 * as croner reads it.
 */
function weekdays(field: string): Set<number> | null {
  const days = new Set<number>();
  for (const part of field.split(',')) {
    const range = /^(\d)(?:-(\d))?$/.exec(part);
    if (!range) return null;
    const from = Number(range[1]);
    const to = range[2] == null ? from : Number(range[2]);
    if (from > 7 || to > 7 || to < from) return null;
    for (let d = from; d <= to; d++) days.add(d % 7);
  }
  return days;
}

function dayName(day: number): string {
  // 2023-01-01 was a Sunday, so day n of that week is weekday n.
  return new Date(2023, 0, 1 + day).toLocaleDateString(undefined, { weekday: 'long' });
}

const same = (a: Set<number>, b: number[]) => a.size === b.length && b.every((d) => a.has(d));

/**
 * A cron expression in words: "Every Sunday at 18:30", "Weekdays at 07:00",
 * "Every 15 minutes". The Pond's cron has six fields, seconds first, and an
 * optional seventh for the year, which is how a one-off made here is pinned.
 *
 * Null for any shape this does not read, so the caller shows the cron itself
 * rather than words that might say something the Pond will not do. The time
 * is the schedule's own wall-clock time, in its own zone.
 */
export function describeCron(cron: string): string | null {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 6 && fields.length !== 7) return null;
  const [sec, min, hour, dom, month, dow, year] = fields;
  if (!NUMBER.test(sec)) return null;
  const pinnedYear = year != null && !ANY.has(year) ? year : null;
  if (pinnedYear != null && !/^\d{4}$/.test(pinnedYear)) return null;
  const anyDay = ANY.has(dom) && ANY.has(month) && ANY.has(dow);

  // Intervals within a day.
  if (anyDay && pinnedYear == null && ANY.has(hour)) {
    if (ANY.has(min)) return i18n.t('schedule.cron.everyMinutes', { count: 1 });
    const minuteStep = /^\*\/(\d{1,2})$/.exec(min);
    if (minuteStep) return i18n.t('schedule.cron.everyMinutes', { count: Number(minuteStep[1]) });
    if (NUMBER.test(min)) return i18n.t('schedule.cron.hourly', { minute: twoDigits(Number(min)) });
    return null;
  }
  const hourStep = /^\*\/(\d{1,2})$/.exec(hour);
  if (anyDay && pinnedYear == null && hourStep && NUMBER.test(min)) {
    return i18n.t('schedule.cron.everyHours', { count: Number(hourStep[1]), minute: twoDigits(Number(min)) });
  }

  // At one time of day.
  if (!NUMBER.test(min) || !NUMBER.test(hour)) return null;
  const time = `${twoDigits(Number(hour))}:${twoDigits(Number(min))}`;

  if (ANY.has(dom) && ANY.has(month) && pinnedYear == null) {
    if (ANY.has(dow)) return i18n.t('schedule.cron.everyDay', { time });
    const days = weekdays(dow);
    if (!days) return null;
    if (same(days, [1, 2, 3, 4, 5])) return i18n.t('schedule.cron.weekdays', { time });
    if (same(days, [0, 6])) return i18n.t('schedule.cron.weekends', { time });
    // Monday first, as a week reads.
    const names = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.has(d)).map(dayName);
    return i18n.t('schedule.cron.onDays', { days: names.join(', '), time });
  }

  if (!NUMBER.test(dom) || !ANY.has(dow)) return null;
  if (ANY.has(month)) {
    return pinnedYear == null ? i18n.t('schedule.cron.monthly', { day: Number(dom), time }) : null;
  }
  if (!NUMBER.test(month)) return null;
  if (pinnedYear != null) {
    const date = new Date(Number(pinnedYear), Number(month) - 1, Number(dom)).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    return i18n.t('schedule.cron.onDate', { date, time });
  }
  const date = new Date(2000, Number(month) - 1, Number(dom)).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  });
  return i18n.t('schedule.cron.yearly', { date, time });
}

/**
 * When a schedule runs, as its card and its detail say it: the cron in words,
 * or for a one-off the moment it fires. A zone other than the phone's is
 * named, since the words are that zone's wall-clock time. `words` is false
 * when nothing better than the raw cron could be said, which is then shown in
 * a monospaced face.
 */
export function describeWhen(schedule: Schedule, phoneZone: string): { text: string; words: boolean } {
  if (isOneOff(schedule)) {
    // A one-off's moment is an instant, shown in the phone's own time.
    const at = schedule.fire_at ? formatScheduleTime(schedule.fire_at) : '';
    return { text: i18n.t('schedule.cron.once', { when: at }), words: true };
  }
  const words = describeCron(schedule.cron);
  if (!words) return { text: schedule.cron, words: false };
  if (schedule.timezone === phoneZone) return { text: words, words: true };
  return { text: i18n.t('schedule.cron.inZone', { when: words, zone: schedule.timezone }), words: true };
}

// ── Opening one schedule ─────────────────────────────────────────────────────

/** A Pond id: a UUID, optionally prefixed. Nothing that could be a path. */
const POND_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * The schedule a `schedule_id` search param names, or null. The param comes
 * from a notification tap, or any link that opens the Schedule screen, so it
 * is checked again here rather than trusted: a malformed one opens the list.
 */
export function linkedScheduleId(param: string | string[] | undefined): string | null {
  const raw = Array.isArray(param) ? param[0] : param;
  return typeof raw === 'string' && POND_ID.test(raw) ? raw : null;
}

// ── The schedule form ────────────────────────────────────────────────────────

export type Timing = 'once' | 'repeat';

/** What the create and edit form holds, as typed. */
export interface ScheduleDraft {
  name: string;
  prompt: string;
  timing: Timing;
  date: CivilDate | null;
  time: CivilTime | null;
  cron: string;
  timezone: string;
}

/** The request, or the key of the sentence that says what to fix. */
export type DraftResult<T> = { ok: true; req: T } | { ok: false; error: TranslationKey };

/** The prompt a schedule runs, or null for a webhook, which has none. */
export function promptOf(schedule: Schedule): string | null {
  return schedule.kind.type === 'agent_prompt' ? schedule.kind.prompt : null;
}

/** An empty form for a new schedule, in the phone's zone. */
export function emptyDraft(timezone: string): ScheduleDraft {
  return { name: '', prompt: '', timing: 'once', date: null, time: null, cron: '', timezone };
}

/**
 * The form filled with a schedule as the Pond has it. A one-off's instant is
 * read back as a date and a time on this phone, which is how it was picked.
 */
export function draftFrom(schedule: Schedule): ScheduleDraft {
  const base = { name: schedule.label, prompt: promptOf(schedule) ?? '', timezone: schedule.timezone };
  if (isOneOff(schedule) && schedule.fire_at) {
    const at = new Date(schedule.fire_at);
    return {
      ...base,
      timing: 'once',
      date: { year: at.getFullYear(), month: at.getMonth() + 1, day: at.getDate() },
      time: { hour: at.getHours(), minute: at.getMinutes() },
      cron: '',
    };
  }
  return { ...base, timing: 'repeat', date: null, time: null, cron: schedule.cron };
}

/** The checks the Pond would answer with a 400, and the one-off's instant. */
function checkTiming(d: ScheduleDraft, now: Date): DraftResult<{ at: Date | null; cron: string }> {
  if (d.timing === 'once') {
    if (!d.date || !d.time) return { ok: false, error: 'schedule.errors.whenRequired' };
    const at = new Date(d.date.year, d.date.month - 1, d.date.day, d.time.hour, d.time.minute);
    if (at.getTime() <= now.getTime()) return { ok: false, error: 'schedule.errors.whenPast' };
    return { ok: true, req: { at, cron: oneOffCron(d.date, d.time) } };
  }
  if (!isSixFieldCron(d.cron)) return { ok: false, error: 'schedule.errors.cronFields' };
  return { ok: true, req: { at: null, cron: d.cron.trim() } };
}

/**
 * `POST /schedules` for a new schedule. A one-off is a pinned cron sent with
 * `once: true` (see `oneOffCron`); both kinds carry the draft's zone.
 */
export function createRequest(d: ScheduleDraft, now = new Date()): DraftResult<CreateScheduleRequest> {
  if (!d.name.trim()) return { ok: false, error: 'schedule.errors.nameRequired' };
  if (!d.prompt.trim()) return { ok: false, error: 'schedule.errors.promptRequired' };
  const timing = checkTiming(d, now);
  if (!timing.ok) return timing;
  return {
    ok: true,
    req: {
      name: d.name.trim(),
      cron: timing.req.cron,
      prompt: d.prompt.trim(),
      timezone: d.timezone,
      once: d.timing === 'once',
    },
  };
}

/**
 * `PUT /schedules/{id}` for an edit, carrying only what changed: the Pond
 * leaves an absent field as it is, and a changed shape re-registers the job,
 * so an edit to the name alone should not touch when it runs.
 *
 * A one-off's new moment goes as `fire_at`, an instant, which keeps it a
 * one-off; a cron alone would make it repeat. A cron sent for a one-off turns
 * it into a repeating schedule, which is what choosing "On repeat" means.
 *
 * A webhook's URL is not here: `PUT /schedules/{id}` takes a prompt, which
 * would replace the webhook with an agent prompt, and nothing else changes the
 * kind. Its prompt field is therefore ignored.
 */
export function updateRequest(
  original: Schedule,
  d: ScheduleDraft,
  now = new Date(),
): DraftResult<UpdateScheduleRequest> {
  const prompt = promptOf(original);
  if (!d.name.trim()) return { ok: false, error: 'schedule.errors.nameRequired' };
  if (prompt != null && !d.prompt.trim()) return { ok: false, error: 'schedule.errors.promptRequired' };

  const req: UpdateScheduleRequest = {};
  if (d.name.trim() !== original.label) req.name = d.name.trim();
  if (prompt != null && d.prompt.trim() !== prompt) req.prompt = d.prompt.trim();
  if (d.timezone !== original.timezone) req.timezone = d.timezone;

  const was = draftFrom(original);
  const timingChanged =
    d.timing !== was.timing ||
    (d.timing === 'once'
      ? JSON.stringify([d.date, d.time]) !== JSON.stringify([was.date, was.time])
      : d.cron.trim() !== was.cron.trim());
  if (timingChanged) {
    const timing = checkTiming(d, now);
    if (!timing.ok) return timing;
    if (timing.req.at) req.fire_at = timing.req.at.toISOString();
    else req.cron = timing.req.cron;
  }
  return { ok: true, req };
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
