/**
 * The news brief, read aloud on this phone, that keeps going when the member leaves the screen,
 * switches app or locks the phone. One at a time, owned by the app rather than by a screen: the
 * news card, the news list and the brief itself all show and steer the same playback, and the
 * bar along the bottom of every screen (`NowListening`) pauses, resumes or stops it from anywhere.
 *
 * Playback holds the phone's media controls (lock screen and notification shade), which is what
 * lets Android keep it playing in the background past its few-minute limit, and gives a second
 * way to pause and resume. Anything that needs the speaker for a conversation (voice mode, a
 * voice note, a reply read aloud) pauses it first through `whenVoiceTakesOver`.
 */

import { useSyncExternalStore } from 'react';

import i18n from '@/services/i18n';
import { logFailure } from './describe-error';
import { showSnackbar } from '@/services/snackbar';
import { cacheFile, discardFile, newsAudio, whenVoiceTakesOver, type NewsAudio } from '@/services/voice-io';

export type ListenState = 'idle' | 'loading' | 'playing' | 'paused';

export interface Listening {
  /** The Pond path the audio came from, which tells the screens which brief this is. */
  path: string;
  title: string;
  state: Exclude<ListenState, 'idle'>;
}

interface Run {
  listening: Listening;
  abort: AbortController;
  player: NewsAudio | null;
  uri: string | null;
}

let run: Run | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const current = (): Listening | null => run?.listening ?? null;

function update(target: Run, state: Listening['state']): void {
  if (run !== target || target.listening.state === state) return;
  target.listening = { ...target.listening, state };
  emit();
}

/** Ends whatever is playing and drops its file. */
export function stopListening(): void {
  const ending = run;
  if (!ending) return;
  run = null;
  ending.abort.abort();
  ending.player?.release();
  if (ending.uri) discardFile(ending.uri);
  emit();
}

export function pauseListening(): void {
  if (!run?.player || run.listening.state !== 'playing') return;
  run.player.pause();
  update(run, 'paused');
}

export function resumeListening(): void {
  if (!run?.player || run.listening.state !== 'paused') return;
  run.player.play();
  update(run, 'playing');
}

/**
 * Fetches the brief's audio and plays it to its end. Starting a brief that is already the one
 * playing does nothing; starting another ends the first.
 */
export async function listenTo(path: string, title: string, fetch: (path: string, signal: AbortSignal) => Promise<ArrayBuffer>): Promise<void> {
  if (run?.listening.path === path) return;
  stopListening();
  if (!newsAudio) {
    showSnackbar({ message: i18n.t('goose.digest.listenFailed'), tone: 'danger' });
    return;
  }
  const mine: Run = { listening: { path, title, state: 'loading' }, abort: new AbortController(), player: null, uri: null };
  run = mine;
  emit();
  try {
    const bytes = await fetch(path, mine.abort.signal);
    if (run !== mine) return;
    mine.uri = cacheFile('digest', new Uint8Array(bytes));
    mine.player = newsAudio(mine.uri, {
      title,
      artist: i18n.t('goose.digest.listenArtist'),
      onPlaying: (playing) => update(mine, playing ? 'playing' : 'paused'),
      onEnd: () => {
        if (run === mine) stopListening();
      },
    });
    update(mine, 'playing');
  } catch (e) {
    if (mine.abort.signal.aborted || run !== mine) return;
    logFailure('listen', 'digest audio failed', e);
    stopListening();
    showSnackbar({ message: i18n.t('goose.digest.listenFailed'), tone: 'danger' });
  }
}

// A conversation needs the speaker and the microphone; the brief waits, paused, for the member to
// carry on from the bar.
whenVoiceTakesOver(pauseListening);

/** What is being listened to now, anywhere in the app. */
export function useListening(): Listening | null {
  return useSyncExternalStore(subscribe, current, current);
}
