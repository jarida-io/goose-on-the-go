/**
 * The microphone and the speaker, for voice mode.
 *
 * `expo-audio` is loaded lazily, like the pickers in `media.ts`: a development
 * build made before it was added has no native half, and a top-level import
 * would take the whole app down at launch rather than just voice mode. When it
 * is missing, `voiceSupported()` says so and the hook below records nothing.
 *
 * Capture is a PCM stream rather than a recording. The Pond transcribes WAV
 * only, Android's recorder cannot write one, and a stream hands over the
 * samples as they arrive — which is also what the orb and the end-of-speech
 * detector need. `speech.ts` does the arithmetic.
 */

import { useCallback, useEffect, useRef } from 'react';
import { File, Paths } from 'expo-file-system';
import { useReleasingSharedObjectWithLifecycle } from 'expo-modules-core';

type Audio = typeof import('expo-audio');
type StreamBuffer = import('expo-audio').AudioStreamBuffer;
type Player = import('expo-audio').AudioPlayer;

function load(): Audio | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-audio') as Audio;
    // The web build has expo-audio without its PCM stream: voice is off there, not a crash.
    return typeof (mod.AudioModule as { AudioStream?: unknown } | undefined)?.AudioStream === 'function' ? mod : null;
  } catch {
    return null;
  }
}

const audio = load();

export function voiceSupported(): boolean {
  return audio !== null;
}

/**
 * expo-modules-core's codes for a call on a native object it has already released.
 * Android raises the first. iOS cannot find the object at all and raises the second,
 * which on 2026-10-11 put a warning in the log every time voice mode closed.
 */
const RELEASED = new Set(['ERR_USING_RELEASED_SHARED_OBJECT', 'ERR_NATIVE_SHARED_OBJECT_NOT_FOUND']);

/**
 * Stop a microphone stream that may already be gone, without throwing.
 *
 * Closing voice mode unmounts the hook that owns the stream. `useMicStream`'s own cleanup
 * releases the stream before the voice hook's cleanup runs, so the stop there lands on a
 * released object and expo-audio throws. Thrown out of an effect cleanup, that is fatal:
 * on 2026-10-05 switching from voice mode to the keyboard closed the app on the A57. A
 * released stream has nothing left to stop. Any other failure is reported, and still not
 * thrown, because this runs during unmount, where a throw ends the app.
 */
export function stopStream(stop: () => void): void {
  try {
    stop();
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && RELEASED.has(code)) return;
    console.warn('[voice] the microphone did not stop:', error);
  }
}

export interface MicBuffer {
  samples: Int16Array;
  sampleRate: number;
}

/**
 * A microphone stream, as a hook, because that is the shape `expo-audio`
 * offers it in. Asks for 16 kHz 16-bit mono; `sampleRate` on each buffer is
 * what the hardware actually delivered, which on some phones is 48 kHz.
 *
 * Without the native module it is an inert stand-in, chosen once at load so
 * the hooks called are the same on every render.
 */
export const useMicStream: (onBuffer: (buffer: MicBuffer) => void) => {
  start: () => Promise<void>;
  stop: () => void;
} = audio
  ? (onBuffer) => {
      // `onBuffer` is read through a ref so the native stream's own options object —
      // and therefore the stream itself — never has to be recreated when the caller's
      // callback identity changes. Recreating it mid-session is what used to leave a
      // stale `stream.stop` pointed at an already-torn-down native object.
      const onBufferRef = useRef(onBuffer);
      useEffect(() => {
        onBufferRef.current = onBuffer;
      }, [onBuffer]);

      const handleBuffer = useCallback((buffer: StreamBuffer) => {
        // Mixed down here if the device insisted on stereo: speech is mono.
        const raw = new Int16Array(buffer.data);
        if (buffer.channels <= 1) {
          onBufferRef.current({ samples: raw, sampleRate: buffer.sampleRate });
          return;
        }
        const mono = new Int16Array(Math.floor(raw.length / buffer.channels));
        for (let i = 0; i < mono.length; i += 1) {
          let sum = 0;
          for (let c = 0; c < buffer.channels; c += 1) sum += raw[i * buffer.channels + c];
          mono[i] = Math.round(sum / buffer.channels);
        }
        onBufferRef.current({ samples: mono, sampleRate: buffer.sampleRate });
      }, []);

      // A `start()` still opening the recorder, if there is one.
      const starting = useRef<Promise<void> | null>(null);

      // Made here rather than through expo-audio's `useAudioStream`, whose cleanup releases
      // the stream at unmount there and then. If voice mode closes while `start()` is still
      // opening the recorder, that release finds nothing to stop (Android stops only a stream
      // already running), the start then finishes on an object nothing can reach, and the
      // microphone stays on. So the release waits for a start in flight to settle, stops what
      // it opened, and only then lets the stream go.
      const stream = useReleasingSharedObjectWithLifecycle(
        {
          factory: () =>
            new audio.AudioModule.AudioStream({ sampleRate: 16_000, channels: 1, encoding: 'int16' }),
          release: (closing) => {
            const close = () => {
              stopStream(() => closing.stop());
              closing.release();
            };
            if (starting.current) void starting.current.then(close, close);
            else close();
          },
        },
        [],
      );

      useEffect(() => {
        const subscription = stream.addListener('audioStreamBuffer', handleBuffer);
        return () => subscription.remove();
      }, [stream, handleBuffer]);

      // Read through a ref updated during render (not in an effect), so the wrapper
      // below — created once and never replaced — can never close over a stream
      // that's since been swapped or released: there's no render-to-effect gap for
      // a start()/stop() call to land in and hit a disposed native object.
      const streamRef = useRef(stream);
      streamRef.current = stream;

      return useRef({
        start: () => {
          const started = streamRef.current.start();
          starting.current = started;
          const settled = () => {
            if (starting.current === started) starting.current = null;
          };
          void started.then(settled, settled);
          return started;
        },
        stop: () => stopStream(() => streamRef.current.stop()),
      }).current;
    }
  : () => ({ start: async () => {}, stop: () => {} });

/** The microphone answer, and whether asking a second time can still help. */
export interface MicPermission {
  granted: boolean;
  /**
   * False once the OS has stopped showing the prompt — a second refusal on
   * Android, any refusal on iOS. `requestRecordingPermissionsAsync` then
   * returns instantly and silently, so a caller that only reads `granted`
   * leaves the user tapping a control that can never work. Only the Settings
   * app can undo it.
   */
  canAskAgain: boolean;
}

/**
 * Ask for the microphone. Refused, or no audio module at all, is not granted.
 *
 * A permission already held is read, not asked for. Asking goes through the app's foreground
 * activity, and the assist overlay is a second activity: opened while the app's own screen sat
 * stopped behind it, the request waited on that screen and the overlay never listened.
 */
export async function requestMicrophone(): Promise<MicPermission> {
  if (!audio) return { granted: false, canAskAgain: false };
  const held = await audio.getRecordingPermissionsAsync();
  if (held.granted) return { granted: true, canAskAgain: held.canAskAgain };
  const permission = await audio.requestRecordingPermissionsAsync();
  return { granted: permission.granted, canAskAgain: permission.canAskAgain };
}

/**
 * Put the audio session in the state voice mode needs: recording allowed,
 * audible in silent mode, and out of the loudspeaker rather than the earpiece
 * — a phone held at arm's length for a conversation is not held to an ear.
 */
export async function beginVoiceSession(): Promise<void> {
  if (!audio) return;
  voiceTakesOver();
  await audio.setAudioModeAsync(VOICE_MODE);
}

const takeovers = new Set<() => void>();

/**
 * Asks to hear when a conversation takes the speaker, so something playing on its own (the news
 * read aloud in the background) can step aside rather than fight it for the audio session.
 */
export function whenVoiceTakesOver(listener: () => void): void {
  takeovers.add(listener);
}

function voiceTakesOver(): void {
  takeovers.forEach((listener) => listener());
}

/**
 * Background listening: allowed to keep playing when the app is not on screen, and not asking for
 * the microphone, so the phone treats it as media rather than a call.
 */
const LISTEN_MODE = {
  allowsRecording: false,
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  shouldRouteThroughEarpiece: false,
  interruptionMode: 'doNotMix',
} as const;

export interface NewsAudio {
  pause: () => void;
  play: () => void;
  release: () => void;
}

/**
 * Plays a WAV as media that outlives the screen that started it, with the phone's lock-screen and
 * notification controls showing `title`. `onPlaying` follows those controls as well as this app's
 * own buttons; `onEnd` fires once when it plays out. Null where expo-audio has no native half.
 */
export const newsAudio: ((uri: string, meta: { title: string; artist: string; onPlaying: (playing: boolean) => void; onEnd: () => void }) => NewsAudio) | null = audio
  ? (uri, meta) => {
      const a = audio;
      let player: Player | null = a.createAudioPlayer({ uri });
      let ended = false;
      let wasPlaying = false;
      const sub = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish && !ended) {
          ended = true;
          meta.onEnd();
          return;
        }
        if (status.playing !== wasPlaying) {
          wasPlaying = status.playing;
          meta.onPlaying(status.playing);
        }
      });
      a.setAudioModeAsync(LISTEN_MODE)
        .catch((e: unknown) => console.warn('[listen] could not set up background playback', e instanceof Error ? e.message : e))
        .then(() => {
          if (!player) return;
          player.setActiveForLockScreen(true, { title: meta.title, artist: meta.artist });
          player.play();
        });
      return {
        pause: () => player?.pause(),
        play: () => player?.play(),
        release: () => {
          if (!player) return;
          sub.remove();
          player.clearLockScreenControls();
          player.pause();
          player.remove();
          player = null;
        },
      };
    }
  : null;

const VOICE_MODE = {
  allowsRecording: true,
  playsInSilentMode: true,
  shouldRouteThroughEarpiece: false,
  interruptionMode: 'doNotMix',
} as const;

/** Hand the audio session back, so other apps' sound resumes. */
export async function endVoiceSession(): Promise<void> {
  if (!audio) return;
  await audio.setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
}

let written = 0;

/** Bytes to a fresh file in the cache, for an upload or a player. */
export function cacheFile(prefix: string, bytes: Uint8Array): string {
  written += 1;
  const file = new File(Paths.cache, `${prefix}-${Date.now().toString(36)}-${written}.wav`);
  file.create({ overwrite: true });
  file.write(bytes);
  return file.uri;
}

export function discardFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone, or the cache was cleared under it; either way it is not here.
  }
}

/**
 * Play a WAV to its end. `onTime` reports the playhead in seconds, often
 * enough to drive the orb; the returned `stop` ends it early. Resolves when
 * playback finishes or is stopped.
 */
export function playFile(
  uri: string,
  onTime: (seconds: number) => void,
): { done: Promise<void>; stop: () => void } {
  if (!audio) return { done: Promise.resolve(), stop: () => {} };
  const a = audio;
  voiceTakesOver();
  let player: Player | null = a.createAudioPlayer({ uri }, { updateInterval: 50 });
  let settle: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const finish = () => {
    if (!player) return;
    sub.remove();
    player.remove();
    player = null;
    settle();
  };
  const sub = player.addListener('playbackStatusUpdate', (status) => {
    onTime(status.currentTime);
    if (status.didJustFinish) finish();
  });
  // On iOS the microphone stream leaves the session record-only (expo-audio's
  // `AudioStream.start` sets `.record` and nothing sets it back), and a reply
  // played into that is silent, with no error. So the speaker is set up again
  // before every reply, not only when voice mode opens.
  a.setAudioModeAsync(VOICE_MODE)
    .catch((e: unknown) => console.warn('[voice] could not set up the speaker', e instanceof Error ? e.message : e))
    .then(() => player?.play());
  return {
    done,
    stop: () => {
      player?.pause();
      finish();
    },
  };
}
