// The small readers every `/me/...` shape shares. A field of the wrong shape is read as missing,
// so a Pond a version ahead or behind the phone never crashes a screen.

export type Raw = Record<string, unknown>;

export function record(raw: unknown): Raw | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Raw) : null;
}

export function text(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

/** An id from a route's params: only the shape the Pond issues, never anything that could be a path. */
export function routeId(param: string | string[] | undefined): string {
  const id = Array.isArray(param) ? param[0] : param;
  return id && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : '';
}

/** A string with something in it, or null. */
export function textOrNull(raw: unknown): string | null {
  return text(raw) || null;
}

export function count(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : 0;
}

export function list(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

export function strings(raw: unknown): string[] {
  return list(raw).map(text).filter(Boolean);
}

/** One of `allowed`, else `fallback`: an enum the phone does not know reads as the safest value. */
export function oneOf<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((v) => v === raw) ?? fallback;
}

/** An RFC 3339 time the phone can parse, kept as the Pond wrote it, or null. */
export function time(raw: unknown): string | null {
  const s = text(raw);
  return s && !Number.isNaN(Date.parse(s)) ? s : null;
}

/** A picture the Pond serves: only its own API's paths, so a picture never reaches another host. */
export function pondPath(raw: unknown): string | null {
  const s = text(raw);
  return s.startsWith('/api/') && !s.startsWith('//') ? s : null;
}

/** A page a member may open in the browser: http(s) only. */
export function webUrl(raw: unknown): string | null {
  const s = text(raw);
  return /^https?:\/\/[^\s]+$/i.test(s) ? s : null;
}

/** The host a link goes to, without `www.`, for when the Pond names no site. */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export interface Money {
  amount: number;
  currency: string;
}

export function readMoney(raw: unknown): Money | null {
  const r = record(raw);
  const amount = r?.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  return { amount, currency: text(r?.currency) };
}

/** An amount as a household writes it, with its currency in front. */
export function formatMoney(money: Money, locale?: string): string {
  const amount = money.amount.toLocaleString(locale, { maximumFractionDigits: money.amount % 1 === 0 ? 0 : 2 });
  return money.currency ? `${money.currency} ${amount}` : amount;
}

/** A page Goose read, which a member can open. A reference with no address is not one. */
export interface SourceRef {
  title: string;
  url: string;
  site: string;
}

export function readSourceRef(raw: unknown): SourceRef | null {
  const r = record(raw);
  const url = webUrl(r?.url);
  if (!url) return null;
  return { title: text(r?.title) || siteOf(url) || url, url, site: text(r?.site) || siteOf(url) };
}

export function readSourceRefs(raw: unknown): SourceRef[] {
  return list(raw).flatMap((s) => {
    const ref = readSourceRef(s);
    return ref ? [ref] : [];
  });
}

/** Every element `read` keeps, from a list or from `{key: [...]}`. */
export function readAll<T>(raw: unknown, key: string, read: (item: unknown) => T | null): T[] {
  const items = Array.isArray(raw) ? raw : list(record(raw)?.[key]);
  return items.flatMap((item) => {
    const read1 = read(item);
    return read1 ? [read1] : [];
  });
}

/**
 * Words written to stand alone ("Send the slides"), set inside a sentence ("Did you send the
 * slides?"). A leading acronym or name in capitals ("MCP", "GTA") keeps its case.
 */
export function inSentence(words: string): string {
  const w = words.trim();
  if (w.length < 2 || /^[A-Z]{2}/.test(w)) return w;
  return w.charAt(0).toLowerCase() + w.slice(1);
}

/** A title cut where a comma starts the details, so it fits inside a sentence. */
export function headOf(title: string): string {
  const cut = title.indexOf(',');
  return cut >= 8 ? title.slice(0, cut).trim() : title.trim();
}
