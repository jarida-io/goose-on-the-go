// Screenshots and photos sent to Goose: the member's settings, what the Pond read from each, and how
// many wait (pond docs/architecture/my-goose-hub.md, part 6b). A picture that shows money is never
// listed; the Budget specialist reads it.

import { count, list, readAll, record, strings, text, textOrNull, time } from './me-read';

export type CaptureKind = 'screenshot' | 'photo';

export interface CaptureSettings {
  /** On until the member turns it off. */
  screenshots: boolean;
  /** The albums whose new photos are sent. */
  albums: string[];
}

export interface Capture {
  id: string;
  kind: CaptureKind;
  album: string | null;
  takenAt: string | null;
  description: string | null;
  intent: string | null;
  details: { names: string[]; dates: string[]; places: string[]; prices: string[]; links: string[] };
  hasPicture: boolean;
  /** The Pond's path for the picture while it still holds it, which only its member can read. */
  picture: string | null;
  createdAt: string | null;
}

export interface Captures {
  settings: CaptureSettings;
  /** Whether this Pond's model can read pictures. */
  available: boolean;
  pending: number;
  captures: Capture[];
}

/** How many may wait at the Pond before it answers 429. */
export const MAX_PENDING_CAPTURES = 30;
/** The Pond's own caps on the album list. */
export const MAX_ALBUMS = 20;
export const MAX_ALBUM_CHARS = 60;

export const EMPTY_CAPTURES: Captures = { settings: { screenshots: true, albums: [] }, available: false, pending: 0, captures: [] };

export function readCaptureSettings(raw: unknown): CaptureSettings {
  const r = record(raw);
  // Screenshots are on unless the Pond says otherwise.
  return { screenshots: r?.screenshots !== false, albums: strings(r?.albums) };
}

export function readCapture(raw: unknown): Capture | null {
  const r = record(raw);
  const id = text(r?.id);
  if (!r || !id) return null;
  const d = record(r.details);
  return {
    id,
    kind: r.kind === 'photo' ? 'photo' : 'screenshot',
    album: textOrNull(r.album),
    takenAt: time(r.taken_at),
    description: textOrNull(r.description),
    intent: textOrNull(r.intent),
    details: { names: strings(d?.names), dates: strings(d?.dates), places: strings(d?.places), prices: strings(d?.prices), links: strings(d?.links) },
    hasPicture: r.has_picture === true,
    picture: r.has_picture === true && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? `/api/v1/me/captures/${id}/picture` : null,
    createdAt: time(r.created_at),
  };
}

export function readCaptures(raw: unknown): Captures {
  const r = record(raw);
  return {
    settings: readCaptureSettings(r?.settings),
    available: r?.available === true,
    pending: count(r?.pending),
    captures: readAll(list(r?.captures), 'captures', readCapture),
  };
}

/** An album list the Pond will take: trimmed, once each, within its caps. */
export function cleanAlbums(albums: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of albums) {
    const name = raw.trim().slice(0, MAX_ALBUM_CHARS);
    if (name && !out.includes(name)) out.push(name);
  }
  return out.slice(0, MAX_ALBUMS);
}
