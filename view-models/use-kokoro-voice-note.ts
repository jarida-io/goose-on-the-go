/**
 * Kokoro voice note: synthesizes a reply with the Pond's Kokoro TTS (`/api/v1/tts`) and saves
 * the resulting WAV as a playable voice note attached to the message.
 */

import { useCallback, useSyncExternalStore } from 'react';

import type { ChatVoiceNote } from '@/models/chat';
import { api } from '@/services/api-client';
import i18n from '@/services/i18n';
import { showSnackbar } from '@/services/snackbar';
import { takeSpeechUnits } from '@/services/speech';
import { cacheFile } from '@/services/voice-io';

interface KokoroEntry {
  note: ChatVoiceNote | null;
  generating: boolean;
}

const EMPTY: KokoroEntry = { note: null, generating: false };
const entries = new Map<string, KokoroEntry>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setEntry(id: string, next: KokoroEntry) {
  entries.set(id, next);
  emit();
}

/** Merge one or more 44-byte-header RIFF/WAV buffers into a single WAV and compute its duration. */
function mergeWavs(buffers: ArrayBuffer[]): { bytes: Uint8Array; durationMs: number } {
  if (buffers.length === 0) return { bytes: new Uint8Array(0), durationMs: 0 };
  const first = new Uint8Array(buffers[0]);
  if (first.length <= 44) return { bytes: first, durationMs: 0 };

  const view0 = new DataView(first.buffer, first.byteOffset, first.byteLength);
  const byteRate = view0.getUint32(28, true) || 48000;

  if (buffers.length === 1) {
    const pcmBytes = Math.max(0, first.length - 44);
    const durationMs = Math.max(1000, Math.round((pcmBytes / byteRate) * 1000));
    return { bytes: first, durationMs };
  }

  let totalPcm = 0;
  for (const buf of buffers) {
    if (buf.byteLength > 44) totalPcm += buf.byteLength - 44;
  }

  const out = new Uint8Array(44 + totalPcm);
  out.set(first.subarray(0, 44), 0);
  let offset = 44;
  for (const buf of buffers) {
    const u8 = new Uint8Array(buf);
    if (u8.length > 44) {
      out.set(u8.subarray(44), offset);
      offset += u8.length - 44;
    }
  }
  const outView = new DataView(out.buffer);
  outView.setUint32(4, 36 + totalPcm, true);
  outView.setUint32(40, totalPcm, true);

  const durationMs = Math.max(1000, Math.round((totalPcm / byteRate) * 1000));
  return { bytes: out, durationMs };
}

export async function generateKokoroVoiceNote(id: string, text: string): Promise<void> {
  const current = entries.get(id);
  if (current?.generating) return;

  const { units } = takeSpeechUnits(text, 0, true);
  if (units.length === 0) return;

  setEntry(id, { note: current?.note ?? null, generating: true });
  const abort = new AbortController();
  try {
    const chunks: ArrayBuffer[] = [];
    for (const unit of units) {
      const wav = await api.speak(unit.text, abort.signal, unit.last);
      chunks.push(wav);
    }
    const { bytes, durationMs } = mergeWavs(chunks);
    const uri = await cacheFile('kokoro', bytes);
    setEntry(id, {
      note: { uri, durationMs, name: 'Goose' },
      generating: false,
    });
  } catch {
    setEntry(id, { note: current?.note ?? null, generating: false });
    showSnackbar({ message: i18n.t('chat.reply.readFailed'), tone: 'danger' });
  }
}

export function useKokoroVoiceNote(id: string) {
  const entry = useSyncExternalStore(
    subscribe,
    () => entries.get(id) ?? EMPTY,
    () => EMPTY,
  );

  const sendVoiceNote = useCallback(
    (text: string) => {
      void generateKokoroVoiceNote(id, text);
    },
    [id],
  );

  return {
    note: entry.note,
    generating: entry.generating,
    sendVoiceNote,
  };
}
