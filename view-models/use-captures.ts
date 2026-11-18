// Pictures sent to Goose: screenshots on by default, photos from the albums the member chooses, a
// picture shared by hand, and what the Pond read from each (pond docs/architecture/my-goose-hub.md,
// part 6b). No picture outlives its sending on the phone.

import { useCallback, useEffect, useRef, useState } from 'react';

import { cleanAlbums, EMPTY_CAPTURES, MAX_PENDING_CAPTURES, type Capture, type Captures } from '@/models/captures';
import { SHOT_MAX_CHARS } from '@/models/screenshots';
import type { ConfirmFn } from '@/providers/confirm-provider';
import { ApiError, api } from '@/services/api-client';
import { canRead, captureLibrary, type LibraryAccess } from '@/services/capture-library';
import { confirm } from '@/services/haptics';
import i18n from '@/services/i18n';
import { showSnackbar } from '@/services/snackbar';
import { describeApiError, logFailure } from './describe-error';
import { hubAction, useHubRead } from './hub-read';
import { useLive } from './use-live';
import { pickShots, shrinkShot, ShotPickError, type PickedShot } from './use-screenshots';

export const CAPTURES_MS = 5 * 60_000;
/** While pictures wait to be read, a look every few seconds for what the Pond wrote. */
export const CAPTURES_WAITING_MS = 5_000;

// eslint-disable-next-line i18next/no-literal-string -- a media type, not copy
const JPEG = 'image/jpeg';

export function useCaptures(enabled = true) {
  const read = useHubRead<Captures>('captures', () => api.captures(), EMPTY_CAPTURES, CAPTURES_MS, enabled);
  const { data, setData, reload } = read;
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [albumChoices, setAlbumChoices] = useState<string[] | null>(null);
  const latest = useRef(data);
  const choosing = useRef(false);
  useEffect(() => {
    latest.current = data;
  });
  const library = captureLibrary();
  /** What the phone lets Goose read; null until asked of the phone, never of the member. */
  const [access, setAccess] = useState<LibraryAccess | null>(null);

  // Looked up, not asked: the system's question waits until the member turns sending on.
  useEffect(() => {
    if (!library.available) return;
    let live = true;
    void library
      .access()
      .then((a) => live && setAccess(a))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [library]);

  useLive(reload, CAPTURES_WAITING_MS, enabled && data.pending > 0);

  /** Asks the system when it may; a refusal leaves the member's choice on the Pond, and the screen says what to change. */
  const askAccess = useCallback(async () => {
    if (!library.available) return;
    try {
      setAccess(await library.allow());
    } catch (e) {
      logFailure('captures', 'access failed', e);
    }
  }, [library]);

  const setScreenshots = useCallback(
    async (on: boolean) => {
      const before = latest.current.settings;
      setData((d) => ({ ...d, settings: { ...d.settings, screenshots: on } }));
      if (on) await askAccess();
      const done = await hubAction('captures', () => api.setCaptureSettings({ screenshots: on }));
      setData((d) => ({ ...d, settings: done ?? before }));
      if (done) showSnackbar({ message: i18n.t(on ? 'goose.captures.screenshotsOn' : 'goose.captures.screenshotsOff'), tone: 'success' });
      return done !== null;
    },
    [askAccess, setData],
  );

  const setAlbums = useCallback(
    async (albums: string[]) => {
      const before = latest.current.settings;
      const next = cleanAlbums(albums);
      setData((d) => ({ ...d, settings: { ...d.settings, albums: next } }));
      if (next.length > before.albums.length) await askAccess();
      const done = await hubAction('captures', () => api.setCaptureSettings({ albums: next }));
      setData((d) => ({ ...d, settings: done ?? before }));
      return done !== null;
    },
    [askAccess, setData],
  );

  /** The member's albums to choose from: asking for access is part of choosing them. */
  const loadAlbums = useCallback(async () => {
    if (!library.available) {
      setAlbumChoices([]);
      return;
    }
    try {
      const allowed = await library.allow();
      setAccess(allowed);
      setAlbumChoices(canRead(allowed) ? await library.albums() : []);
    } catch (e) {
      logFailure('captures', 'albums failed', e);
      setAlbumChoices([]);
    }
  }, [library]);

  /** "Send a picture": the system picker, then each picture shrunk and sent until the Pond is full. */
  const sendPicture = useCallback(async () => {
    if (choosing.current) return;
    const room = Math.max(0, MAX_PENDING_CAPTURES - latest.current.pending);
    if (room === 0) {
      showSnackbar({ message: i18n.t('goose.captures.full'), tone: 'danger' });
      return;
    }
    choosing.current = true;
    setSending(true);
    let picked: PickedShot[] = [];
    let count = 0;
    let problem: string | null = null;
    try {
      picked = await pickShots(Math.min(room, 10));
      for (const shot of picked) {
        const image = await shrinkShot(shot);
        if (!image || image.length > SHOT_MAX_CHARS) {
          problem = i18n.t(image ? 'goose.shots.tooLarge' : 'goose.shots.unreadable');
          continue;
        }
        try {
          const waiting = await api.sendCapture({ image, mime_type: JPEG, kind: 'photo' });
          count += 1;
          setData((d) => ({ ...d, pending: waiting > 0 ? waiting : d.pending + 1 }));
        } catch (e) {
          logFailure('captures', 'send failed', e);
          if (e instanceof ApiError && e.status === 429) {
            problem = i18n.t('goose.captures.full');
            break;
          }
          problem = describeApiError(e) ?? i18n.t('goose.errors.action');
          if (!(e instanceof ApiError) || e.status === 409) break;
        }
      }
    } catch (e) {
      logFailure('captures', 'choose failed', e);
      problem = e instanceof ShotPickError ? i18n.t(e.key) : i18n.t('goose.errors.action');
    } finally {
      choosing.current = false;
      setSending(false);
    }
    if (count > 0) {
      void confirm();
      showSnackbar({ message: i18n.t('goose.captures.sent', { count }), tone: 'success' });
    }
    if (problem) showSnackbar({ message: problem, tone: 'danger' });
  }, [setData]);

  const remove = useCallback(
    async (capture: Capture) => {
      setData((d) => ({ ...d, captures: d.captures.filter((c) => c.id !== capture.id) }));
      const done = await hubAction('captures', () => api.deleteCapture(capture.id).then(() => true));
      if (!done) void reload();
      return done !== null;
    },
    [reload, setData],
  );

  const removeAll = useCallback(
    async (ask: ConfirmFn) => {
      const yes = await ask({
        title: i18n.t('goose.captures.deleteAllTitle'),
        message: i18n.t('goose.captures.deleteAllBody'),
        confirmLabel: i18n.t('goose.captures.deleteAll'),
        destructive: true,
      });
      if (!yes) return false;
      setClearing(true);
      const done = await hubAction('captures', () => api.deleteAllCaptures().then(() => true));
      setClearing(false);
      if (!done) return false;
      setData((d) => ({ ...d, captures: [], pending: 0 }));
      showSnackbar({ message: i18n.t('goose.captures.deletedAll'), tone: 'success' });
      return true;
    },
    [setData],
  );

  return {
    ...read,
    sending,
    clearing,
    /** Whether this build can send pictures on its own, without the member picking them. */
    automatic: library.available,
    /** Sending is on at the Pond but the phone refuses Goose its photos: the screen says what to change. */
    blocked: library.available && access === 'denied' && (data.settings.screenshots || data.settings.albums.length > 0),
    /** Screenshots are on as shipped, but the phone has not been asked yet: the member's tap asks. */
    needsAccess: library.available && access === 'undetermined' && (data.settings.screenshots || data.settings.albums.length > 0),
    /** iOS lets Goose read only the photos the member selected. */
    limited: access === 'limited',
    albumChoices,
    actions: { reload, setScreenshots, setAlbums, loadAlbums, sendPicture, remove, removeAll, askAccess },
  };
}

export type UseCaptures = ReturnType<typeof useCaptures>;
