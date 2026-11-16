// To-dos and reminders, the hooks that bring them up, and the places and sources a hook can attach
// to (docs/MY-GOOSE-HUB.md, part 3). A hook of a kind this phone does not know keeps its own words
// and its spec as sent, so editing the to-do never drops it.

import type { TranslationKey } from '@/services/i18n';
import type { HookSourceKindWire, HookWriteWire, RepeatEveryWire, TodoWriteWire } from '@/services/types';

import { count, list, oneOf, readAll, record, strings, text, textOrNull, time, type Raw } from './me-read';

export type TodoKind = 'todo' | 'reminder';
export type TodoState = 'open' | 'done' | 'dropped';
export type TodoSource = 'you' | 'chat' | 'goose' | 'idea';
export type RepeatEvery = RepeatEveryWire;
export type Transition = 'arrive' | 'leave';

export const REPEATS: readonly RepeatEvery[] = ['day', 'weekday', 'week', 'month'];

export type HookSpec =
  | { kind: 'time'; at: string }
  | { kind: 'repeat'; every: RepeatEvery; at: string; days: number[] }
  | { kind: 'place'; placeId: string; transition: Transition }
  | { kind: 'event'; sourceId: string; event: string }
  | { kind: 'connector'; connectorId: string; event: string; filter: string | null }
  | { kind: 'other'; rawKind: string; raw: Raw };

export interface Hook {
  /** Empty for a hook the member is adding, which the Pond has not numbered yet. */
  id: string;
  /** The Pond's plain sentence for it, when it sent one. */
  label: string;
  spec: HookSpec;
  nextFireAt: string | null;
  lastFiredAt: string | null;
}

export interface Todo {
  id: string;
  kind: TodoKind;
  text: string;
  notes: string | null;
  state: TodoState;
  dueAt: string | null;
  hooks: Hook[];
  ask: boolean;
  source: TodoSource;
  lastAskedAt: string | null;
  asked: number;
  snoozedUntil: string | null;
  createdAt: string | null;
  doneAt: string | null;
}

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

function readSpec(kind: string, raw: unknown): HookSpec | null {
  const s = record(raw) ?? {};
  switch (kind) {
    case 'time': {
      const at = time(s.at);
      return at ? { kind, at } : null;
    }
    case 'repeat': {
      const at = text(s.at);
      return {
        kind,
        every: oneOf(s.every, REPEATS, 'day'),
        at: CLOCK.test(at) ? at : '09:00',
        days: list(s.days).filter((d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 7),
      };
    }
    case 'place': {
      const placeId = text(s.place_id);
      return placeId ? { kind, placeId, transition: s.transition === 'leave' ? 'leave' : 'arrive' } : null;
    }
    case 'event': {
      const sourceId = text(s.source_id);
      const event = text(s.event);
      return sourceId && event ? { kind, sourceId, event } : null;
    }
    case 'connector': {
      const connectorId = text(s.connector_id);
      const event = text(s.event);
      return connectorId && event ? { kind, connectorId, event, filter: textOrNull(s.filter) } : null;
    }
    default:
      return kind ? { kind: 'other', rawKind: kind, raw: s } : null;
  }
}

export function readHook(raw: unknown): Hook | null {
  const r = record(raw);
  if (!r) return null;
  const spec = readSpec(text(r.kind), r.spec);
  if (!spec) return null;
  return { id: text(r.id), label: text(r.label), spec, nextFireAt: time(r.next_fire_at), lastFiredAt: time(r.last_fired_at) };
}

export function readTodo(raw: unknown): Todo | null {
  const r = record(raw);
  const id = text(r?.id);
  const words = text(r?.text);
  if (!r || !id || !words) return null;
  return {
    id,
    kind: r.kind === 'reminder' ? 'reminder' : 'todo',
    text: words,
    notes: textOrNull(r.notes),
    // An unknown state is left open: a to-do the phone hides could be one the member still owes.
    state: oneOf(r.state, ['open', 'done', 'dropped'] as const, 'open'),
    dueAt: time(r.due_at),
    hooks: list(r.hooks).flatMap((h) => {
      const hook = readHook(h);
      return hook ? [hook] : [];
    }),
    ask: r.ask === true,
    source: oneOf(r.source, ['you', 'chat', 'goose', 'idea'] as const, 'you'),
    lastAskedAt: time(r.last_asked_at),
    asked: count(r.asked),
    snoozedUntil: time(r.snoozed_until),
    createdAt: time(r.created_at),
    doneAt: time(r.done_at),
  };
}

export function readTodos(raw: unknown): Todo[] {
  return readAll(raw, 'todos', readTodo);
}

/** A hook as the Pond takes it back: what it was sent, for a kind the phone cannot write itself. */
export function hookWrite(hook: Hook): HookWriteWire {
  const spec = hook.spec;
  switch (spec.kind) {
    case 'time':
      return { kind: 'time', spec: { at: spec.at } };
    case 'repeat':
      return { kind: 'repeat', spec: spec.days.length ? { every: spec.every, at: spec.at, days: spec.days } : { every: spec.every, at: spec.at } };
    case 'place':
      return { kind: 'place', spec: { place_id: spec.placeId, transition: spec.transition } };
    case 'event':
      return { kind: 'event', spec: { source_id: spec.sourceId, event: spec.event } };
    case 'connector':
      return { kind: 'connector', spec: { connector_id: spec.connectorId, event: spec.event, filter: spec.filter } };
    case 'other':
      return { kind: spec.rawKind as HookWriteWire['kind'], spec: spec.raw as unknown as HookWriteWire['spec'] };
  }
}

export interface TodoDraft {
  kind: TodoKind;
  text: string;
  notes: string;
  dueAt: string | null;
  ask: boolean;
  hooks: Hook[];
}

export function todoWrite(draft: TodoDraft): TodoWriteWire {
  return {
    kind: draft.kind,
    text: draft.text.trim(),
    notes: draft.notes.trim() || null,
    due_at: draft.dueAt,
    ask: draft.ask,
    hooks: draft.hooks.map(hookWrite),
  };
}

export function draftOf(todo: Todo | null, kind: TodoKind = 'todo'): TodoDraft {
  return todo
    ? { kind: todo.kind, text: todo.text, notes: todo.notes ?? '', dueAt: todo.dueAt, ask: todo.ask, hooks: todo.hooks }
    : { kind, text: '', notes: '', dueAt: null, ask: kind === 'todo', hooks: [] };
}

/**
 * The hooks with the one at `index` changed. The replacement carries no Pond sentence, so the row
 * reads the new choice rather than the old one's label until the Pond sends its own on save.
 */
export function replaceHook(hooks: Hook[], index: number, hook: Hook): Hook[] {
  return hooks.map((h, i) => (i === index ? { ...hook, label: '' } : h));
}

/** The picker's fields for a hook being changed, read back from its spec. A kind leaves out what it does not use. */
export interface HookPickerSeed {
  kind: 'time' | 'repeat' | 'place' | 'event';
  date?: { year: number; month: number; day: number };
  time?: { hour: number; minute: number };
  every?: RepeatEvery;
  days?: number[];
  transition?: Transition;
}

/**
 * What the picker opens on when the member taps a hook to change it, or null for a kind this phone
 * cannot write (it can only be removed). A time is read in the phone's own zone, as it was set.
 */
export function pickerSeedOf(hook: Hook): HookPickerSeed | null {
  const spec = hook.spec;
  switch (spec.kind) {
    case 'time': {
      const at = new Date(spec.at);
      if (Number.isNaN(at.getTime())) return { kind: 'time' };
      return {
        kind: 'time',
        date: { year: at.getFullYear(), month: at.getMonth() + 1, day: at.getDate() },
        time: { hour: at.getHours(), minute: at.getMinutes() },
      };
    }
    case 'repeat': {
      const [hour, minute] = spec.at.split(':').map((n) => Number.parseInt(n, 10));
      const clock = Number.isFinite(hour) && Number.isFinite(minute) ? { time: { hour, minute } } : {};
      return { kind: 'repeat', every: spec.every, days: spec.days, ...clock };
    }
    case 'place':
      return { kind: 'place', transition: spec.transition };
    case 'event':
    case 'connector':
      return { kind: 'event' };
    case 'other':
      return null;
  }
}

/** Goose has asked about this one and is waiting on an answer: open, asked, and not snoozed. */
export function isAsking(todo: Todo, now: Date): boolean {
  if (todo.state !== 'open' || !todo.ask || todo.asked < 1 || !todo.lastAskedAt) return false;
  return !todo.snoozedUntil || Date.parse(todo.snoozedUntil) <= now.getTime();
}

/** When this one next comes up: its due time or the soonest hook, whichever is first. */
export function nextUp(todo: Todo): string | null {
  const times = [todo.dueAt, ...todo.hooks.map((h) => h.nextFireAt)].filter((t): t is string => t !== null);
  return times.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
}

/** Open to-dos in the order they come up: timed ones soonest first, then the rest newest first. */
export function inOrder(todos: readonly Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    const na = nextUp(a);
    const nb = nextUp(b);
    if (na && nb) return Date.parse(na) - Date.parse(nb);
    if (na) return -1;
    if (nb) return 1;
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
  });
}

/** Whether any open to-do waits on arriving at or leaving a place, which needs the phone's geofences. */
export function placesWatched(todos: readonly Todo[]): Set<string> {
  const ids = new Set<string>();
  for (const todo of todos) {
    if (todo.state !== 'open') continue;
    for (const hook of todo.hooks) if (hook.spec.kind === 'place') ids.add(hook.spec.placeId);
  }
  return ids;
}

export interface Place {
  id: string;
  label: string;
  lat: number;
  lng: number;
  radiusM: number;
}

/** A geofence smaller than this misses arrivals on a phone's coarse fix; larger is the member's call. */
export const MIN_RADIUS_M = 100;
export const DEFAULT_RADIUS_M = 150;

export function readPlace(raw: unknown): Place | null {
  const r = record(raw);
  const id = text(r?.id);
  const lat = r?.lat;
  const lng = r?.lng;
  if (!r || !id || typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const radius = typeof r.radius_m === 'number' && Number.isFinite(r.radius_m) ? r.radius_m : DEFAULT_RADIUS_M;
  return { id, label: text(r.label) || id, lat, lng, radiusM: Math.max(MIN_RADIUS_M, radius) };
}

export type HookSourceKind = HookSourceKindWire;
const SOURCE_KINDS: readonly HookSourceKind[] = ['presence', 'camera', 'device', 'sensor', 'web_watch', 'cart', 'connector'];

export interface HookSource {
  id: string;
  kind: HookSourceKind;
  label: string;
  events: { id: string; label: string }[];
}

export interface HookSources {
  places: Place[];
  sources: HookSource[];
}

function readSource(raw: unknown): HookSource | null {
  const r = record(raw);
  const id = text(r?.id);
  const kind = SOURCE_KINDS.find((k) => k === r?.kind);
  // A source of a kind this phone does not know cannot be written back as a hook, so it is not offered.
  if (!r || !id || !kind) return null;
  const events = list(r.events).flatMap((e) => {
    const o = record(e);
    const eventId = text(o?.id);
    return eventId ? [{ id: eventId, label: text(o?.label) || eventId }] : [];
  });
  return events.length ? { id, kind, label: text(r.label) || id, events } : null;
}

export function readHookSources(raw: unknown): HookSources {
  const r = record(raw);
  return { places: readAll(r?.places, 'places', readPlace), sources: readAll(r?.sources, 'sources', readSource) };
}

/** A hook on a source: a connector's event is a connector hook, anything else an event hook. */
export function hookOnSource(source: HookSource, eventId: string): Hook {
  const spec: HookSpec =
    source.kind === 'connector'
      ? { kind: 'connector', connectorId: source.id, event: eventId, filter: null }
      : { kind: 'event', sourceId: source.id, event: eventId };
  return { id: '', label: '', spec, nextFireAt: null, lastFiredAt: null };
}

/** How the phone says a hook, with the words to fill it, when the Pond has not said it already. */
export interface HookPhrase {
  key: TranslationKey;
  params: Record<string, string | number>;
}

const HOME = /^(home|my home|house)$/i;

/** Day numbers 1 (Monday) to 7 (Sunday), as the member's language names them. */
export function weekdayNames(days: readonly number[], locale?: string): string {
  // 2024-01-01 was a Monday, so day d is 2024-01-0d.
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => new Date(2024, 0, d).toLocaleDateString(locale, { weekday: 'long' }))
    .join(', ');
}

/** A time as a short day and clock in the phone's own zone: "Tue 11 Nov, 18:00". */
export function whenText(iso: string, locale?: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  const clock = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day}, ${clock}`;
}

export function hookPhrase(hook: Hook, sources: HookSources | null, locale?: string): HookPhrase | null {
  const spec = hook.spec;
  switch (spec.kind) {
    case 'time':
      return { key: 'goose.hook.time', params: { when: whenText(spec.at, locale) } };
    case 'repeat':
      switch (spec.every) {
        case 'day':
          return { key: 'goose.hook.everyDay', params: { at: spec.at } };
        case 'weekday':
          return { key: 'goose.hook.everyWeekday', params: { at: spec.at } };
        case 'week':
          return spec.days.length
            ? { key: 'goose.hook.everyWeekOn', params: { days: weekdayNames(spec.days, locale), at: spec.at } }
            : { key: 'goose.hook.everyWeek', params: { at: spec.at } };
        case 'month':
          return { key: 'goose.hook.everyMonth', params: { at: spec.at } };
      }
      return null;
    case 'place': {
      const place = sources?.places.find((p) => p.id === spec.placeId);
      if (place && HOME.test(place.label)) {
        return { key: spec.transition === 'leave' ? 'goose.hook.leaveHome' : 'goose.hook.getHome', params: {} };
      }
      const name = place?.label ?? null;
      if (!name) return { key: spec.transition === 'leave' ? 'goose.hook.leaveSomewhere' : 'goose.hook.arriveSomewhere', params: {} };
      return { key: spec.transition === 'leave' ? 'goose.hook.leave' : 'goose.hook.arrive', params: { place: name } };
    }
    case 'event':
    case 'connector': {
      const id = spec.kind === 'event' ? spec.sourceId : spec.connectorId;
      const source = sources?.sources.find((s) => s.id === id);
      const event = source?.events.find((e) => e.id === spec.event);
      if (!source || !event) return null;
      return { key: 'goose.hook.event', params: { source: source.label, event: event.label } };
    }
    case 'other':
      return null;
  }
}

/** Whether the to-do needs the phone's location: it has a hook on arriving at or leaving a place. */
export function needsLocation(todo: Pick<Todo, 'hooks'>): boolean {
  return todo.hooks.some((h) => h.spec.kind === 'place');
}

/** Strings for a source kind's group in the hook picker. */
export function sourceKindKey(kind: HookSourceKind): TranslationKey {
  switch (kind) {
    case 'presence': return 'goose.hookPicker.kind.presence';
    case 'camera': return 'goose.hookPicker.kind.camera';
    case 'device': return 'goose.hookPicker.kind.device';
    case 'sensor': return 'goose.hookPicker.kind.sensor';
    case 'web_watch': return 'goose.hookPicker.kind.webWatch';
    case 'cart': return 'goose.hookPicker.kind.cart';
    case 'connector': return 'goose.hookPicker.kind.connector';
  }
}

export function sourcesByKind(sources: readonly HookSource[]): { kind: HookSourceKind; sources: HookSource[] }[] {
  return SOURCE_KINDS.map((kind) => ({ kind, sources: sources.filter((s) => s.kind === kind) })).filter((g) => g.sources.length > 0);
}

/** A dated mention the Pond lifted from a chat, offered as a to-do the member adds with one tap. */
export interface TodoOffer {
  reminderId: string;
  text: string;
  /** The chat's own words about when, never parsed here. */
  whenSaid: string;
  /** The time the Pond worked out from them, or null when it could not, and the phone asks. */
  dueAt: string | null;
  saidAt: string | null;
}

export function readTodoOffers(raw: unknown): TodoOffer[] {
  return readAll(raw, 'offers', (o) => {
    const r = record(o);
    const reminderId = text(r?.reminder_id);
    const words = text(r?.text);
    return r && reminderId && words ? { reminderId, text: words, whenSaid: text(r.when_said), dueAt: time(r.due_at), saidAt: time(r.said_at) } : null;
  });
}

/** Notes a to-do keeps, as lines, for a screen that shows them under its text. */
export function noteLines(todo: Pick<Todo, 'notes'>): string[] {
  return strings((todo.notes ?? '').split('\n'));
}
