/**
 * Minimal authenticated SSE client.
 *
 * RN's global `fetch`/`EventSource` can't stream a response body or set
 * custom headers, but `expo/fetch` can (real `ReadableStream` body + arbitrary
 * headers), so it's used here instead of a third-party SSE polyfill.
 */

import { fetch as expoFetch } from 'expo/fetch';

export interface SseHandle {
  close: () => void;
}

/**
 * Opens an authenticated SSE stream. Calls `onEvent` once per `data:` line
 * (parsed as JSON). Calls `onError` once when the stream ends or fails —
 * the caller decides whether to fall back to polling.
 */
export function openSseStream<T>(
  url: string,
  headers: Record<string, string>,
  onEvent: (event: T) => void,
  onError: (err: unknown) => void,
): SseHandle {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await expoFetch(url, { headers, signal: controller.signal });
      if (!res.ok || !res.body) {
        throw new Error(`SSE connection failed with ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const json = trimmed.slice(5).trim();
          if (!json) continue;
          try {
            onEvent(JSON.parse(json) as T);
          } catch {
            // skip malformed line
          }
        }
      }
      onError(new Error('SSE stream closed'));
    } catch (err) {
      if (!controller.signal.aborted) onError(err);
    }
  })();

  return { close: () => controller.abort() };
}
