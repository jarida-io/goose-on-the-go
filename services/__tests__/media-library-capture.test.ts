/**
 * The photo library through expo-media-library, with the module mocked: screenshots by subtype on
 * iOS and by album on Android, photos from a chosen album, pages read oldest first, iOS references
 * turned into files, and access asked for only when it still may be.
 */

import { captureLibrary, installCaptureLibrary, NO_LIBRARY } from '@/services/capture-library';
import { installMediaLibraryCapture, mediaLibraryReader } from '@/services/media-library-capture';

jest.mock('expo-media-library/legacy', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getAssetsAsync: jest.fn(),
  getAssetInfoAsync: jest.fn(),
  getAlbumAsync: jest.fn(),
  getAlbumsAsync: jest.fn(),
}));

type Lib = typeof import('expo-media-library/legacy');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lib = jest.mocked(require('expo-media-library/legacy') as Lib);

const asset = (id: string, creationTime: number, uri = `ph://${id}`) => ({
  id,
  filename: `${id}.png`,
  uri,
  mediaType: 'photo' as const,
  width: 1170,
  height: 2532,
  creationTime,
  modificationTime: creationTime,
  duration: 0,
});

const page = (assets: ReturnType<typeof asset>[], hasNextPage = false, endCursor = '') => ({ assets, hasNextPage, endCursor, totalCount: assets.length });
const permission = (over: Record<string, unknown>) => ({ status: 'granted', granted: true, canAskAgain: true, expires: 'never', ...over }) as never;

beforeEach(() => {
  jest.resetAllMocks();
  installCaptureLibrary(NO_LIBRARY);
});

describe('screenshots', () => {
  it('reads the screenshot subtype on iOS, photos only, oldest first, after the time given, page by page', async () => {
    lib.getAssetsAsync.mockResolvedValueOnce(page([asset('a', 10)], true, 'cursor-1')).mockResolvedValueOnce(page([asset('b', 20)]));
    const shots = await mediaLibraryReader(lib, 'ios').screenshotsSince(5);
    expect(lib.getAssetsAsync).toHaveBeenNthCalledWith(1, { mediaSubtypes: ['screenshot'], createdAfter: 5, mediaType: 'photo', sortBy: [['creationTime', true]], first: 50 });
    expect(lib.getAssetsAsync).toHaveBeenNthCalledWith(2, expect.objectContaining({ after: 'cursor-1' }));
    expect(shots).toEqual([
      { id: 'a', uri: 'ph://a', width: 1170, height: 2532, takenAt: 10, kind: 'screenshot', album: null },
      { id: 'b', uri: 'ph://b', width: 1170, height: 2532, takenAt: 20, kind: 'screenshot', album: null },
    ]);
    expect(lib.getAlbumAsync).not.toHaveBeenCalled();
  });

  it('reads the Screenshots album on Android, the singular when that is the name, and nothing without one', async () => {
    const album = { id: 'alb-1', title: 'Screenshot', assetCount: 1, startTime: 0, endTime: 0 };
    lib.getAlbumAsync.mockImplementation(async (title: string) => (title === 'Screenshot' ? album : (null as never)));
    lib.getAssetsAsync.mockResolvedValue(page([asset('c', 30, 'file:///storage/emulated/0/Pictures/Screenshot/c.png')]));
    const reader = mediaLibraryReader(lib, 'android');
    const shots = await reader.screenshotsSince(0);
    expect(lib.getAssetsAsync).toHaveBeenCalledWith(expect.objectContaining({ album, createdAfter: 0, mediaType: 'photo' }));
    expect(lib.getAssetsAsync.mock.calls[0][0]).not.toHaveProperty('mediaSubtypes');
    expect(shots[0]).toMatchObject({ id: 'c', kind: 'screenshot' });

    lib.getAlbumAsync.mockResolvedValue(null as never);
    lib.getAssetsAsync.mockClear();
    expect(await reader.screenshotsSince(0)).toEqual([]);
    expect(lib.getAssetsAsync).not.toHaveBeenCalled();
  });
});

describe('album photos and files', () => {
  it('reads a chosen album’s photos with the album named on each', async () => {
    const album = { id: 'alb-2', title: 'Receipts', assetCount: 1, startTime: 0, endTime: 0 };
    lib.getAlbumAsync.mockResolvedValue(album);
    lib.getAssetsAsync.mockResolvedValue(page([asset('r', 40)]));
    expect(await mediaLibraryReader(lib, 'ios').photosSince('Receipts', 7)).toEqual([
      { id: 'r', uri: 'ph://r', width: 1170, height: 2532, takenAt: 40, kind: 'photo', album: 'Receipts' },
    ]);
    expect(lib.getAssetsAsync).toHaveBeenCalledWith(expect.objectContaining({ album, createdAfter: 7 }));
  });

  it('turns an iOS reference into its file, and keeps an Android file as it is', async () => {
    lib.getAssetInfoAsync.mockResolvedValue({ ...asset('a', 10), localUri: 'file:///var/mobile/a.png' });
    const picture = { id: 'a', uri: 'ph://a', width: 1, height: 1, takenAt: 10, kind: 'screenshot' as const, album: null };
    expect(await mediaLibraryReader(lib, 'ios').fileUri(picture)).toBe('file:///var/mobile/a.png');
    expect(lib.getAssetInfoAsync).toHaveBeenCalledWith('a');
    lib.getAssetInfoAsync.mockResolvedValue(asset('a', 10));
    expect(await mediaLibraryReader(lib, 'ios').fileUri(picture)).toBeNull();
    expect(await mediaLibraryReader(lib, 'android').fileUri({ ...picture, uri: 'file:///sdcard/a.png' })).toBe('file:///sdcard/a.png');
  });

  it('lists album names once each, in order', async () => {
    lib.getAlbumsAsync.mockResolvedValue([
      { id: '1', title: 'Receipts', assetCount: 1, startTime: 0, endTime: 0 },
      { id: '2', title: ' Holiday ', assetCount: 1, startTime: 0, endTime: 0 },
      { id: '3', title: 'Receipts', assetCount: 1, startTime: 0, endTime: 0 },
    ]);
    expect(await mediaLibraryReader(lib, 'ios').albums()).toEqual(['Holiday', 'Receipts']);
  });
});

describe('access', () => {
  it('reads access for photos alone, without asking', async () => {
    lib.getPermissionsAsync.mockResolvedValue(permission({ accessPrivileges: 'limited' }));
    expect(await mediaLibraryReader(lib, 'ios').access()).toBe('limited');
    expect(lib.getPermissionsAsync).toHaveBeenCalledWith(false, ['photo']);
    expect(lib.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('asks only when the phone still may, and says when it was refused', async () => {
    lib.getPermissionsAsync.mockResolvedValue(permission({ status: 'undetermined', granted: false }));
    lib.requestPermissionsAsync.mockResolvedValue(permission({ status: 'denied', granted: false, canAskAgain: false }));
    const reader = mediaLibraryReader(lib, 'android');
    expect(await reader.allow()).toBe('denied');
    expect(lib.requestPermissionsAsync).toHaveBeenCalledWith(false, ['photo']);

    lib.requestPermissionsAsync.mockClear();
    lib.getPermissionsAsync.mockResolvedValue(permission({ status: 'denied', granted: false, canAskAgain: false }));
    expect(await reader.allow()).toBe('denied');
    expect(lib.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('installing', () => {
  it('installs the reader at startup and asks nothing', () => {
    installMediaLibraryCapture();
    expect(captureLibrary().available).toBe(true);
    expect(lib.getPermissionsAsync).not.toHaveBeenCalled();
    expect(lib.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});
