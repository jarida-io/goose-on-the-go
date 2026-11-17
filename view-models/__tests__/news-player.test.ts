// The news read aloud on the phone: one brief at a time, owned by the app rather than a screen, so
// it keeps playing until the member stops it or it plays out; pause and resume follow the phone's own
// media controls as well as the app's buttons; and a conversation taking the speaker pauses it.

import { showSnackbar } from '@/services/snackbar';
import { cacheFile, discardFile, newsAudio, whenVoiceTakesOver } from '@/services/voice-io';

import { listenTo, pauseListening, resumeListening, stopListening, useListening } from '../news-player';

jest.mock('@/services/snackbar', () => ({ showSnackbar: jest.fn() }));
jest.mock('../describe-error', () => ({ logFailure: jest.fn() }));
jest.mock('@/services/voice-io', () => ({
  cacheFile: jest.fn(() => 'file://digest'),
  discardFile: jest.fn(),
  newsAudio: jest.fn(),
  whenVoiceTakesOver: jest.fn(),
}));

// The player module registers its pause with voice once, when it loads.
const voiceTakesOver = jest.mocked(whenVoiceTakesOver).mock.calls[0][0];
const audio = jest.mocked(newsAudio!);
const bytes = jest.fn(async () => new ArrayBuffer(4));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

type Meta = Parameters<NonNullable<typeof newsAudio>>[1];
let meta: Meta;
const player = { pause: jest.fn(), play: jest.fn(), release: jest.fn() };

// useListening is useSyncExternalStore over the module's own getter; reading it straight keeps the
// test free of a renderer.
jest.mock('react', () => ({ ...jest.requireActual('react'), useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get() }));

const useNow = () => {
  const seen = useListening();
  return seen ? `${seen.state}:${seen.path}` : null;
};

beforeEach(() => {
  stopListening();
  jest.clearAllMocks();
  audio.mockImplementation((_uri, m) => {
    meta = m;
    return player;
  });
});

it('plays a brief and keeps it after the screen that started it is gone', async () => {
  await listenTo('/digests/1/audio', 'Morning news', bytes);
  expect(useNow()).toBe('playing:/digests/1/audio');
  expect(audio).toHaveBeenCalledWith('file://digest', expect.objectContaining({ title: 'Morning news' }));
  // Nothing here unmounts it: only a stop, or the end of the audio, ends it.
  meta.onEnd();
  await flush();
  expect(useNow()).toBeNull();
  expect(player.release).toHaveBeenCalled();
  expect(discardFile).toHaveBeenCalledWith('file://digest');
});

it('pauses and resumes from the app, and follows the lock screen controls', async () => {
  await listenTo('/digests/1/audio', 'Morning news', bytes);
  pauseListening();
  expect(player.pause).toHaveBeenCalled();
  expect(useNow()).toBe('paused:/digests/1/audio');
  resumeListening();
  expect(player.play).toHaveBeenCalled();
  expect(useNow()).toBe('playing:/digests/1/audio');
  meta.onPlaying(false);
  expect(useNow()).toBe('paused:/digests/1/audio');
});

it('pauses when a conversation takes the speaker', async () => {
  await listenTo('/digests/1/audio', 'Morning news', bytes);
  voiceTakesOver();
  expect(useNow()).toBe('paused:/digests/1/audio');
});

it('starting another brief ends the first, and the same one twice does not restart it', async () => {
  await listenTo('/digests/1/audio', 'One', bytes);
  await listenTo('/digests/1/audio', 'One', bytes);
  expect(audio).toHaveBeenCalledTimes(1);
  await listenTo('/digests/2/audio', 'Two', bytes);
  expect(player.release).toHaveBeenCalledTimes(1);
  expect(useNow()).toBe('playing:/digests/2/audio');
});

it('says so when the Pond cannot read it, and leaves nothing playing', async () => {
  await listenTo('/digests/3/audio', 'Three', async () => {
    throw new Error('503');
  });
  expect(useNow()).toBeNull();
  expect(showSnackbar).toHaveBeenCalledWith(expect.objectContaining({ tone: 'danger' }));
  expect(cacheFile).not.toHaveBeenCalled();
});
