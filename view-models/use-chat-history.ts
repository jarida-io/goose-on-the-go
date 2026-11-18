/**
 * Every conversation the Pond is holding, for the wall the Chat tab opens on.
 *
 * pond-desktop's `ChatHistory` is the reference for this screen, and the parts
 * a reader could compare are deliberately the same: the three card heights,
 * the "when" ladder, and search over the title and the preview. A conversation
 * should not read as long on the desktop and short on the phone.
 *
 * `GET /api/v1/sessions` answers newest first, with no paging and no search.
 * So the list is held here and narrowed on the device: the Pond cannot search
 * it, and a round trip per keystroke would be slower than the filter it
 * replaced.
 *
 * The wall is cut by where a conversation was begun (`?surface=`): on this
 * phone, in the room, on another screen. This phone's tab is the default, and
 * holds the Goose thread first, where the Pond posts what it did by itself.
 * What the schedules reported is read out of that thread, one card a report.
 *
 * Two fields arrive as JSON `null` rather than absent — `title` and `preview` —
 * whatever `services/types.ts` says, so every read of them tolerates both.
 *
 * The same conversations can be read as a list instead, which the desktop has
 * no need for: sections by when each last moved, counted in the same calendar
 * days as the "when" labels, so a row that says "Yesterday" is never filed
 * under Today.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useIsFocused } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useServer } from '@/providers/server-provider';
import { api } from '@/services/api-client';
import { chatRuns } from '@/services/chat-runs';
import { forgetCards } from '@/services/card-cache';
import { forgetThreads } from '@/services/chat-threads';
import { showSnackbar } from '@/services/snackbar';
import { Storage } from '@/services/storage';
import { matchesQuery } from '@/utils/search';
import { describeApiError, logFailure } from '@/view-models/describe-error';
import type { SessionMessage, SessionSummary } from '@/services/types';
import { readNote } from '@/models/message-note';
import { readReportImage } from '@/models/web-watches';

/** How much conversation a card has to show, which is how tall it gets. */
export type CardWeight = 'tile' | 'card' | 'column';

/**
 * Rows each weight spans, as the desktop's grid spends them.
 *
 * Deliberately coarse, for the desktop's reason: three heights tile
 * predictably and read as deliberate, where a continuous mapping from length
 * to pixels gives a wall of almost-equal cards that reads as a rendering bug.
 */
export const WEIGHT_SPAN: Record<CardWeight, number> = { tile: 3, card: 4, column: 5 };

/** Which conversations the wall shows. */
export type HistoryFilter = 'all' | 'chats' | 'routines';

/** Where the conversations shown were begun. `scheduled` is what the schedules reported, read from the Goose thread. */
export type HistoryTab = 'all' | 'phone' | 'room' | 'scheduled' | 'other';

export const HISTORY_TABS: readonly HistoryTab[] = ['all', 'phone', 'room', 'scheduled', 'other'];

/**
 * What each tab asks the Pond for. `here` is what this phone began and `elsewhere` what another
 * phone did; `unknown` is a conversation begun before the Pond recorded where.
 */
export const TAB_SURFACES: Record<HistoryTab, readonly string[]> = {
  all: [],
  phone: ['here', 'goose'],
  room: ['room'],
  scheduled: ['goose'],
  other: ['desktop', 'cli', 'pond', 'unknown', 'elsewhere'],
};

/** Whether a row answers one of the names a tab asked the Pond for. */
function answers(row: Pick<SessionSummary, 'surface' | 'started_here'>, wanted: readonly string[]): boolean {
  if (!row.surface) return wanted.includes('unknown');
  if (row.started_here && wanted.includes('here')) return true;
  if (row.surface === 'phone' && !row.started_here && wanted.includes('elsewhere')) return true;
  return row.surface !== 'phone' && wanted.includes(row.surface);
}

/** How much of the Goose thread is read for what the schedules reported. */
export const SCHEDULED_LIMIT = 200;

/**
 * Whether the Pond answered a narrowed read with everything: one older than `?surface=` ignores
 * it and names no surface on any row, which a narrowed read of a newer Pond never returns.
 */
export function ignoresSurfaces(rows: readonly Pick<SessionSummary, 'surface'>[], tab: HistoryTab): boolean {
  return tab !== 'other' && rows.some((row) => !row.surface);
}

/**
 * The rows a tab shows, the Goose thread first. On a Pond that names no surfaces the whole wall
 * stays under This phone, as it was, and the other tabs are empty.
 */
export function rowsForTab<T extends Pick<SessionSummary, 'surface' | 'started_here'>>(rows: readonly T[], tab: HistoryTab, unsurfaced: boolean): T[] {
  if (tab === 'all') {
    return [...rows.filter((row) => row.surface === 'goose'), ...rows.filter((row) => row.surface !== 'goose')];
  }
  if (unsurfaced) return tab === 'phone' ? [...rows] : [];
  const kept = rows.filter((row) => answers(row, TAB_SURFACES[tab]));
  return [...kept.filter((row) => row.surface === 'goose'), ...kept.filter((row) => row.surface !== 'goose')];
}

/** One report a schedule left in the Goose thread. */
export interface ScheduledNote {
  /** The message's id. */
  id: string;
  /** The schedule's name. */
  label: string;
  text: string;
  at: string;
  /** The Goose thread it was posted in, and what that thread is called. */
  sessionId: string;
  sessionTitle: string | null;
}

/** What the schedules reported in a Goose thread, newest first. */
export function scheduledNotes(messages: readonly SessionMessage[], thread: Pick<SessionSummary, 'id' | 'title'>): ScheduledNote[] {
  return messages
    .flatMap((m) => {
      const from = readNote(m.note)?.from;
      if (from?.kind !== 'schedule') return [];
      return [{ id: m.id, label: from.label, text: m.content, at: m.created_at, sessionId: thread.id, sessionTitle: thread.title?.trim() || null }];
    })
    .sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
}

/** How they are laid out: the wall of cards, or the quieter list. */
export type HistoryView = 'grid' | 'list';

/** Whether a stored value is a layout this build knows, rather than an older one's. */
export function isHistoryView(value: unknown): value is HistoryView {
  return value === 'grid' || value === 'list';
}

/** A conversation, shaped for its card. */
export interface HistoryCard {
  id: string;
  /** Null until the Pond has named it; the card says "Untitled". */
  title: string | null;
  /** Goose's first reply, whitespace collapsed and capped by the Pond. */
  preview: string | null;
  /** When it last moved, in the shortest form that is still unambiguous. */
  when: string;
  /**
   * The same moment as epoch milliseconds, for the list's sections. NaN when
   * the Pond sent a time that does not parse.
   */
  updatedAt: number;
  /** Every stored row, tool traffic included — so more than the bubbles. */
  messageCount: number;
  weight: CardWeight;
  /** The Pond opened it for itself, for a schedule or a rule. */
  routine: boolean;
  /** Goose is answering in it now, a turn this phone asked. */
  answering: boolean;
  /** The first picture sent in it, else the Pond's picture for the first page it cited, or null. */
  picture: CardPicture | null;
  /** The Goose thread, where the Pond posts what it did by itself: first on the wall, and kept. */
  goose: boolean;
  /** The conversation a touch opens: its own, or the Goose thread for something a schedule reported there. */
  opens: string;
  /** What the opened conversation is called, where that is not this card's title. */
  opensTitle?: string | null;
  /** Whether the wall may delete it. The Goose thread and what is read out of it are not the wall's to delete. */
  deletable: boolean;
}

/** A conversation card's picture, and what a screen reader hears for it (null: a sent picture). */
export interface CardPicture {
  src: string;
  label: string | null;
}

const SENT_PICTURE_SRC = /^\/api\/v1\/sessions\/[A-Za-z0-9._%-]+\/attachments\/[A-Za-z0-9._%-]+$/;

/** The Pond's picture for a card, if it is one the Pond serves: a sent picture or a page's. */
export function readCardPicture(raw: unknown): CardPicture | null {
  if (typeof raw === 'object' && raw !== null && (raw as { kind?: unknown }).kind === 'sent') {
    const src = (raw as { src?: unknown }).src;
    return typeof src === 'string' && SENT_PICTURE_SRC.test(src) ? { src, label: null } : null;
  }
  const image = readReportImage(raw);
  return image ? { src: image.src, label: image.caption ?? (image.credit || null) } : null;
}

/**
 * Bucket a conversation by how much was said in it — the desktop's
 * `cardWeight`, thresholds and all.
 */
export function cardWeight(
  session: Pick<SessionSummary, 'message_count' | 'preview'>,
): CardWeight {
  const messages = session.message_count ?? 0;
  const preview = session.preview?.length ?? 0;
  if (messages >= 20 || preview >= 160) return 'column';
  if (messages >= 6 || preview >= 60) return 'card';
  return 'tile';
}

/**
 * How many local calendar days `now` is past `then`: 0 for the same day, 1 for
 * the day before, negative when `then` is ahead of this clock.
 *
 * Midnight to midnight rather than a 24-hour span, and rounded, so a
 * daylight-saving day of 23 or 25 hours still counts as one. The "when" labels
 * and the list's sections both count with this, and have to: two rules for
 * what "yesterday" means would put a row that says Yesterday under Today.
 */
export function calendarDaysBetween(then: Date, now: Date): number {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);
}

/**
 * When a conversation last moved: a time for today, a word for yesterday, a
 * weekday inside the last week, then a date.
 *
 * The desktop's ladder, compared on local calendar days rather than 24-hour
 * spans, and rounded so a daylight-saving day of 23 or 25 hours still counts
 * as one. It adds a year once the date is not this one — the desktop stops at
 * "Sep 12", which a conversation from last September would also be.
 */
export function relativeWhen(
  iso: string,
  now: Date,
  locale: string | undefined,
  yesterday: string,
): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const days = calendarDaysBetween(then, now);

  if (days <= 0) return then.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return yesterday;
  if (days < 7) return then.toLocaleDateString(locale, { weekday: 'long' });
  if (then.getFullYear() === now.getFullYear()) {
    return then.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  }
  return then.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * The prefixes the Pond puts on sessions it opens for its own background work.
 *
 * A copy of `POND_AUTHORED_SESSION_PREFIXES` in pond-core's
 * `session_activity.rs`, where the reasoning lives: it is a deny-list because a
 * person's session id has no shape to require. The sessions table has no origin
 * column, so the id is the only thing that says who started a conversation.
 */
const POND_AUTHORED_PREFIXES = ['sched-'] as const;

export function isRoutine(id: string): boolean {
  return POND_AUTHORED_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/**
 * Whether the Pond is holding a conversation or only the row for one.
 *
 * The scheduler opens a session before each run, so a run that stores nothing
 * leaves an empty row behind, titled nothing and holding nothing to open. On a
 * Pond that had been running schedules for a while, those rows were most of the
 * first screen: two real conversations, then a wall of "Untitled" tiles. The
 * desktop draws them; a phone has less room to spend on an absence.
 *
 * Only an explicit zero counts. A server old enough to send no count at all is
 * not saying its conversations are empty, and reading it that way would hide
 * the whole wall.
 */
export function isEmpty(session: Pick<SessionSummary, 'message_count'>): boolean {
  return session.message_count === 0;
}

export function passesFilter(card: Pick<HistoryCard, 'routine'>, filter: HistoryFilter): boolean {
  if (filter === 'chats') return !card.routine;
  if (filter === 'routines') return card.routine;
  return true;
}

/** Where a card sits on the wall, in rows rather than points. */
export interface WallSlot {
  column: number;
  row: number;
  span: number;
}

/**
 * Lay cards onto `columns` columns, in the order given.
 *
 * Each card goes to whichever column is shortest so far, the leftmost on a tie.
 * That is what the desktop's grid auto-placement does with row spans, and it
 * is why newest-first still reads from the top down: two CSS-style columns
 * would put the newest half of the history down the left and the rest down
 * the right — correct masonry, unreadable chronology.
 *
 * Rows rather than points because the heights are fixed per weight, so the
 * wall needs no measuring pass: the screen multiplies out whatever unit it
 * chose.
 */
export function placeOnWall(weights: CardWeight[], columns = 2): WallSlot[] {
  const filled = new Array<number>(columns).fill(0);
  return weights.map((weight) => {
    let column = 0;
    for (let c = 1; c < columns; c += 1) {
      if (filled[c] < filled[column]) column = c;
    }
    const span = WEIGHT_SPAN[weight];
    const slot = { column, row: filled[column], span };
    filled[column] += span;
    return slot;
  });
}

/**
 * Which section of the list a conversation is filed under, by when it last
 * moved: `today`, `yesterday`, `week` for the rest of the last seven days,
 * `month` for the rest of the last thirty, then its calendar month as
 * `YYYY-MM`. A time that cannot be read is `undated`.
 *
 * Seven days are today and the six before it, which is exactly the stretch in
 * which `relativeWhen` names a weekday — so every row under "Previous 7 days"
 * reads as a day of the week, and the first row stamped with a date is the
 * first one under "Previous 30 days". A clock running ahead of the Pond reads
 * as today, as it does in the labels.
 */
export function recencyKey(updatedAt: number, now: Date): string {
  if (!Number.isFinite(updatedAt)) return 'undated';
  const then = new Date(updatedAt);
  const days = calendarDaysBetween(then, now);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return 'week';
  if (days < 30) return 'month';
  return `${then.getFullYear()}-${String(then.getMonth() + 1).padStart(2, '0')}`;
}

/** The spans above the calendar months, nearest first. */
const SPANS = ['today', 'yesterday', 'week', 'month'] as const;

type Span = (typeof SPANS)[number];

/** What each span is called. Passed in rather than looked up, so a test needs no i18next. */
export type RecencyLabels = Record<Span | 'undated', string>;

/** A run of the list under one heading. `data` is SectionList's own name for its rows. */
export interface HistorySection<T = HistoryCard> {
  /** From `recencyKey`, so it holds still while the list refreshes underneath it. */
  key: string;
  title: string;
  data: T[];
}

function isSpan(key: string): key is Span {
  return (SPANS as readonly string[]).includes(key);
}

/** Newest first: the fixed spans in order, then the months, then whatever had no date. */
function sectionOrder(a: string, b: string): number {
  const tier = (key: string) =>
    isSpan(key) ? SPANS.indexOf(key) : key === 'undated' ? SPANS.length + 1 : SPANS.length;
  const byTier = tier(a) - tier(b);
  if (byTier !== 0) return byTier;
  // Two months: `YYYY-MM` sorts as text, and the later one goes first.
  return a < b ? 1 : a > b ? -1 : 0;
}

function sectionTitle(
  key: string,
  updatedAt: number,
  now: Date,
  locale: string | undefined,
  labels: RecencyLabels,
): string {
  if (key === 'undated' || isSpan(key)) return labels[key];
  const then = new Date(updatedAt);
  return then.toLocaleDateString(
    locale,
    then.getFullYear() === now.getFullYear()
      ? { month: 'long' }
      : { month: 'long', year: 'numeric' },
  );
}

/**
 * The list's sections, newest first, each holding its conversations in the
 * order they were given — the Pond's, so the list and the wall agree about
 * what came first.
 *
 * The sections are put in order rather than trusted to arrive in it: one
 * conversation out of place in the Pond's answer, or one whose time did not
 * parse, must not open a section above Today.
 *
 * A month is named alone in the current year and with its year otherwise, the
 * way `relativeWhen` adds a year to a date: "August" means last month, and
 * August a year ago needs saying.
 */
export function sectionByRecency<T extends Pick<HistoryCard, 'updatedAt'>>(
  cards: readonly T[],
  now: Date,
  locale: string | undefined,
  labels: RecencyLabels,
): HistorySection<T>[] {
  const sections = new Map<string, HistorySection<T>>();
  for (const card of cards) {
    const key = recencyKey(card.updatedAt, now);
    let section = sections.get(key);
    if (!section) {
      section = { key, title: sectionTitle(key, card.updatedAt, now, locale, labels), data: [] };
      sections.set(key, section);
    }
    section.data.push(card);
  }
  return [...sections.values()].sort((a, b) => sectionOrder(a.key, b.key));
}

/**
 * Run `task` over every item, no more than `limit` at a time, and sort the
 * items by how each one went — in the order they were given, not the order
 * they finished in.
 *
 * `Promise.allSettled` over a map would put every request in flight at once,
 * and a selection can be a whole screen of conversations.
 */
export async function settleEach<T>(
  items: readonly T[],
  task: (item: T) => Promise<unknown>,
  limit: number,
): Promise<{ fulfilled: T[]; rejected: T[] }> {
  const succeeded = new Array<boolean>(items.length).fill(false);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        await task(items[index]);
        succeeded[index] = true;
      } catch {
        // Counted below, by `succeeded` staying false.
      }
    }
  };
  const workers = Math.min(Math.max(1, Math.floor(limit)), items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return {
    fulfilled: items.filter((_, i) => succeeded[i]),
    rejected: items.filter((_, i) => !succeeded[i]),
  };
}

/**
 * How many deletes are in flight at once when several go together.
 *
 * The Pond has no bulk delete, so a selection is one DELETE per conversation.
 * Three at a time clears a screenful in a few round trips without landing
 * dozens of requests at once on a small machine whose rate limit is per IP —
 * the budget docs/TESTING.md's incident spent in seconds.
 */
const DELETE_CONCURRENCY = 3;

export function toCard(
  session: SessionSummary,
  now: Date,
  locale: string | undefined,
  yesterday: string,
): HistoryCard {
  return {
    id: session.id,
    title: session.title?.trim() || null,
    preview: session.preview?.trim() || null,
    when: relativeWhen(session.updated_at, now, locale, yesterday),
    updatedAt: Date.parse(session.updated_at),
    messageCount: session.message_count ?? 0,
    weight: cardWeight(session),
    routine: isRoutine(session.id),
    answering: false,
    picture: readCardPicture(session.picture),
    goose: session.surface === 'goose',
    opens: session.id,
    deletable: session.surface !== 'goose',
  };
}

/** A schedule's report as a card: named for the schedule, opening the Goose thread it is in. */
export function noteCard(note: ScheduledNote, now: Date, locale: string | undefined, yesterday: string): HistoryCard {
  const preview = note.text.trim() || null;
  return {
    id: `note:${note.id}`,
    title: note.label || null,
    preview,
    when: relativeWhen(note.at, now, locale, yesterday),
    updatedAt: Date.parse(note.at),
    messageCount: 0,
    weight: cardWeight({ message_count: 0, preview: preview ?? undefined }),
    routine: true,
    answering: false,
    picture: null,
    goose: false,
    opens: note.sessionId,
    opensTitle: note.sessionTitle,
    deletable: false,
  };
}

/** Whether a conversation that was being answered no longer is. */
export function turnEnded(before: ReadonlySet<string>, now: ReadonlySet<string>): boolean {
  for (const id of before) if (!now.has(id)) return true;
  return false;
}

export interface UseChatHistory {
  data: {
    /** What the wall shows: filtered, then searched, in the Pond's order. */
    cards: HistoryCard[];
    /** The same cards under the list's headings, newest section first. */
    sections: HistorySection[];
    /** Every conversation the Pond holds, before any narrowing. Empty rows are not conversations. */
    total: number;
    query: string;
    filter: HistoryFilter;
    /** Where the conversations shown were begun. This phone, every time the wall is opened. */
    tab: HistoryTab;
    /** The layout last chosen on this device; the wall until one has been. */
    view: HistoryView;
  };
  /**
   * Nothing has arrived yet, or the stored layout has not been read back. A
   * later refresh keeps the old wall up instead.
   */
  loading: boolean;
  /** No read of the list has worked yet and the last one failed: the wall is unknown, not empty. */
  failed: boolean;
  /**
   * Words for the failed read when there are any beyond the shared ones. Never a status code. A
   * refused delete is said in the snackbar, with Try again.
   */
  error: string | null;
  actions: {
    /** Keeps what is on screen until the answer lands. */
    refresh: () => Promise<void>;
    setQuery: (query: string) => void;
    setFilter: (filter: HistoryFilter) => void;
    /** Shows what was begun somewhere else, reading it from the Pond when it has not been read yet. */
    setTab: (tab: HistoryTab) => void;
    /**
     * Kept on the device rather than the Pond: it is how this phone likes to
     * read, not a fact about the conversations.
     */
    setView: (view: HistoryView) => void;
    /** Resolves false when the Pond refused; the wall is re-read either way. */
    remove: (id: string) => Promise<boolean>;
    /**
     * Deletes each, three at a time, and re-reads the wall once all of them
     * have settled. `failed` are the ones the Pond refused, which the re-read
     * puts back.
     */
    removeMany: (ids: string[]) => Promise<{ deleted: string[]; failed: string[] }>;
  };
}

/** What one tab holds once it has been read. */
interface TabRows {
  sessions: SessionSummary[];
  notes: ScheduledNote[];
}

export function useChatHistory(): UseChatHistory {
  const { t, i18n } = useTranslation();
  const [tab, setTabState] = useState<HistoryTab>('phone');
  // Each tab as it was last read, so going back to one shows it at once while it is read again.
  const [rows, setRows] = useState<Partial<Record<HistoryTab, TabRows>>>({});
  // Two, because they end differently: a load failure ends when a load works,
  // and a refused delete ends when the reader moves on — not when the re-read
  // that follows it succeeds a moment later. A failed re-read after the wall
  // has loaded keeps the wall, so only a list that never arrived counts.
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadReason, setLoadReason] = useState<string | null>(null);
  // What the snackbar's Try again calls: the current deletes, set below once they are made.
  const retry = useRef<Pick<UseChatHistory['actions'], 'remove' | 'removeMany'>>({
    remove: async () => false,
    removeMany: async () => ({ deleted: [], failed: [] }),
  });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('all');
  // Null until the stored layout has been read back. The screen keeps its
  // loading ghosts up until then, so a reader who left on the list is not
  // shown the wall for a frame on the way back to it.
  const [view, setViewState] = useState<HistoryView | null>(null);

  useEffect(() => {
    let live = true;
    void Storage.get('chatHistoryView')
      .then((stored) => {
        if (live) setViewState(isHistoryView(stored) ? stored : 'grid');
      })
      .catch(() => {
        if (live) setViewState('grid');
      });
    return () => {
      live = false;
    };
  }, []);

  // A convenience, not a record: a write that fails costs the next launch its
  // layout and nothing else, which is not worth interrupting anyone over.
  const setView = useCallback((next: HistoryView) => {
    setViewState(next);
    void Storage.set('chatHistoryView', next).catch(() => undefined);
  }, []);

  // The base URL and bearer token arrive asynchronously; fetching before they
  // land calls the default address unauthenticated and never retries.
  const { hydrated } = useServer();

  // Mounting and focusing both ask for the list, on the same frame. One
  // request answers both: the Pond runs several queries per session to build
  // this, so a second copy of it is not free. A read of another tab is not joined.
  const inFlight = useRef<{ tab: HistoryTab; run: Promise<void> } | null>(null);
  // The tabs a read has ever arrived for; see `refresh`.
  const arrived = useRef(new Set<HistoryTab>());
  const tabRef = useRef(tab);
  // The Pond named no surface on a narrowed read, so it predates them: see `rowsForTab`.
  const unsurfaced = useRef(false);

  // Sets nothing until the answer lands, so the effect below can call it
  // without rendering twice. The spinner a pull wants is the screen's `usePullToRefresh`.
  const load = useCallback(() => {
    if (!hydrated) return Promise.resolve();
    const reading = tabRef.current;
    if (inFlight.current?.tab === reading) return inFlight.current.run;
    const mine = { tab: reading, run: Promise.resolve() };
    inFlight.current = mine;
    mine.run = (async () => {
      try {
        const answered = await api.listSessions(TAB_SURFACES[reading]);
        if (reading !== 'other') unsurfaced.current = ignoresSurfaces(answered, reading);
        const sessions = rowsForTab(answered, reading, unsurfaced.current);
        // What the schedules reported is in the Goose thread's messages, not in the list of conversations.
        const notes =
          reading === 'scheduled'
            ? (
                await Promise.all(
                  sessions.map(async (thread) => scheduledNotes(await api.listSessionMessages(thread.id, SCHEDULED_LIMIT), thread)),
                )
              )
                .flat()
                .sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))
            : [];
        setRows((all) => ({ ...all, [reading]: { sessions, notes } }));
        arrived.current.add(reading);
        if (tabRef.current === reading) {
          setLoadFailed(false);
          setLoadReason(null);
        }
      } catch (e) {
        logFailure('history', 'read failed', e);
        if (tabRef.current === reading) {
          setLoadFailed(true);
          setLoadReason(describeApiError(e));
        }
      } finally {
        if (inFlight.current === mine) inFlight.current = null;
      }
    })();
    return mine.run;
  }, [hydrated]);

  // A read that must start after now. Joining one already in flight could
  // hand back a list the Pond built before the change it is meant to show.
  const resync = useCallback(
    () => (inFlight.current?.run ?? Promise.resolve()).then(load),
    [load],
  );

  // What the screen calls: on focus, and on a pull.
  const refresh = useCallback(() => {
    // Asking again after a wall that never arrived goes back to the loading ghosts, so a pull
    // visibly does something rather than leaving the failure up until the answer lands.
    // A ref, not the rows: the screen re-runs its focus effect whenever this changes identity.
    if (!arrived.current.has(tabRef.current)) setLoadFailed(false);
    return load();
  }, [load]);

  const setTab = useCallback(
    (next: HistoryTab) => {
      if (tabRef.current === next) return;
      tabRef.current = next;
      setTabState(next);
      setLoadFailed(false);
      setLoadReason(null);
      void load();
    },
    [load],
  );

  useEffect(() => {
    if (!hydrated) return;
    void load();
  }, [hydrated, load]);

  // A finished turn can rename its conversation and gives it a preview, so a
  // wall on screen reads the list again. One off screen does on its way back.
  const answering = useSyncExternalStore(chatRuns.subscribe, chatRuns.answering);
  const focused = useIsFocused();
  const answeringBefore = useRef(answering);
  useEffect(() => {
    const ended = turnEnded(answeringBefore.current, answering);
    answeringBefore.current = answering;
    if (ended && focused) void load();
  }, [answering, focused, load]);

  /** Take conversations off every tab that holds them, ahead of the Pond's answer. */
  const drop = useCallback((doomed: ReadonlySet<string>) => {
    setRows((all) =>
      Object.fromEntries(
        Object.entries(all).map(([key, held]) => [key, { ...held, sessions: held.sessions.filter((s) => !doomed.has(s.id)) }]),
      ),
    );
  }, []);

  const remove = useCallback(
    async (id: string) => {
      drop(new Set([id]));
      try {
        await api.deleteSession(id);
        // The cards, thread and draft this phone kept for it go with it.
        void forgetCards([id]);
        forgetThreads([id]);
        return true;
      } catch (e) {
        logFailure('history', 'delete failed', e);
        showSnackbar({
          message: t('chat.history.deleteFailed'),
          tone: 'danger',
          action: { label: t('common.retry'), onPress: () => void retry.current.remove(id) },
        });
        return false;
      } finally {
        // Whatever the Pond did, the wall should say what it now holds.
        void resync();
      }
    },
    [drop, resync, t],
  );

  const removeMany = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return { deleted: [], failed: [] };
      drop(new Set(ids));
      const { fulfilled, rejected } = await settleEach(
        ids,
        (id) => api.deleteSession(id),
        DELETE_CONCURRENCY,
      );
      void forgetCards(fulfilled);
      forgetThreads(fulfilled);
      if (rejected.length > 0) {
        console.warn('[history] some deletes refused', { refused: rejected.length, of: ids.length });
        // Try again sends only the ones the Pond refused.
        showSnackbar({
          message: t('chat.history.deleteManyFailed', { count: rejected.length }),
          tone: 'danger',
          action: { label: t('common.retry'), onPress: () => void retry.current.removeMany(rejected) },
        });
      }
      // One re-read for the lot, once the last has settled rather than after
      // each. It brings back whatever the Pond refused.
      void resync();
      return { deleted: fulfilled, failed: rejected };
    },
    [drop, resync, t],
  );
  useEffect(() => {
    retry.current = { remove, removeMany };
  }, [remove, removeMany]);

  const held = rows[tab] ?? null;

  // Shaped once per answer rather than per keystroke: the "when" labels and the
  // weights do not change while someone types. The moment they were written at
  // is kept beside them, so the list's sections are cut from the same one.
  const { all, now } = useMemo(() => {
    const at = new Date();
    const yesterday = t('chat.history.yesterday');
    return {
      now: at,
      all:
        tab === 'scheduled'
          ? (held?.notes ?? []).map((n) => noteCard(n, at, i18n.language, yesterday))
          : (held?.sessions ?? [])
              .filter((s) => !isEmpty(s))
              .map((s) => toCard(s, at, i18n.language, yesterday)),
    };
  }, [held, tab, t, i18n.language]);

  const cards = useMemo(
    () =>
      all
        .filter((c) => passesFilter(c, filter) && matchesQuery([c.title, c.preview], query))
        .map((c) => (answering.has(c.id) ? { ...c, answering: true } : c)),
    [all, filter, query, answering],
  );

  const sections = useMemo(() => {
    const dated = sectionByRecency(
      cards.filter((c) => !c.goose),
      now,
      i18n.language,
      {
        today: t('chat.history.sectionToday'),
        yesterday: t('chat.history.sectionYesterday'),
        week: t('chat.history.sectionWeek'),
        month: t('chat.history.sectionMonth'),
        undated: t('chat.history.sectionUndated'),
      },
    );
    // The Goose thread keeps its place at the head of the list, whenever it last moved.
    const pinned = cards.filter((c) => c.goose);
    return pinned.length ? [{ key: 'pinned', title: t('chat.history.sectionPinned'), data: pinned }, ...dated] : dated;
  }, [cards, now, i18n.language, t]);

  return {
    data: { cards, sections, total: all.length, query, filter, tab, view: view ?? 'grid' },
    loading: (held === null && !loadFailed) || view === null,
    failed: loadFailed && held === null,
    error: held === null ? loadReason : null,
    actions: { refresh, setQuery, setFilter, setTab, setView, remove, removeMany },
  };
}
