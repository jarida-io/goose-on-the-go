/**
 * Sending the member's new screenshots, and new photos from the albums they chose, to the Pond on its
 * own (pond docs/architecture/my-goose-hub.md, part 6b).
 *
 * Each picture is shrunk as a hand-picked one is and sent once: its library id is remembered before
 * the next is tried, so a run cut short by the app going away sends nothing twice. A run stops when
 * the Pond holds as many as it will read (429), refuses (409: turned off, or an album no longer
 * chosen), or cannot be reached; what it did not reach is found again next time. The very first run
 * sends nothing and only marks the start, so a library's history never goes in one burst.
 */

import { ApiError } from './api-client';
import { canRead, type CaptureLibrary, type LibraryPicture } from './capture-library';
import type { CaptureWire } from './types';

/** The largest picture the Pond takes, as base64 characters. */
const MAX_IMAGE_CHARS = 2_000_000;
/** How many sent ids are remembered: far more than one look at the library returns. */
const KEEP_SENT = 500;

export interface SyncSettings {
  screenshots: boolean;
  albums: readonly string[];
}

export interface SyncState {
  /** Pictures taken after this (ms since the epoch) are looked at. */
  since: number;
  /** Library ids already sent, or found unreadable, newest last. */
  sent: string[];
}

export interface SyncDeps {
  library: CaptureLibrary;
  /** The picture as a JPEG in base64, or null when it cannot be read. */
  shrink: (picture: LibraryPicture) => Promise<string | null>;
  send: (body: CaptureWire) => Promise<number>;
  load: () => Promise<SyncState | null>;
  save: (state: SyncState) => Promise<void>;
  now: () => number;
}

export type SyncStop = 'done' | 'started' | 'full' | 'refused' | 'unreachable' | 'no_library' | 'no_access' | 'nothing_on';

export interface SyncOutcome {
  sent: number;
  stopped: SyncStop;
}

/** Pictures not yet sent, oldest first, once each even when a screenshot is also in a chosen album. */
export function toSend(found: readonly LibraryPicture[], sent: ReadonlySet<string>): LibraryPicture[] {
  const seen = new Set<string>();
  return [...found]
    .sort((a, b) => a.takenAt - b.takenAt)
    .filter((p) => {
      if (sent.has(p.id) || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
}

export async function syncCaptures(settings: SyncSettings, deps: SyncDeps): Promise<SyncOutcome> {
  if (!deps.library.available) return { sent: 0, stopped: 'no_library' };
  if (!settings.screenshots && settings.albums.length === 0) return { sent: 0, stopped: 'nothing_on' };
  // Never asks: access is asked for when the member turns sending on, in the app's own screen.
  if (!canRead(await deps.library.access())) return { sent: 0, stopped: 'no_access' };
  const known = await deps.load();
  if (!known) {
    await deps.save({ since: deps.now(), sent: [] });
    return { sent: 0, stopped: 'started' };
  }

  const sent = new Set(known.sent);
  // How far the run got, kept a millisecond short so a picture taken in the same instant as the last
  // one handled is still found; the sent ids keep that one from going twice.
  let reached = known.since;
  const handled = async (picture: LibraryPicture) => {
    sent.add(picture.id);
    reached = Math.max(reached, picture.takenAt - 1);
    await deps.save({ since: reached, sent: [...sent].slice(-KEEP_SENT) });
  };
  const screenshots = settings.screenshots ? await deps.library.screenshotsSince(known.since) : [];
  const photos = (await Promise.all(settings.albums.map((album) => deps.library.photosSince(album, known.since)))).flat();

  let count = 0;
  for (const picture of toSend([...screenshots, ...photos], sent)) {
    const file = await deps.library.fileUri(picture);
    const image = file ? await deps.shrink({ ...picture, uri: file }) : null;
    // One that cannot be read now will not be readable later: it is not tried again.
    if (!image || image.length > MAX_IMAGE_CHARS) {
      await handled(picture);
      continue;
    }
    try {
      await deps.send({
        image,
        mime_type: 'image/jpeg',
        kind: picture.kind,
        ...(picture.kind === 'photo' && picture.album ? { album: picture.album } : {}),
        taken_at: new Date(picture.takenAt).toISOString(),
      });
      count += 1;
      await handled(picture);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 429) return { sent: count, stopped: 'full' };
        if (e.status === 409) return { sent: count, stopped: 'refused' };
        // Too large, not a picture the Pond reads, or not one at all: sending it again changes nothing.
        if (e.status === 413 || e.status === 415 || e.status === 422) {
          await handled(picture);
          continue;
        }
      }
      return { sent: count, stopped: 'unreachable' };
    }
  }
  return { sent: count, stopped: 'done' };
}
