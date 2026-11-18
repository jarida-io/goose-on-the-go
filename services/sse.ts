/**
 * Server-sent events, read off a fetch body as they arrive.
 *
 * React Native's own `fetch` hands back a body only once the response is
 * complete, which is why chat used to answer whole. Expo replaces the global
 * with `expo/fetch` (see `expo/src/winter/runtime.native.ts`), whose `body` is
 * a real `ReadableStream`, and installs a `TextDecoder` beside it — so a turn
 * can be drawn as the Pond produces it, rather than after it has finished.
 *
 * The parser is the WHATWG event-stream grammar and nothing more: `data:` lines
 * accumulate, a blank line dispatches, `:` starts a comment, a single space
 * after the colon is dropped. It knows nothing about the Pond, so it can be
 * tested without one; `api-client.ts` gives the events their meaning.
 */

export interface SseEvent {
  /** `message` unless the stream named it with `event:`. */
  event: string;
  data: string;
  id?: string;
}

export interface SseParser {
  /** Feed decoded text in whatever pieces the network delivered it. */
  push(chunk: string): void;
  /** The stream ended: dispatch anything complete that is still buffered. */
  end(): void;
}

export function createSseParser(onEvent: (event: SseEvent) => void): SseParser {
  let buffer = '';
  let data: string[] = [];
  let event = '';
  let id: string | undefined;

  const dispatch = () => {
    if (data.length > 0) onEvent({ event: event || 'message', data: data.join('\n'), id });
    data = [];
    event = '';
  };

  const line = (text: string) => {
    if (text === '') {
      dispatch();
      return;
    }
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? '' : text.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') data.push(value);
    else if (field === 'event') event = value;
    else if (field === 'id') id = value;
  };

  return {
    push(chunk) {
      buffer += chunk;
      // Lines end in \n, \r\n or a lone \r. A trailing \r may be the first half
      // of a \r\n still in flight, so it waits for the next chunk.
      let start = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const ch = buffer[i];
        if (ch !== '\n' && ch !== '\r') continue;
        if (ch === '\r' && i === buffer.length - 1) break;
        line(buffer.slice(start, i));
        if (ch === '\r' && buffer[i + 1] === '\n') i += 1;
        start = i + 1;
      }
      buffer = buffer.slice(start);
    },
    end() {
      if (buffer) line(buffer);
      buffer = '';
      dispatch();
    },
  };
}

/** A stream that went quiet for longer than `idleMs`: a dropped connection, not an answer. */
export class StreamStalledError extends Error {
  constructor(idleMs: number) {
    super(`stream silent for ${idleMs}ms`);
    this.name = 'StreamStalledError';
  }
}

/**
 * Read a streaming response to its end, one event at a time.
 *
 * `idleMs` is the stall guard. A generation on the Pond's own hardware can take
 * minutes in total, so a single deadline for the whole turn either cuts off a
 * long answer or waits forever on a dead one. What actually marks a dead stream
 * is silence, so the clock restarts on every chunk — keep-alive comments
 * included — and only a gap longer than `idleMs` ends it, with a
 * `StreamStalledError` so the caller can tell a drop from a finish. A function
 * for `idleMs` is asked again after each chunk, so what a frame says can widen it.
 */
export async function readSse(
  response: Response,
  onEvent: (event: SseEvent) => void,
  options: { idleMs?: number | (() => number); onIdle?: () => void } = {},
): Promise<void> {
  const body = response.body;
  if (!body) {
    // A runtime without streaming bodies still gets the whole answer, late.
    const parser = createSseParser(onEvent);
    parser.push(await response.text());
    parser.end();
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser(onEvent);
  const idleOf = () => (typeof options.idleMs === 'function' ? options.idleMs() : options.idleMs);
  let idleMs = idleOf();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stalled = false;
  const arm = () => {
    idleMs = idleOf();
    if (timer) clearTimeout(timer);
    if (!idleMs) return;
    timer = setTimeout(() => {
      stalled = true;
      options.onIdle?.();
      void reader.cancel().catch(() => {});
    }, idleMs);
  };

  try {
    arm();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
      arm();
    }
    parser.push(decoder.decode());
    parser.end();
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (stalled && idleMs) throw new StreamStalledError(idleMs);
}
