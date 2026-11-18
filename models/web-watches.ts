// What the Pond's web watches, saved cards and report extras look like on the wire, read strictly:
// a field of the wrong shape is dropped rather than trusted, so an older or newer Pond never
// crashes a screen.

export interface WatchFilters {
  words?: string[];
  max_price?: number;
  min_year?: number;
  max_mileage?: number;
}

export interface WatchItem {
  title: string;
  price?: string;
  currency?: string;
  mileage?: string;
  year?: string;
  link?: string;
  image?: string;
  snippet?: string;
}

export interface WebWatch {
  id: string;
  title: string;
  address: string;
  lookingFor: string;
  filters: WatchFilters;
  filtersWords: string;
  /** For a watch with a rule (words appearing, a number passing a value): how the page stood at the last check. */
  standing: string | null;
  /** Whether the watch tells about one rule read off the whole page rather than its items. */
  hasRule: boolean;
  intervalHours: number;
  paused: boolean;
  itemsCount: number;
  matchingCount: number;
  failures: number;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
}

export interface WatchChange {
  id: number;
  foundAt: string;
  line: string;
  matched: boolean;
  kind: 'new' | 'gone' | 'price_changed' | 'updated' | 'condition';
}

export interface WatchThinking {
  id: string;
  text: string;
  createdAt: string;
}

export interface WatchPreview {
  title: string;
  snippet?: string;
  link?: string;
}

export interface WebWatchDetail extends WebWatch {
  active: boolean;
  preview: WatchPreview | null;
  initialThinking: string | null;
  thinkingHistory: WatchThinking[];
  items: WatchItem[];
  changes: WatchChange[];
}

export type SavedKind = 'recipe' | 'listing' | 'place' | 'report' | 'note';

export interface SavedSource {
  title: string;
  url: string;
}

export interface SavedItem {
  id: string;
  kind: SavedKind;
  title: string;
  body: string;
  collection: string | null;
  shared: boolean;
  mine: boolean;
  sources: SavedSource[];
  /** The kind's own fields, as the Pond sent them. */
  servings?: string;
  time?: string;
  ingredients: string[];
  steps: string[];
  price?: string;
  currency?: string;
  mileage?: string;
  year?: string;
  location?: string;
  address?: string;
  hours?: string;
  link?: string;
  photos: string[];
  updatedAt: string;
}

export interface SavedCollection {
  name: string;
  count: number;
}

export interface ReportImage {
  key: string;
  src: string;
  credit: string;
  caption?: string;
  page?: string;
}

export interface ReportOption {
  title: string;
  price?: string;
  link?: string;
  why?: string;
  fields: [string, string][];
  sources: SavedSource[];
}

type Raw = Record<string, unknown>;

const isRecord = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
const webUrl = (v: unknown): string | undefined => {
  const s = str(v);
  return s && /^https?:\/\//i.test(s) ? s : undefined;
};

function readSources(v: unknown): SavedSource[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((s) => {
    if (!isRecord(s)) return [];
    const url = webUrl(s.url);
    return url ? [{ title: str(s.title) ?? url, url }] : [];
  });
}

function readFilters(v: unknown): WatchFilters {
  if (!isRecord(v)) return {};
  return {
    words: strings(v.words),
    max_price: num(v.max_price),
    min_year: num(v.min_year),
    max_mileage: num(v.max_mileage),
  };
}

export function readWebWatch(raw: unknown): WebWatch | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.title !== 'string') return null;
  return {
    id: raw.id,
    title: raw.title,
    address: str(raw.address) ?? '',
    lookingFor: str(raw.looking_for) ?? '',
    filters: readFilters(raw.filters),
    filtersWords: str(raw.filters_words) ?? '',
    standing: str(raw.standing) ?? null,
    hasRule: isRecord(raw.filters) && isRecord(raw.filters.tell_when),
    intervalHours: num(raw.interval_hours) ?? 6,
    paused: raw.paused === true,
    itemsCount: num(raw.items_count) ?? 0,
    matchingCount: num(raw.matching_count) ?? 0,
    failures: num(raw.failures) ?? 0,
    lastCheckedAt: str(raw.last_checked_at) ?? null,
    nextCheckAt: str(raw.next_check_at) ?? null,
  };
}

function readItem(raw: unknown): WatchItem | null {
  if (!isRecord(raw) || typeof raw.title !== 'string') return null;
  return {
    title: raw.title,
    price: str(raw.price),
    currency: str(raw.currency),
    mileage: str(raw.mileage),
    year: str(raw.year),
    link: webUrl(raw.link),
    image: webUrl(raw.image),
    snippet: str(raw.snippet),
  };
}

const CHANGE_KINDS = ['new', 'gone', 'price_changed', 'updated', 'condition'] as const;

function readChange(raw: unknown): WatchChange | null {
  if (!isRecord(raw) || typeof raw.line !== 'string') return null;
  const kind = CHANGE_KINDS.find((k) => k === raw.kind) ?? 'new';
  return {
    id: num(raw.id) ?? 0,
    foundAt: str(raw.found_at) ?? '',
    line: raw.line,
    matched: raw.matched === true,
    kind,
  };
}

export function readWebWatchDetail(raw: unknown): WebWatchDetail | null {
  const watch = readWebWatch(raw);
  if (!watch || !isRecord(raw)) return null;
  const items = Array.isArray(raw.items) ? raw.items.map(readItem).filter((i): i is WatchItem => i !== null) : [];
  const changes = Array.isArray(raw.changes)
    ? raw.changes.map(readChange).filter((c): c is WatchChange => c !== null)
    : [];
  const active = raw.active === true || (!watch.paused && watch.failures < 3 && watch.lastCheckedAt !== null);
  const preview = isRecord(raw.preview) && typeof raw.preview.title === 'string'
    ? { title: raw.preview.title, snippet: str(raw.preview.snippet), link: webUrl(raw.preview.link) }
    : items[0]
      ? { title: items[0].title, snippet: items[0].snippet, link: items[0].link }
      : null;
  const initialThinking = str(raw.initial_thinking) ?? null;
  const thinkingHistory = Array.isArray(raw.thinking_history)
    ? raw.thinking_history
        .filter((t): t is Raw => isRecord(t) && typeof t.id === 'string' && typeof t.text === 'string')
        .map((t) => ({ id: String(t.id), text: String(t.text), createdAt: str(t.created_at) ?? '' }))
    : [];
  return { ...watch, active, preview, initialThinking, thinkingHistory, items, changes };
}

const SAVED_KINDS: SavedKind[] = ['recipe', 'listing', 'place', 'report', 'note'];

export function readSavedItem(raw: unknown): SavedItem | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.title !== 'string') return null;
  const kind = SAVED_KINDS.find((k) => k === raw.kind) ?? 'note';
  return {
    id: raw.id,
    kind,
    title: raw.title,
    body: typeof raw.body === 'string' ? raw.body : '',
    collection: str(raw.collection) ?? null,
    shared: raw.shared === true,
    mine: raw.mine !== false,
    sources: readSources(raw.sources),
    servings: str(raw.servings),
    time: str(raw.time),
    ingredients: strings(raw.ingredients),
    steps: strings(raw.steps),
    price: str(raw.price),
    currency: str(raw.currency),
    mileage: str(raw.mileage),
    year: str(raw.year),
    location: str(raw.location),
    address: str(raw.address),
    hours: str(raw.hours),
    link: webUrl(raw.link),
    photos: strings(raw.photos).filter((p) => /^https?:\/\//i.test(p)),
    updatedAt: str(raw.updated_at) ?? '',
  };
}

export function readCollection(raw: unknown): SavedCollection | null {
  if (!isRecord(raw) || typeof raw.name !== 'string') return null;
  return { name: raw.name, count: num(raw.count) ?? 0 };
}

/** A report picture's route: only the Pond's own, never another site's address. */
const REPORT_IMAGE_SRC = /^\/api\/v1\/report-images\/[0-9a-f]{16,64}$/;

export function readReportImage(raw: unknown): ReportImage | null {
  if (!isRecord(raw) || typeof raw.key !== 'string' || typeof raw.src !== 'string') return null;
  if (!REPORT_IMAGE_SRC.test(raw.src)) return null;
  return {
    key: raw.key,
    src: raw.src,
    credit: str(raw.credit) ?? '',
    caption: str(raw.caption),
    page: webUrl(raw.page),
  };
}

export function readReportOption(raw: unknown): ReportOption | null {
  if (!isRecord(raw) || typeof raw.title !== 'string') return null;
  const fields: [string, string][] = Array.isArray(raw.fields)
    ? raw.fields.flatMap((f) =>
        Array.isArray(f) && typeof f[0] === 'string' && typeof f[1] === 'string' ? [[f[0], f[1]] as [string, string]] : [],
      )
    : [];
  return {
    title: raw.title,
    price: str(raw.price),
    link: webUrl(raw.link),
    why: str(raw.why),
    fields,
    sources: readSources(raw.sources),
  };
}

export function readList<T>(raw: unknown, read: (item: unknown) => T | null): T[] {
  return Array.isArray(raw) ? raw.map(read).filter((x): x is T => x !== null) : [];
}

/** The site an address is on, for a source's card: `cars.example` for `https://www.cars.example/x`. */
export function siteOf(url: string): string {
  const host = url.replace(/^https?:\/\//i, '').split(/[/?#]/)[0] ?? '';
  return host.replace(/^www\./i, '');
}
