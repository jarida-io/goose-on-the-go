/**
 * The conversation with Goose.
 *
 * Follows the view-model contract in docs/ARCHITECTURE.md: the screen renders
 * `data` and calls `actions`, and never touches the network itself.
 *
 * Two sources feed `messages`. Opening an existing conversation reads it back
 * from the Pond, which is the only way history survives the app being closed;
 * sending appends locally first so the message appears under the thumb that
 * sent it, then builds the reply as it streams. The Pond persists both, so a
 * reload agrees with what was on screen.
 *
 * Every turn streams (`POST /api/v1/chat/stream`). `/chat` answers whole and
 * drops pictures and voice mode on the floor, and a reader watching nothing
 * happen for a minute has no way to tell thinking from broken. On the stream
 * they see each tool Goose calls as it calls it, and the answer as it is
 * written.
 *
 * Turns are resumable. A phone locks, walks out of Wi-Fi range, backgrounds
 * the app; a turn tied to the connection would be cancelled by any of them and
 * its question deleted from the history. A resumable one keeps running on the
 * Pond, and `chat-runs.ts` holds its stream, so leaving the conversation leaves
 * the turn running and reopening it shows the reply where it has got to.
 *
 * One turn runs at a time, and what is sent meanwhile queues behind it
 * (`turn-queue.ts`) rather than being refused: the composer never has to wait
 * for the model.
 *
 * A conversation's thread is not this hook's. It lives in `chat-threads.ts`,
 * and the hook shows whichever one is open, so a conversation left and reopened
 * comes back as it was while the Pond is read again behind it, and a turn
 * writes into its own thread whichever conversation is on screen by then.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import type { BubblePosition } from '@/components/ui/ink';

import type { Message, ToolCall } from '@/models/chat';
import { isAskTool } from '@/models/questions';
import { readNote, withOfferState } from '@/models/message-note';
import { toolWords, humanizeTool } from '@/constants/tools';
import { useServer, type MigrationScreen } from '@/providers/server-provider';
import { ApiError, api } from '@/services/api-client';
import { cardsFor, forgetCalls, type CardsByCall } from '@/services/card-cache';
import { chatRuns, questionAnswered, type TurnHandle } from '@/services/chat-runs';
import { markAskAnswered } from '@/services/answered-asks';
import { changed, keepThread, newThread, threadFor, watchThread, type Thread } from '@/services/chat-threads';
import { composeMessage, type Attachment } from '@/services/media';
import type { AnswerShape, ChatFrame, ChatStreamRequest, SessionMessage } from '@/services/types';
import { describeApiError, logFailure } from '@/view-models/describe-error';
import { createTurnQueue } from '@/view-models/turn-queue';
import { MOCK_RESEARCH_REPLY, MOCK_TASK_REPLY } from '@/models/long-tasks-mock';
import { mockTaskStart } from '@/view-models/use-long-task';
import { researchRefusal } from '@/view-models/use-deep-research';

/** How much of a long conversation is worth reading back on open. */
const HISTORY_LIMIT = 100;

/**
 * Whether a failure is the request being given up on rather than refused.
 *
 * React Native's abort surfaces as a plain Error whose text names the native
 * frame that threw — `FetchRequestCanceledException … NativeResponse.swift` —
 * so `name === 'AbortError'` alone does not catch it.
 */
function isAbort(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e.name === 'AbortError') return true;
  return /cancel|abort/i.test(e.message);
}

/**
 * What the reader is told about a turn that failed. Never the failure's own text: an ApiError's
 * message is the route and status (`POST /api/v1/agent/chat/stream → 500`) and a dropped
 * connection's is the platform's ("Network request failed"), and both used to land on screen.
 * They go to the log instead.
 */
export function describeTurnError(e: unknown, t: TFunction): string {
  logFailure('chat', 'turn failed', e);
  const research = researchRefusal(e);
  if (research === 'off') return t('chat.research.refusedOff');
  if (research === 'unidentified') return t('chat.research.unidentified');
  if (e instanceof ApiError) {
    const code = (e.body as { code?: unknown } | null)?.code;
    if (code === 'audio_unsupported') return t('chat.voiceNote.modelCannotHear');
    if (code === 'audio_not_ready') return t('chat.voiceNote.addOnNotReady');
    if (code === 'audio_invalid') return t('chat.voiceNote.unreadable');
    if (code === 'voice_note_no_words') return t('chat.voiceNote.noWords');
    if (code === 'voice_note_untranscribed') return t('chat.voiceNote.untranscribed');
    if (code === 'audio_too_long') return t('chat.composer.audioTooLong');
    if (code === 'audio_too_large') return t('chat.composer.audioTooLargeForPond');
    if (code === 'document_invalid') return t('chat.composer.pdfInvalid');
    if (code === 'document_no_text') return t('chat.composer.pdfNoText');
    if (code === 'document_too_large') return t('chat.composer.pdfTooLargeForPond');
    if (e.status === 503) return t('chat.busy');
    if (e.status === 413) return t('chat.composer.tooLarge');
    if (e.status === 415) return t('chat.composer.unsupported');
    return describeApiError(e) ?? t('chat.failed');
  }
  if (isAbort(e)) return t('chat.timedOut');
  return t('chat.failed');
}

/** A tool row's `content` parsed as the JSON blob it stores, or null for an older, bare row. */
function readRow(content: string): Record<string, unknown> | null {
  try {
    const blob: unknown = JSON.parse(content);
    return typeof blob === 'object' && blob !== null && !Array.isArray(blob) ? (blob as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A tool row's `content` is a JSON blob around the result; this is the result. */
export function toolResultText(content: string): string {
  const blob = readRow(content);
  return typeof blob?.content === 'string' ? blob.content : content;
}

/**
 * The stub a tool row holds in place of a result the Pond does not keep, or
 * null for a row holding its whole result. The marker sits inside the stored
 * JSON, and the Pond's contract also allows it on the message itself.
 */
export function keptStubOf(m: SessionMessage): string | null {
  if (m.role !== 'tool') return null;
  const blob = readRow(m.content);
  if (blob?.transient !== true && m.transient !== true) return null;
  const stub = (typeof blob?.content === 'string' ? blob.content : m.content).trim();
  return stub || null;
}

/**
 * A stored message as the screen draws it.
 *
 * `tool` rows are dropped: they are the transcript of Goose calling something,
 * addressed to the model rather than to the reader. Their results reach the
 * screen through `fromHistory`, folded into the call that asked for them.
 */
/** What the Pond saves on a user row in place of a voice note's recording: its wire text, never shown. */
// eslint-disable-next-line i18next/no-literal-string
export const VOICE_NOTE_MARK = '[Voice note]';
/** And for each PDF, with its name. */
const DOCUMENT_MARK = /^\[Document: (.+)\]$/;
/** And for an audio file, with its name. */
const AUDIO_FILE_MARK = /^\[Audio: (.+)\]$/;

export function toMessage(m: SessionMessage): Message | null {
  if (m.role === 'tool') return null;
  const message: Message = {
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: Date.parse(m.created_at) || Date.now(),
  };
  // The Pond keeps marks where a recording or a PDF was, not the file: a recording reads back as a
  // note with nothing to play, and a PDF as its name, as it was shown when it was sent.
  if (m.role === 'user') {
    const lines = m.content.split('\n');
    const audioFile = lines.map((line) => AUDIO_FILE_MARK.exec(line)?.[1]).find(Boolean);
    if (audioFile) message.voice = { uri: '', durationMs: 0, name: audioFile };
    else if (lines.includes(VOICE_NOTE_MARK)) message.voice = { uri: '', durationMs: 0 };
    message.content = lines
      .filter((line) => line !== VOICE_NOTE_MARK && !AUDIO_FILE_MARK.test(line))
      .map((line) => DOCUMENT_MARK.exec(line)?.[1] ?? line)
      .join('\n');
  }
  if (m.images?.length) {
    message.images = m.images.map((image) => ({
      id: image.id,
      uri: image.url,
      local: false,
      mimeType: image.mime_type,
    }));
  }
  if (m.thinking?.length) message.thinking = m.thinking;
  const note = readNote(m.note);
  if (note) message.note = note;
  return message;
}

/**
 * Whether a saved conversation ends in a question nothing has answered yet:
 * the only kind a turn can still be running in, since the Pond saves the
 * question before it starts and the answer only once it has finished.
 */
export function endsUnanswered(rows: SessionMessage[]): boolean {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].role === 'user') return true;
    if (rows[i].role === 'assistant') return false;
  }
  return false;
}

/**
 * A saved conversation, as a reader would recount it.
 *
 * The Pond stores a turn as `user`, then a `tool` row per result, then one
 * `assistant` row holding the whole answer and every call it made. The results
 * come first and the calls after, so they are gathered in one pass and matched
 * to their calls in the next. An assistant row with no words and no calls said
 * nothing, and is left out.
 *
 * The Pond saves no cards, so `cards` is what this phone kept of them, by call.
 * A result the Pond kept only as a stub comes back as that stub, with no card.
 */
export function fromHistory(rows: SessionMessage[], cards: CardsByCall = {}): Message[] {
  const results = new Map<string, string>();
  const stubs = new Map<string, string>();
  for (const row of rows) {
    if (row.role !== 'tool' || !row.tool_call_id) continue;
    const stub = keptStubOf(row);
    if (stub) stubs.set(row.tool_call_id, stub);
    else results.set(row.tool_call_id, toolResultText(row.content));
  }

  const out: Message[] = [];
  for (const row of rows) {
    // System rows are the Pond talking to the model.
    if ((row.role as string) === 'system') continue;
    const message = toMessage(row);
    if (!message) continue;
    if (row.role === 'assistant' && row.tool_calls?.length) {
      message.tools = row.tool_calls.map<ToolCall>((call) => {
        const tool: ToolCall = {
          id: call.id,
          name: call.name,
          args: call.arguments,
          status: 'ok',
          result: results.get(call.id),
        };
        const stub = stubs.get(call.id);
        if (stub) {
          tool.kept = stub;
          return tool;
        }
        const card = cards[call.id];
        if (card) tool.card = card;
        return tool;
      });
    }
    if (row.role === 'assistant' && !message.content.trim() && !message.tools?.length && !message.note) continue;
    out.push(message);
  }
  return out;
}

/**
 * Where each message sits in its run of same-speaker turns.
 *
 * Ink draws a bubble's tail from this, so four consecutive turns from one
 * speaker read as a single block rather than four identical shapes. It lives
 * here rather than in the screen because it shapes data, and because a screen
 * that imports Ink cannot be unit-tested without a native transform.
 */
export function positionsFor(messages: Message[]): BubblePosition[] {
  return messages.map((m, i) => {
    const samePrev = i > 0 && messages[i - 1].role === m.role;
    const sameNext = i < messages.length - 1 && messages[i + 1].role === m.role;
    if (samePrev && sameNext) return 'middle';
    if (samePrev) return 'last';
    if (sameNext) return 'first';
    return 'only';
  });
}

/** The Pond's first guess at a title keeps this many words, and this many characters. */
const TITLE_WORDS = 6;
const TITLE_CHARS = 60;

const unquote = (s: string) => s.replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');

/**
 * The title the Pond gives a conversation after its first reply, made the same
 * way (`derive_title_from_text` in pond-core's chat service): the first six
 * words of the first question, quotes trimmed, sixty characters at most. Kept
 * identical so a new conversation's title bar says, from the moment it is
 * asked, what the wall will call it once the Pond has saved the turn. Empty
 * when there are no words.
 */
export function derivedTitle(text: string): string {
  const words = unquote(text.trim()).split(/\s+/).filter(Boolean).slice(0, TITLE_WORDS).join(' ');
  const title = unquote(words.trim()).trim();
  const chars = Array.from(title);
  if (chars.length <= TITLE_CHARS) return title;
  return `${chars.slice(0, TITLE_CHARS).join('').trimEnd()}…`;
}

/**
 * The title a conversation on screen would be given, from its first question.
 * Null when the thread may not begin at the beginning — a long one is read back
 * from its most recent end — or nothing has been asked in words yet.
 */
export function titleFromThread(messages: Message[]): string | null {
  if (messages.length >= HISTORY_LIMIT) return null;
  const first = messages.find((m) => m.role === 'user' && m.content.trim());
  return first ? derivedTitle(first.content) || null : null;
}

/**
 * What Goose is doing, in words: under the thinking quips before the answer,
 * and beside the spinner under it after. `review_status` is the Pond reviewing
 * an answer it has already sent, when review mode is on — still the turn, and
 * anything queued behind it waits for it.
 */
export function statusFor(frame: ChatFrame, t: TFunction): string | null {
  if ((frame.type === 'status' || frame.type === 'review_status') && frame.content) return frame.content;
  if (frame.type === 'tool_call' && frame.tool) {
    const words = toolWords(frame.tool);
    if (words?.doing) return t(words.doing);
    return t('chat.tools.using', { tool: words ? t(words.label) : humanizeTool(frame.tool) });
  }
  return null;
}

/** What `/chat/stream` is sent for a turn; `deep_research` only when it is research, as older Ponds expect. */
export function streamBody(
  text: string,
  attachments: Attachment[],
  options: SendOptions,
  sessionId: string | null,
): ChatStreamRequest {
  const images = attachments.filter((a) => a.kind === 'image' && a.base64);
  const audio = attachments.filter((a) => a.kind === 'audio' && a.base64);
  const documents = attachments.filter((a) => a.kind === 'document' && a.base64);
  // A spoken turn's words ride beside its recording, so the Pond sends its model one or the other.
  const spoken = audio.some((a) => a.heardAs);
  return {
    message: spoken ? '' : composeMessage(text, attachments),
    ...(sessionId ? { session_id: sessionId } : {}),
    ...(images.length ? { images: images.map((a) => ({ data: a.base64 as string, mime_type: a.mimeType })) } : {}),
    ...(audio.length
      ? {
          audio: audio.map((a) => ({
            data: a.base64 as string,
            mime_type: a.mimeType,
            ...(a.durationMs === undefined ? { name: a.name } : {}),
            ...(a.heardAs ? { heard_as: a.heardAs } : {}),
          })),
        }
      : {}),
    ...(documents.length
      ? { documents: documents.map((a) => ({ data: a.base64 as string, mime_type: a.mimeType, name: a.name })) }
      : {}),
    voice_mode: Boolean(options.voice),
    resumable: true,
    ...(options.locked ? { device_locked: true } : {}),
    ...(options.research ? { deep_research: true } : {}),
    ...(options.research && options.answer && options.answer !== 'auto' ? { deep_research_answer: options.answer } : {}),
    ...(options.card ? { card: { kind: options.card.kind, id: options.card.id } } : {}),
  };
}

export interface SendOptions {
  /** Spoken rather than read: a shorter answer, no reasoning passage. */
  voice?: boolean;
  /** Asked from a locked phone (the orb over the lock screen): the Pond answers with no personal data. */
  locked?: boolean;
  /** A research question: the Pond starts a long task on it rather than answering in the turn. */
  research?: boolean;
  /** How much the research should write; read only with `research`. */
  answer?: AnswerShape;
  /** A card the member sent to chat with this turn; the Pond reads it and Goose's notes on it. */
  card?: { kind: string; id: string };
  /** The reply so far, each time it grows — voice mode speaks it as it comes. */
  onText?: (text: string) => void;
}

export interface UseChat {
  data: {
    messages: Message[];
    /** Sent while a reply was still coming, waiting their turn in order. */
    queued: Message[];
    sessionId: string | null;
    /**
     * What the conversation is called: the Pond's title, or until it has one
     * the title it will give it. Null for a conversation nothing has been
     * asked in yet.
     */
    title: string | null;
    /** A turn is in flight. */
    streaming: boolean;
    /** What Goose says it is doing right now, when it has said. */
    status: string | null;
    /** Changes each turn, so a quip is chosen once per turn rather than per render. */
    turnSeed: number;
  };
  loading: boolean;
  error: string | null;
  actions: {
    /**
     * Send now, or once the turns ahead of it have settled. Resolves with the
     * whole reply, or null when nothing was sent, it failed, or it was taken
     * back while it waited.
     */
    send: (text: string, attachments?: Attachment[], options?: SendOptions) => Promise<string | null>;
    /** Take back a queued message before it goes. */
    unqueue: (id: string) => void;
    /** Stop the turn in flight and drop what is queued behind it. What already arrived stays. */
    stop: () => void;
    /** Start afresh. A turn still running carries on where it was asked, unwatched. */
    newConversation: () => void;
    /**
     * The conversation is on screen until the returned release is called, so a
     * turn that ends meanwhile is not announced to the person reading it.
     */
    watch: () => () => void;
    /**
     * Read an existing conversation back from the Pond. `title` is what the
     * screen that linked here already calls it, shown until the Pond says
     * otherwise.
     */
    open: (sessionId: string, title?: string) => void;
    /**
     * Answer what a message offers. Taking it sends the offer's prompt as the person's own turn
     * in this conversation; passing it over only records that.
     */
    answerOffer: (messageId: string, take: boolean) => Promise<void>;
    /** Give the conversation on screen a name. Resolves to why it was refused, or null once it is named. */
    rename: (title: string) => Promise<string | null>;
    /** Ask Goose to name the conversation on screen. Resolves as `rename` does. */
    nameForMe: () => Promise<string | null>;
    dismissError: () => void;
  };
}

/**
 * A turn as the queue holds it: a question to ask, or a turn already running
 * that opening the conversation found — asked before the app was last closed.
 * Either belongs to the thread it was made in, whichever conversation is on
 * screen by the time it runs, and the second goes through the queue too, so
 * what is sent meanwhile waits behind it.
 */
type Job =
  | {
      kind: 'ask';
      thread: Thread;
      question: Message;
      text: string;
      attachments: Attachment[];
      options: SendOptions;
    }
  | { kind: 'follow'; thread: Thread; handle: TurnHandle };

const pendingReply = (id: string): Message => ({
  id,
  role: 'assistant',
  content: '',
  timestamp: Date.now(),
  pending: true,
});

/**
 * The question a turn asks, drawn once, when it is sent. A queued one shows as
 * it will be asked, pictures and all, so the picture is never re-bound to a
 * later question.
 */
function questionFor(id: string, text: string, attachments: Attachment[]): Message {
  const images = attachments.filter((a) => a.kind === 'image' && a.base64);
  const files = attachments.filter((a) => a.kind === 'text' || a.kind === 'document');
  // A spoken turn reads as its words; only a voice note shows as a note.
  const note = attachments.find((a) => a.kind === 'audio' && !a.heardAs);
  return {
    id,
    role: 'user',
    content: [text, ...files.map((f) => f.name)].filter(Boolean).join('\n'),
    timestamp: Date.now(),
    ...(note
      ? { voice: { uri: note.uri, durationMs: note.durationMs ?? 0, ...(note.durationMs ? {} : { name: note.name }) } }
      : {}),
    images: images.map((a) => ({
      id: a.id,
      uri: a.uri,
      local: true,
      mimeType: a.mimeType,
      width: a.width,
      height: a.height,
    })),
  };
}

/** The `ask` call the turn running in a thread is waiting on, if it is waiting on one. */
export function waitingAsk(th: Pick<Thread, 'turn' | 'messages'>): ToolCall | null {
  const replyId = th.turn?.replyId;
  const reply = replyId ? th.messages.find((m) => m.id === replyId) : undefined;
  return reply?.tools?.find((t) => t.status === 'running' && isAskTool(t.name)) ?? null;
}

/**
 * What a conversation needs to know about the connection: whether the saved pairing has been read
 * back, and whether chat talks to the Pond or to its mock.
 */
export interface ChatConnection {
  hydrated: boolean;
  isScreenReal: (screen: MigrationScreen) => boolean;
}

export function useChat(): UseChat {
  return useChatOn(useServer());
}

/**
 * A conversation over a connection handed in, for a React tree with no ServerProvider: the
 * assist overlay (`components/assist/`), which restores the pairing itself.
 */
export function useChatOn({ hydrated, isScreenReal }: ChatConnection): UseChat {
  const { t } = useTranslation();

  // The conversation on screen. Its thread lives in `chat-threads.ts`, not
  // here, so leaving the screen does not take the thread with it.
  const [thread, setThread] = useState<Thread>(() => newThread());
  const viewRef = useRef(thread);
  const subscribe = useCallback((listener: () => void) => watchThread(thread, listener), [thread]);
  useSyncExternalStore(subscribe, () => thread.version);

  const [queued, setQueued] = useState<Message[]>([]);
  const [turnSeed, setTurnSeed] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watched, setWatched] = useState(false);

  const localId = useRef(0);
  const nextLocalId = () => `local-${Date.now().toString(36)}-${++localId.current}`;

  // Read fresh at delivery time rather than at send time, so a reply always
  // reflects whatever the toggle is when it actually lands.
  const isScreenRealRef = useRef(isScreenReal);
  useEffect(() => {
    isScreenRealRef.current = isScreenReal;
  }, [isScreenReal]);

  /** The thread a turn run from here is streaming into, if any. */
  const activeRef = useRef<Thread | null>(null);
  const mountedRef = useRef(true);

  const show = useCallback((next: Thread) => {
    viewRef.current = next;
    setThread(next);
  }, []);

  /** Whatever is said about a thread is said only while it is the one on screen. */
  const sayFor = useCallback((th: Thread, message: string | null) => {
    if (viewRef.current === th) setError(message);
  }, []);

  // Handed `runJob` below, and handed it again whenever it changes, so a
  // queued turn runs through the current one. Replaced with a new
  // conversation, so its first question does not wait for the last one's answer.
  const makeQueue = useCallback(
    () =>
      createTurnQueue<Job>((waiting) =>
        setQueued(waiting.flatMap((w) => (w.kind === 'ask' ? [w.question] : []))),
      ),
    [],
  );
  const [queue, setQueue] = useState(makeQueue);

  // Leaving the screen lets the turn go rather than stopping it: it carries on
  // in `chatRuns`, still writing into its thread, and the wall and the
  // reopened conversation read it there. What is queued behind it is still
  // sent, in the background. Only voice mode stops, since nobody is listening.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const turn = activeRef.current?.turn;
      if (turn) chatRuns.mute(turn.key);
    };
  }, []);

  useEffect(() => {
    if (!watched || !thread.session) return;
    return chatRuns.view(thread.session);
  }, [watched, thread.session]);

  /**
   * The Pond's own title for a conversation. It has no route for one
   * conversation, so this reads the list the wall reads. A failure leaves the
   * bar as it was.
   */
  const refreshTitle = useCallback(async (th: Thread) => {
    const id = th.session;
    if (!id) return;
    try {
      const named = (await api.listSessions()).find((s) => s.id === id)?.title?.trim();
      if (named) {
        th.title = named;
        changed(th);
      }
    } catch {
      // The title already shown stands.
    }
  }, []);

  /**
   * Read a thread back from the Pond. `loud` is a thread with nothing to show
   * yet: it shows the loading state and says when the read fails. Otherwise the
   * kept thread stays up, and a failed read leaves it there; the offline banner
   * already says whether the Pond can be reached.
   *
   * A read that a turn overtook is dropped. The turn's own messages are newer
   * than the history the read began with. Resolves true when the read was
   * shown and ends in a question nothing has answered yet.
   */
  const reload = useCallback(
    async (th: Thread, loud: boolean): Promise<boolean> => {
      const id = th.session;
      if (!id) return false;
      const turns = th.turns;
      if (loud) setLoading(true);
      try {
        const [rows, cards] = await Promise.all([api.listSessionMessages(id, HISTORY_LIMIT), cardsFor(id)]);
        if (th.turn || th.turns !== turns) return false;
        th.messages = fromHistory(rows, cards);
        // A card kept before the Pond marked its result transient goes too.
        const stale = rows.flatMap((row) =>
          row.tool_call_id && cards[row.tool_call_id] && keptStubOf(row) ? [row.tool_call_id] : [],
        );
        void forgetCalls(id, stale);
        keepThread(th);
        changed(th);
        return endsUnanswered(rows);
      } catch (e) {
        if (loud) sayFor(th, describeTurnError(e, t));
        else console.warn('[chat] re-reading a kept conversation failed; showing what was kept', e instanceof ApiError ? e.status : 'network');
        return false;
      } finally {
        if (loud && viewRef.current === th) setLoading(false);
      }
    },
    [sayFor, t],
  );

  /**
   * Draw a turn `chat-runs.ts` holds into its thread until it ends, then settle
   * the reply however it ended. The thread is written whether or not anyone is
   * looking at it, so a conversation reopened mid-answer shows the reply as far
   * as it has got.
   */
  const drive = useCallback(
    async (th: Thread, replyId: string, handle: TurnHandle): Promise<string | null> => {
      let finish!: () => void;
      th.turn = {
        key: handle.key,
        replyId,
        done: new Promise<void>((resolve) => {
          finish = resolve;
        }),
      };
      th.status = null;
      changed(th);
      activeRef.current = th;

      let drawn: unknown = null;
      // An error frame already said, so a redraw does not bring back one that was dismissed.
      let said: string | null = null;
      const draw = () => {
        const live = chatRuns.get(handle.key);
        if (!live || live === drawn) return;
        drawn = live;
        th.messages = th.messages.map((x) => (x.id === replyId ? { ...live.reply, id: replyId } : x));
        th.status = live.status ? statusFor(live.status, t) : null;
        if (live.sessionId && th.session !== live.sessionId) {
          th.session = live.sessionId;
          keepThread(th);
        }
        if (live.errorText && live.errorText !== said) {
          said = live.errorText;
          sayFor(th, live.errorText);
        }
        changed(th);
      };
      const unsubscribe = chatRuns.subscribe(draw);
      draw();
      const end = await handle.ended;
      unsubscribe();

      if (end.error && end.outcome !== 'stopped') sayFor(th, describeTurnError(end.error, t));
      if (end.error && !end.reply.content && !end.reply.tools?.length) {
        // Nothing arrived: the reply was never started, so it is not shown.
        th.messages = th.messages.filter((x) => x.id !== replyId);
      } else {
        th.messages = th.messages.map((x) => (x.id === replyId ? { ...end.reply, id: replyId } : x));
      }
      if (end.sessionId && th.session !== end.sessionId) {
        th.session = end.sessionId;
        keepThread(th);
      }
      th.turn = null;
      th.status = null;
      changed(th);
      if (activeRef.current === th) activeRef.current = null;
      finish();
      if (end.outcome === 'done') {
        // A saved turn is when the Pond names a new conversation, and its
        // re-titling job may since have named an old one better.
        void refreshTitle(th);
      } else if (end.outcome === 'lost' || end.stale || (end.outcome === 'failed' && !end.error)) {
        // A run aged out of the Pond's memory has finished; the saved copy is the answer.
        if (end.outcome === 'lost' && !end.gone) sayFor(th, t('chat.lostConnection'));
        void reload(th, false);
      }
      return end.outcome === 'done' ? end.reply.content : null;
    },
    [refreshTitle, reload, sayFor, t],
  );

  const runJob = useCallback(
    async (job: Job): Promise<string | null> => {
      const th = job.thread;
      // A turn already running in this thread finishes first: one
      // conversation answers one question at a time.
      if (th.turn) await th.turn.done;

      if (job.kind === 'follow') {
        const replyId = nextLocalId();
        th.turns += 1;
        th.messages = [...th.messages, pendingReply(replyId)];
        return drive(th, replyId, job.handle);
      }

      const { text: trimmed, attachments, options } = job;
      const reply = pendingReply(nextLocalId());
      // Stamped when it is asked, which for a queued one is not when it was written.
      const question: Message = { ...job.question, timestamp: Date.now() };

      th.turns += 1;
      th.messages = [...th.messages, question, reply];
      changed(th);
      sayFor(th, null);
      setTurnSeed(Date.now());

      if (!isScreenRealRef.current('chat')) {
        let finish!: () => void;
        th.turn = {
          key: `mock-${reply.id}`,
          replyId: reply.id,
          done: new Promise<void>((resolve) => {
            finish = resolve;
          }),
        };
        changed(th);
        await new Promise((resolve) => setTimeout(resolve, 700));
        // Research, or a message asking for a long task, starts one in the mock Pond, so its card can be seen.
        const tools = options.research
          ? [mockTaskStart(trimmed, 'research', options.answer)]
          : /\blong task\b/i.test(trimmed)
            ? [mockTaskStart(trimmed)]
            : undefined;
        const content = options.research
          ? MOCK_RESEARCH_REPLY
          : tools
            ? MOCK_TASK_REPLY
            : `Working on it. (${trimmed.length} characters received — this is a mock response.)`;
        th.messages = th.messages.map((x) => (x.id === reply.id ? { ...x, content, tools, pending: false } : x));
        th.turn = null;
        changed(th);
        finish();
        return content;
      }

      const handle = chatRuns.start({
        body: streamBody(trimmed, attachments, options, th.session),
        title: th.title ?? titleFromThread(th.messages),
        onText: mountedRef.current ? options.onText : undefined,
      });
      return drive(th, reply.id, handle);
    },
    [drive, sayFor],
  );

  useEffect(() => {
    queue.runWith(runJob);
  }, [queue, runJob]);

  /**
   * Pick up a turn still running in a conversation that ends in an unanswered
   * question: one this phone holds, or one asked before the app was last closed.
   */
  const pickUp = useCallback(
    async (th: Thread) => {
      const id = th.session;
      if (!id) return;
      const handle = await chatRuns.resume(id, th.title ?? titleFromThread(th.messages));
      if (!handle || th.turn) return;
      void queue.submit({ kind: 'follow', thread: th, handle });
    },
    [queue],
  );

  const open = useCallback(
    (id: string, hint?: string) => {
      if (!hydrated) return;
      const named = hint?.trim() || null;
      const kept = threadFor(id);
      const th = kept ?? newThread(id, named);
      // Reopening keeps the title it had rather than blanking it while the
      // list is read again; a title from the linking screen is newer.
      if (named) th.title = named;
      keepThread(th);
      show(th);
      setError(null);
      setLoading(false);
      if (!th.title) void refreshTitle(th);
      // A turn is writing into it now: what is kept is already current.
      if (th.turn) return;
      void reload(th, th.messages.length === 0).then((unanswered) => {
        if (unanswered) void pickUp(th);
      });
    },
    [hydrated, pickUp, refreshTitle, reload, show],
  );

  /**
   * A message typed while the turn waits on Goose's questions. It goes now rather than behind the
   * turn: the Pond takes it as the answer, says so in a two-frame stream and starts no turn, and the
   * waiting turn carries on in its own stream. Should the batch have closed meanwhile, the Pond
   * answers it as an ordinary turn, which is drawn as one.
   */
  const answerWaiting = useCallback(
    async (th: Thread, session: string, question: Message, text: string, options: SendOptions): Promise<string | null> => {
      th.messages = [...th.messages, question];
      changed(th);
      let answered: string | null | undefined;
      const frames: ChatFrame[] = [];
      try {
        await api.streamChat(streamBody(text, [], options, session), (frame) => {
          const said = questionAnswered(frame);
          if (said !== undefined) answered = answered ?? said;
          else frames.push(frame);
        });
      } catch (e) {
        logFailure('chat', 'answer to waiting questions failed', e);
      }
      if (answered !== undefined) {
        markAskAnswered(session, { batchId: answered, text });
        return null;
      }
      // Not taken as an answer: the bubble goes, and the message is asked as an ordinary turn.
      th.messages = th.messages.filter((m) => m.id !== question.id);
      changed(th);
      if (frames.some((f) => f.type === 'text' || f.type === 'tool_call')) {
        void reload(th, false);
        return null;
      }
      return queue.submit({ kind: 'ask', thread: th, question, text, attachments: [], options });
    },
    [queue, reload],
  );

  const send = useCallback(
    (text: string, attachments: Attachment[] = [], options: SendOptions = {}) => {
      const trimmed = text.trim();
      if (!trimmed && attachments.length === 0) return Promise.resolve(null);
      const th = viewRef.current;
      const question = questionFor(nextLocalId(), trimmed, attachments);
      if (trimmed && attachments.length === 0 && th.session && isScreenRealRef.current('chat') && waitingAsk(th)) {
        return answerWaiting(th, th.session, question, trimmed, options);
      }
      return queue.submit({
        kind: 'ask',
        thread: th,
        question,
        text: trimmed,
        attachments,
        options,
      });
    },
    [answerWaiting, queue],
  );

  const answerOffer = useCallback(
    async (messageId: string, take: boolean) => {
      const th = viewRef.current;
      const id = th.session;
      const offer = th.messages.find((m) => m.id === messageId)?.note?.offer;
      if (!id || !offer || offer.state !== 'open') return;
      try {
        const answer = await api.answerOffer(id, messageId, take);
        const state = answer?.state === 'done' || answer?.state === 'dismissed' ? answer.state : take ? 'done' : 'dismissed';
        th.messages = th.messages.map((m) => (m.id === messageId && m.note ? { ...m, note: withOfferState(m.note, state) } : m));
        changed(th);
        if (take) void send((typeof answer?.prompt === 'string' && answer.prompt.trim()) || offer.prompt);
      } catch (e) {
        // Answered already, here or on another screen: the saved message says how.
        if (e instanceof ApiError && e.status === 409) {
          await reload(th, false);
          return;
        }
        sayFor(th, describeTurnError(e, t));
      }
    },
    [reload, sayFor, send, t],
  );

  const unqueue = useCallback(
    (id: string) => queue.remove((job) => job.kind === 'ask' && job.question.id === id),
    [queue],
  );

  const stop = useCallback(() => {
    queue.clear();
    const turn = viewRef.current.turn;
    if (turn) chatRuns.stop(turn.key);
  }, [queue]);

  // Starting another conversation is not stopping this one. A reply still being
  // written carries on into its thread; only what was queued and not yet asked
  // is dropped, as stopping drops it.
  const newConversation = useCallback(() => {
    queue.clear();
    setQueue(makeQueue());
    const turn = viewRef.current.turn;
    if (turn) chatRuns.mute(turn.key);
    show(newThread());
    setError(null);
    setLoading(false);
    setTurnSeed(Date.now());
  }, [makeQueue, queue, show]);

  /**
   * Both write the name to the Pond first and show it only once the Pond has it, so the bar never
   * names a conversation something the wall will not. A hand-typed name is one the Pond's idle
   * renaming leaves alone; asking Goose replaces even that, since asking is consent.
   */
  const rename = useCallback(
    async (title: string): Promise<string | null> => {
      const th = viewRef.current;
      const next = title.trim();
      if (!th.session) return t('chat.rename.notYet');
      if (!next) return t('chat.rename.nameRequired');
      try {
        await api.renameSession(th.session, next);
      } catch (e) {
        logFailure('chat', 'conversation not renamed', e);
        return describeApiError(e) ?? t('chat.rename.failed');
      }
      th.title = next;
      changed(th);
      return null;
    },
    [t],
  );

  const nameForMe = useCallback(async (): Promise<string | null> => {
    const th = viewRef.current;
    if (!th.session) return t('chat.rename.notYet');
    try {
      const result = await api.retitleSession(th.session);
      const named = result.title?.trim();
      if (result.outcome !== 'retitled' || !named) {
        console.warn(`[chat] goose kept the name outcome=${result.outcome} reason=${result.reason ?? 'none'}`);
        return t('chat.rename.kept');
      }
      th.title = named;
      changed(th);
      return null;
    } catch (e) {
      logFailure('chat', 'conversation not named by goose', e);
      return describeApiError(e) ?? t('chat.rename.failed');
    }
  }, [t]);

  const dismissError = useCallback(() => setError(null), []);

  const watch = useCallback(() => {
    setWatched(true);
    return () => setWatched(false);
  }, []);

  return {
    data: {
      messages: thread.messages,
      queued,
      sessionId: thread.session,
      title: thread.title ?? titleFromThread(thread.messages),
      streaming: thread.turn !== null,
      status: thread.status,
      turnSeed,
    },
    loading,
    error,
    actions: { send, unqueue, stop, newConversation, open, answerOffer, rename, nameForMe, dismissError, watch },
  };
}
