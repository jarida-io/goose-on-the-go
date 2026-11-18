/**
 * The photo library read through `expo-media-library`, for sending screenshots and photos from the
 * chosen albums on their own.
 *
 * Screenshots are the `screenshot` subtype on iOS and the Screenshots album on Android, which has no
 * subtype. Only photos are read, oldest first, after the time the sync last reached. iOS hands back a
 * `ph://` reference, which `fileUri` turns into a file before the picture is shrunk; Android's
 * assets are files already. Access is asked for only by `allow`, which the screens call when the
 * member turns sending on or chooses albums, never at launch.
 *
 * The functions are the module's `legacy` entry: its default entry is the newer object API, where
 * these throw.
 */

import { Platform } from 'react-native';

import { installCaptureLibrary, type CaptureLibrary, type LibraryAccess, type LibraryPicture } from './capture-library';

type MediaLibrary = typeof import('expo-media-library/legacy');
type Asset = Awaited<ReturnType<MediaLibrary['getAssetsAsync']>>['assets'][number];
type Permission = Awaited<ReturnType<MediaLibrary['getPermissionsAsync']>>;

/** Pictures read in one page, and at most in one look: the Pond holds thirty waiting at a time. */
const PAGE = 50;
const MOST = 100;
/** Android files screenshots in an album; some makers name it in the singular. */
const SCREENSHOT_ALBUMS = ['Screenshots', 'Screenshot'];

function accessOf(permission: Permission): LibraryAccess {
  if (permission.granted) return permission.accessPrivileges === 'limited' ? 'limited' : 'granted';
  return permission.status === 'undetermined' ? 'undetermined' : 'denied';
}

export function mediaLibraryReader(lib: MediaLibrary, os: string = Platform.OS): CaptureLibrary {
  // Android 13 and newer ask for photos alone; older Android and iOS ignore the list.
  const photosOnly: ('photo' | 'video' | 'audio')[] = ['photo'];

  const read = async (options: Parameters<MediaLibrary['getAssetsAsync']>[0], kind: LibraryPicture['kind'], album: string | null): Promise<LibraryPicture[]> => {
    const out: LibraryPicture[] = [];
    let after: string | undefined;
    for (;;) {
      const page = await lib.getAssetsAsync({ ...options, mediaType: 'photo', sortBy: [['creationTime', true]], first: PAGE, ...(after ? { after } : {}) });
      for (const asset of page.assets) out.push(pictureOf(asset, kind, album));
      if (!page.hasNextPage || out.length >= MOST || !page.endCursor) break;
      after = page.endCursor;
    }
    return out.slice(0, MOST);
  };

  const albumNamed = async (title: string) => {
    try {
      return (await lib.getAlbumAsync(title)) ?? null;
    } catch {
      return null;
    }
  };

  return {
    available: true,
    access: async () => accessOf(await lib.getPermissionsAsync(false, photosOnly)),
    allow: async () => {
      const now = await lib.getPermissionsAsync(false, photosOnly);
      if (now.granted || !now.canAskAgain) return accessOf(now);
      return accessOf(await lib.requestPermissionsAsync(false, photosOnly));
    },
    albums: async () => {
      const titles = (await lib.getAlbumsAsync()).map((a) => a.title.trim()).filter(Boolean);
      return [...new Set(titles)].sort((a, b) => a.localeCompare(b));
    },
    screenshotsSince: async (since) => {
      if (os === 'ios') return read({ mediaSubtypes: ['screenshot'], createdAfter: since }, 'screenshot', null);
      for (const title of SCREENSHOT_ALBUMS) {
        const album = await albumNamed(title);
        if (album) return read({ album, createdAfter: since }, 'screenshot', null);
      }
      return [];
    },
    photosSince: async (title, since) => {
      const album = await albumNamed(title);
      return album ? read({ album, createdAfter: since }, 'photo', title) : [];
    },
    fileUri: async (picture) => {
      if (os !== 'ios') return picture.uri || null;
      const info = await lib.getAssetInfoAsync(picture.id);
      return info.localUri ?? null;
    },
  };
}

export function pictureOf(asset: Asset, kind: LibraryPicture['kind'], album: string | null): LibraryPicture {
  return { id: asset.id, uri: asset.uri, width: asset.width, height: asset.height, takenAt: asset.creationTime, kind, album };
}

/**
 * Installs the reader, once, at startup. A development client built before the module was added
 * has no native half; it keeps the empty library, and sending stays by hand, rather than failing
 * the launch.
 */
export function installMediaLibraryCapture(): void {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lib = require('expo-media-library/legacy') as MediaLibrary;
    installCaptureLibrary(mediaLibraryReader(lib));
  } catch (e) {
    console.warn('[captures] expo-media-library is not in this build: pictures are sent by hand', { kind: 'capture_library', error: String(e) });
  }
}
