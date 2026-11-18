/**
 * Sending screenshots and album photos on their own: the first run only marks where to start, each
 * picture is sent once however many runs find it, a full Pond stops the run and the rest go later,
 * and a picture that cannot be read is not tried again.
 */

import { ApiError } from '@/services/api-client';
import type { CaptureLibrary, LibraryPicture } from '@/services/capture-library';
import { syncCaptures, toSend, type SyncDeps, type SyncState } from '@/services/capture-sync';
import type { CaptureWire } from '@/services/types';

jest.mock('@/services/pond-trust', () => ({ assertPondTrust: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/services/secure-random', () => ({ randomBytes: (n: number) => new Uint8Array(n).fill(7) }));

const shot = (id: string, takenAt: number, kind: 'screenshot' | 'photo' = 'screenshot', album: string | null = null): LibraryPicture => ({
  id,
  uri: `file:///lib/${id}.png`,
  width: 1080,
  height: 2400,
  takenAt,
  kind,
  album,
});

/** A library whose pictures arrive as the test says, read as the real one would be: by time. */
function library(pictures: LibraryPicture[]): CaptureLibrary & { pictures: LibraryPicture[] } {
  return {
    pictures,
    available: true,
    access: jest.fn(async () => 'granted' as const),
    allow: jest.fn(async () => 'granted' as const),
    albums: async () => ['Receipts'],
    screenshotsSince: async (since) => pictures.filter((p) => p.kind === 'screenshot' && p.takenAt > since),
    photosSince: async (album, since) => pictures.filter((p) => p.album === album && p.takenAt > since),
    // As iOS does: the listing's reference is not a file until it is asked for one.
    fileUri: async (p) => p.uri.replace('ph://', 'file:///resolved/'),
  };
}

function harness(pictures: LibraryPicture[], start: SyncState | null = { since: 0, sent: [] }) {
  let kept: SyncState | null = start;
  let clock = 1_000;
  const sent: CaptureWire[] = [];
  const lib = library(pictures);
  const deps: SyncDeps = {
    library: lib,
    shrink: jest.fn(async (p: LibraryPicture) => (p.id.startsWith('broken') ? null : `jpeg:${p.id}`)),
    send: jest.fn(async (body: CaptureWire) => {
      sent.push(body);
      return sent.length;
    }),
    load: async () => kept,
    save: async (state) => {
      kept = state;
    },
    now: () => clock,
  };
  return {
    deps,
    lib,
    sent,
    kept: () => kept,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

const on = { screenshots: true, albums: [] as string[] };

describe('syncCaptures', () => {
  it('sends nothing on the first run, only marks where to start', async () => {
    const h = harness([shot('s1', 500)], null);
    expect(await syncCaptures(on, h.deps)).toEqual({ sent: 0, stopped: 'started' });
    expect(h.sent).toEqual([]);
    expect(h.kept()).toEqual({ since: 1_000, sent: [] });
  });

  it('sends each new screenshot once, however many runs find it', async () => {
    const h = harness([shot('s1', 100), shot('s2', 200)]);
    expect(await syncCaptures(on, h.deps)).toEqual({ sent: 2, stopped: 'done' });
    // A run that finds the same pictures again, as one cut short before saving `since` would.
    h.kept()!.since = 0;
    expect(await syncCaptures(on, h.deps)).toEqual({ sent: 0, stopped: 'done' });
    expect(h.sent.map((b) => b.image)).toEqual(['jpeg:s1', 'jpeg:s2']);
    expect(h.sent[0]).toMatchObject({ kind: 'screenshot', mime_type: 'image/jpeg', taken_at: new Date(100).toISOString() });
    expect(h.sent[0]).not.toHaveProperty('album');
  });

  it('stops when the Pond is full, and sends the rest next time without repeating any', async () => {
    const h = harness([shot('s1', 100), shot('s2', 200), shot('s3', 300)]);
    (h.deps.send as jest.Mock).mockImplementationOnce(async (body: CaptureWire) => {
      h.sent.push(body);
      return 1;
    });
    (h.deps.send as jest.Mock).mockImplementationOnce(async () => {
      throw new ApiError('POST → 429', 429, null);
    });
    expect(await syncCaptures(on, h.deps)).toEqual({ sent: 1, stopped: 'full' });
    expect(h.kept()).toEqual({ since: 99, sent: ['s1'] });

    h.tick(60_000);
    expect(await syncCaptures(on, h.deps)).toEqual({ sent: 2, stopped: 'done' });
    expect(h.sent.map((b) => b.image)).toEqual(['jpeg:s1', 'jpeg:s2', 'jpeg:s3']);
  });

  it('sends a photo from a chosen album with its album, and a screenshot also in that album once', async () => {
    const both = shot('s1', 100, 'screenshot', null);
    const h = harness([both, { ...both, kind: 'photo', album: 'Receipts' }, shot('p1', 150, 'photo', 'Receipts'), shot('p2', 160, 'photo', 'Holiday')]);
    await syncCaptures({ screenshots: true, albums: ['Receipts'] }, h.deps);
    expect(h.sent.map((b) => [b.image, b.kind, b.album])).toEqual([
      ['jpeg:s1', 'screenshot', undefined],
      ['jpeg:p1', 'photo', 'Receipts'],
    ]);
  });

  it('does not try again a picture it could not read, or one the Pond would never take', async () => {
    const h = harness([shot('broken1', 100), shot('s2', 200)]);
    (h.deps.send as jest.Mock).mockImplementationOnce(async () => {
      throw new ApiError('POST → 415', 415, null);
    });
    await syncCaptures(on, h.deps);
    h.kept()!.since = 0;
    await syncCaptures(on, h.deps);
    expect(h.deps.shrink).toHaveBeenCalledTimes(2);
    expect(h.kept()!.sent).toEqual(['broken1', 's2']);
  });

  it('stops without marking anything when the Pond is off or out of reach', async () => {
    const h = harness([shot('s1', 100)]);
    (h.deps.send as jest.Mock).mockRejectedValueOnce(new ApiError('POST → 409', 409, null));
    expect((await syncCaptures(on, h.deps)).stopped).toBe('refused');
    (h.deps.send as jest.Mock).mockRejectedValueOnce(new TypeError('Network request failed'));
    expect((await syncCaptures(on, h.deps)).stopped).toBe('unreachable');
    expect(h.kept()).toEqual({ since: 0, sent: [] });
  });

  it('does nothing without a library, or with nothing switched on', async () => {
    const h = harness([shot('s1', 100)]);
    expect(await syncCaptures(on, { ...h.deps, library: { ...h.lib, available: false } })).toEqual({ sent: 0, stopped: 'no_library' });
    expect(await syncCaptures({ screenshots: false, albums: [] }, h.deps)).toEqual({ sent: 0, stopped: 'nothing_on' });
    expect(h.sent).toEqual([]);
  });

  it('never asks for the photos itself, and sends nothing until the phone allows them', async () => {
    const h = harness([shot('s1', 100)], null);
    (h.lib.access as jest.Mock).mockResolvedValue('undetermined');
    expect(await syncCaptures(on, h.deps)).toEqual({ sent: 0, stopped: 'no_access' });
    expect(h.lib.allow).not.toHaveBeenCalled();
    // The start is marked only once the library can be read, so nothing taken before is sent.
    expect(h.kept()).toBeNull();
    (h.lib.access as jest.Mock).mockResolvedValue('limited');
    expect((await syncCaptures(on, h.deps)).stopped).toBe('started');
  });

  it('shrinks the file the library resolves, never its reference', async () => {
    const h = harness([{ ...shot('s1', 100), uri: 'ph://s1' }]);
    await syncCaptures(on, h.deps);
    expect(h.deps.shrink).toHaveBeenCalledWith(expect.objectContaining({ id: 's1', uri: 'file:///resolved/s1' }));
  });

  it('finds a picture taken in the same instant as the last one sent', async () => {
    const h = harness([shot('s1', 100), shot('s2', 100)]);
    (h.deps.send as jest.Mock).mockImplementationOnce(async (body: CaptureWire) => {
      h.sent.push(body);
      return 1;
    });
    (h.deps.send as jest.Mock).mockRejectedValueOnce(new ApiError('POST → 429', 429, null));
    await syncCaptures(on, h.deps);
    await syncCaptures(on, h.deps);
    expect(h.sent.map((b) => b.image)).toEqual(['jpeg:s1', 'jpeg:s2']);
  });
});

describe('toSend', () => {
  it('orders oldest first and leaves out what was sent', () => {
    expect(toSend([shot('b', 2), shot('a', 1), shot('c', 3)], new Set(['c'])).map((p) => p.id)).toEqual(['a', 'b']);
  });
});
