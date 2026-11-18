/**
 * The photo library, as the automatic sending of screenshots and album photos reads it.
 *
 * Until a reader is installed the library is the empty one: nothing is found, and pictures go to
 * Goose only when the member sends them by hand. `services/media-library-capture.ts` installs the
 * real one at startup in a build that carries `expo-media-library`.
 */

export interface LibraryPicture {
  /** The library's own id: what is remembered so nothing is sent twice. */
  id: string;
  /** Where the library keeps it; on iOS a `ph://` reference that `fileUri` turns into a file. */
  uri: string;
  width: number;
  height: number;
  /** When it was taken, in milliseconds since the epoch. */
  takenAt: number;
  kind: 'screenshot' | 'photo';
  album: string | null;
}

/** What the phone lets the app read: `limited` is iOS's selected photos only, which still reads. */
export type LibraryAccess = 'granted' | 'limited' | 'denied' | 'undetermined';

export interface CaptureLibrary {
  /** Whether this build can look through the library at all. */
  readonly available: boolean;
  /** What the phone allows now, without asking. */
  access(): Promise<LibraryAccess>;
  /** Asks the system for library access when it still may; resolves with what it allows after. */
  allow(): Promise<LibraryAccess>;
  /** The member's album names, to choose from. */
  albums(): Promise<string[]>;
  /** Screenshots taken after `since`, oldest first. */
  screenshotsSince(since: number): Promise<LibraryPicture[]>;
  /** Photos in `album` taken after `since`, oldest first. */
  photosSince(album: string, since: number): Promise<LibraryPicture[]>;
  /** A file the picture can be read from, or null when there is none. */
  fileUri(picture: LibraryPicture): Promise<string | null>;
}

/** Whether `access` lets the library be read. */
export function canRead(access: LibraryAccess): boolean {
  return access === 'granted' || access === 'limited';
}

export const NO_LIBRARY: CaptureLibrary = {
  available: false,
  access: async () => 'denied',
  allow: async () => 'denied',
  albums: async () => [],
  screenshotsSince: async () => [],
  photosSince: async () => [],
  fileUri: async () => null,
};

let installed: CaptureLibrary = NO_LIBRARY;

export function captureLibrary(): CaptureLibrary {
  return installed;
}

/** Called once at startup with the media-library reader, and by tests. */
export function installCaptureLibrary(library: CaptureLibrary): void {
  installed = library;
}
