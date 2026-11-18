/**
 * Turns in flight, held apart from the screen that asked them.
 *
 * A conversation used to own its turn's stream and give it up on the way out.
 * The Pond kept answering, but nothing on the phone could see the answer end:
 * the wall could not say a reply was coming, a reopened conversation showed the
 * question with nothing under it, and nobody could be told it was done. Held
 * here, the stream outlives the screen, and all three are read off it.
 *
 * The Pond already keeps a resumable turn running without a reader, replays it
 * from any frame (`/chat/runs/{id}/events`) and finds it by its conversation
 * (`/sessions/{id}/active-run`). What it does not do is say a turn ended:
 * nothing on the notification stream and no push. So a phone the OS has
 * suspended learns of the end when it comes back, not before.
 */

import { AppState } from 'react-native';

import type { CardHint, Message, ToolCall } from '@/models/chat';
import { readReceipt, withReceipt } from '@/models/message-note';
import { isAskTool } from '@/models/questions';

import { ApiError, api } from './api-client';
import { rememberCard } from './card-cache';
import type { TurnNotice } from './reply-notices';
import { StreamStalledError } from './sse';
import type { ChatFrame, ChatStreamRequest } from './types';

/** Reattaching after a drop: how many times, and how long to wait before each. */
const REATTACH_DELAYS_MS = [800, 2000, 4000];

/**
 * How often a growing reply reaches the screen. Tokens arrive faster than a
 * reader can see them change, and each update re-renders the thread.
 */
const FLUSH_MS = 50;

/** A dropped connection, as distinct from the Pond refusing: worth reattaching. */
export function isDrop(e: unknown): boolean {
  if (e instanceof StreamStalledError) return true;
  if (e instanceof ApiError) return false;
  return e instanceof TypeError || (e instanceof Error && /network|connection|socket/i.test(e.message));
}

/** The `ask` calls a reply is still waiting on, so a reattached stream that resumes past them knows. */
export function waitingAsks(reply: Message): ReadonlySet<string> {
  return new Set((reply.tools ?? []).filter((t) => t.status === 'running' && isAskTool(t.name)).map((t) => t.id));
}

/**
 * Whether a frame says a typed message was taken as the answer to a waiting question batch, and
 * which: the batch's id, or null where only the `done` frame said so. Undefined otherwise.
 */
export function questionAnswered(frame: ChatFrame): string | null | undefined {
  if (frame.type === 'question_answered') return frame.batch_id?.trim() || null;
  if (frame.done === true && frame.question_answered === true) return null;
  return undefined;
}

/** The card a tool result asks to be drawn as, when it asks. */
export function cardOf(frame: ChatFrame): CardHint | undefined {
  return frame.ui?.card_type && frame.ui.data ? { type: frame.ui.card_type, data: frame.ui.data } : undefined;
}

/** The card worth keeping on this phone: none for a result the Pond marks transient. */
export function cardToKeep(frame: ChatFrame): CardHint | undefined {
  return frame.transient === true ? undefined : cardOf(frame);
}

/**
 * One frame, folded into the reply it belongs to. Pure, so a turn can be
 * replayed in a test exactly as it arrived.
 */
export function applyFrame(reply: Message, frame: ChatFrame): Message {
  switch (frame.type) {
    case 'text':
      return frame.content ? { ...reply, content: reply.content + frame.content } : reply;
    case 'review_revision':
      // A review pass rewrote the answer; what streamed before is superseded.
      return typeof frame.content === 'string' ? { ...reply, content: frame.content } : reply;
    case 'thinking':
      return frame.content ? { ...reply, thinking: [...(reply.thinking ?? []), frame.content] } : reply;
    case 'tool_call': {
      if (!frame.tool || !frame.id) return reply;
      const tools = reply.tools ?? [];
      if (tools.some((t) => t.id === frame.id)) return reply;
      const call: ToolCall = {
        id: frame.id,
        name: frame.tool,
        args: frame.input === undefined || frame.input === null ? '{}' : JSON.stringify(frame.input),
        status: 'running',
      };
      const worked = frame.working_notes ? setNotesAside(reply, frame.working_notes) : reply;
      return { ...worked, tools: [...tools, call], stepFrom: worked.content.length };
    }
    case 'tool_result': {
      if (!frame.id) return reply;
      const tools = reply.tools ?? [];
      const card = cardOf(frame);
      const done = (call: ToolCall): ToolCall => ({
        ...call,
        status: 'ok',
        result: frame.content ?? call.result,
        card: card ?? call.card,
      });
      const known = tools.find((t) => t.id === frame.id);
      // A replayed result brings its receipt a second time; the call it answered is already done.
      const receipt = known && known.status !== 'running' ? null : readReceipt(frame.receipt);
      const noted = receipt ? { ...reply, note: withReceipt(reply.note, receipt) } : reply;
      if (known) {
        return { ...noted, tools: tools.map((t) => (t.id === frame.id ? done(t) : t)) };
      }
      // A result for a call this reply never saw — joined mid-turn. Keep it.
      return {
        ...noted,
        tools: [...tools, done({ id: frame.id, name: frame.tool ?? '', args: '{}', status: 'ok' })],
      };
    }
    default:
      return reply;
  }
}

/**
 * Working notes out of the answer and into the steps. The Pond's notes are the
 * text since the last tool call, so they end the answer; should they not, that
 * text is what goes.
 */
function setNotesAside(reply: Message, notes: string): Message {
  const content = reply.content.endsWith(notes)
    ? reply.content.slice(0, reply.content.length - notes.length)
    : reply.content.slice(0, reply.stepFrom ?? 0);
  const step = notes.trim();
  return { ...reply, content, steps: step ? [...(reply.steps ?? []), step] : reply.steps };
}

/** Whether a frame says what Goose is doing; `statusFor` in use-chat words it. */
function saysWhatItIsDoing(frame: ChatFrame): boolean {
  if (frame.type === 'status' || frame.type === 'review_status') return Boolean(frame.content);
  return frame.type === 'tool_call' && Boolean(frame.tool);
}

/** How a turn ended. `lost` is the connection going and not coming back, not the turn. */
export type TurnOutcome = 'done' | 'failed' | 'stopped' | 'lost';

/** A turn as its readers see it. Replaced on every change, never mutated. */
export interface LiveTurn {
  key: string;
  /** Null until the Pond names a new conversation. */
  sessionId: string | null;
  /** The reply so far, `pending` until the turn ends. */
  reply: Message;
  /** The latest frame saying what Goose is doing, cleared once it writes. */
  status: ChatFrame | null;
  /** What the Pond sent as an error frame, when it did. */
  errorText: string | null;
  outcome: TurnOutcome | null;
}

export interface TurnEnd {
  key: string;
  outcome: TurnOutcome;
  sessionId: string | null;
  reply: Message;
  /** Thrown rather than sent: a refusal, or the stream failing outright. */
  error: unknown;
  errorText: string | null;
  /** The Pond no longer held every frame, so the saved conversation is the better copy. */
  stale: boolean;
  /** The Pond had forgotten the run, which it does only once it has ended (404). */
  gone: boolean;
}

export interface TurnHandle {
  key: string;
  ended: Promise<TurnEnd>;
}

export interface StartTurn {
  body: ChatStreamRequest;
  /** What the conversation is called, should its end be announced. */
  title?: string | null;
  /** The reply so far, each time it grows; voice mode speaks it. */
  onText?: (text: string) => void;
}

export interface ChatRunsDeps {
  api: Pick<typeof api, 'streamChat' | 'reattachRun' | 'cancelRun' | 'activeRun' | 'listSessionMessages'>;
  /** Someone could be reading the screen. */
  onScreen: () => boolean;
  /** Settles once the app is no longer in the background. */
  untilForeground: () => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  keepCard: (sessionId: string, callId: string, card: CardHint) => void;
}

interface Held {
  view: LiveTurn;
  controller: AbortController;
  runId: string | null;
  epoch: number | string | undefined;
  seq: number;
  done: boolean;
  failed: boolean;
  stale: boolean;
  /** Followed from a run already running, rather than asked here. */
  resumed: boolean;
  title: string | null;
  onText?: (text: string) => void;
  /** Cards that landed before the Pond named a new conversation. */
  unnamed: Map<string, CardHint>;
  ended: Promise<TurnEnd>;
  flushTimer: ReturnType<typeof setTimeout> | null;
}

type Open = (onFrame: (frame: ChatFrame) => void, signal: AbortSignal) => Promise<void>;

const NOTHING: ReadonlySet<string> = new Set();

export class ChatRuns {
  private turns = new Map<string, Held>();
  private bySession = new Map<string, string>();
  private answeringNow: ReadonlySet<string> = NOTHING;
  /** Conversations on screen, counted: a screen arriving can focus before the one leaving blurs. */
  private viewing = new Map<string, number>();
  private listeners = new Set<() => void>();
  private announcers = new Set<(notice: TurnNotice) => void>();
  private nextKey = 0;

  constructor(private deps: ChatRunsDeps) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Hear of every turn that ends while nobody is reading it. The notification
   * provider presents them, beside everything else that reaches the shade.
   */
  onAnnounce = (announcer: (notice: TurnNotice) => void): (() => void) => {
    this.announcers.add(announcer);
    return () => {
      this.announcers.delete(announcer);
    };
  };

  /** The conversations a turn is running in. The same set until one starts or ends. */
  answering = (): ReadonlySet<string> => this.answeringNow;

  get(key: string): LiveTurn | undefined {
    return this.turns.get(key)?.view;
  }

  forSession(sessionId: string): TurnHandle | null {
    const key = this.bySession.get(sessionId);
    return key ? this.handle(key) : null;
  }

  start({ body, title, onText }: StartTurn): TurnHandle {
    return this.hold(body.session_id ?? null, title ?? null, null, onText, (onFrame, signal) =>
      this.deps.api.streamChat(body, onFrame, signal),
    );
  }

  /**
   * The turn running in a conversation: the one this phone holds, or else one
   * it asked before the app was last closed. Only for a conversation that ends
   * in an unanswered question. Held, it costs nothing; otherwise one request to
   * find the run, and one to follow it if it is still running.
   */
  async resume(sessionId: string, title?: string | null): Promise<TurnHandle | null> {
    const held = this.forSession(sessionId);
    if (held) return held;
    let run;
    try {
      run = await this.deps.api.activeRun(sessionId);
    } catch {
      return null;
    }
    if (!run || run.state !== 'running') return this.forSession(sessionId);
    // Another screen may have started following it while this one asked.
    const raced = this.forSession(sessionId);
    if (raced) return raced;
    const { run_id: runId, epoch } = run;
    return this.hold(sessionId, title ?? null, { runId, epoch }, undefined, (onFrame, signal) =>
      this.deps.api.reattachRun(runId, 0, epoch, onFrame, signal),
    );
  }

  /** Stop a turn on the Pond as well as here. What already arrived stays. */
  stop(key: string): void {
    const held = this.turns.get(key);
    if (!held) return;
    if (held.runId) void this.deps.api.cancelRun(held.runId).catch(() => {});
    held.controller.abort();
  }

  /** Signing out: let every stream go, unannounced. The Pond finishes its turns on its own. */
  dropAll(): void {
    for (const held of this.turns.values()) {
      held.onText = undefined;
      held.controller.abort();
    }
  }

  /** The screen that asked has gone: keep the turn, stop speaking it. */
  mute(key: string): void {
    const held = this.turns.get(key);
    if (held) held.onText = undefined;
  }

  /** A conversation is on screen until the returned release is called. */
  view(sessionId: string): () => void {
    this.viewing.set(sessionId, (this.viewing.get(sessionId) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const left = (this.viewing.get(sessionId) ?? 1) - 1;
      if (left > 0) this.viewing.set(sessionId, left);
      else this.viewing.delete(sessionId);
    };
  }

  private looking(sessionId: string): boolean {
    return this.viewing.has(sessionId) && this.deps.onScreen();
  }

  private handle(key: string): TurnHandle | null {
    const held = this.turns.get(key);
    return held ? { key, ended: held.ended } : null;
  }

  private hold(
    sessionId: string | null,
    title: string | null,
    run: { runId: string; epoch: string } | null,
    onText: ((text: string) => void) | undefined,
    open: Open,
  ): TurnHandle {
    const key = `turn-${++this.nextKey}`;
    // `ended` is the one field that needs the turn to exist first.
    const held = {
      view: {
        key,
        sessionId: null,
        reply: { id: key, role: 'assistant', content: '', timestamp: Date.now(), pending: true },
        status: null,
        errorText: null,
        outcome: null,
      },
      controller: new AbortController(),
      runId: run?.runId ?? null,
      epoch: run?.epoch,
      seq: 0,
      done: false,
      failed: false,
      stale: false,
      resumed: run !== null,
      title,
      onText,
      unnamed: new Map(),
      flushTimer: null,
    } as Held;
    this.turns.set(key, held);
    if (sessionId) this.name(held, sessionId);
    held.ended = this.follow(held, open);
    return { key, ended: held.ended };
  }

  private name(held: Held, sessionId: string): void {
    if (held.view.sessionId === sessionId) return;
    held.view = { ...held.view, sessionId };
    this.bySession.set(sessionId, held.view.key);
    for (const [callId, card] of held.unnamed) this.deps.keepCard(sessionId, callId, card);
    held.unnamed.clear();
    this.recount();
  }

  private onFrame(held: Held, frame: ChatFrame): void {
    if (frame.seq !== undefined) held.seq = Math.max(held.seq, frame.seq);
    if (frame.type === 'run_started' || frame.type === 'reattached') {
      if (frame.run_id) held.runId = frame.run_id;
      if (frame.epoch !== undefined) held.epoch = frame.epoch;
      if (frame.session_id) this.name(held, frame.session_id);
      this.emit();
      return;
    }
    if (frame.done) {
      held.done = true;
      if (frame.session_id) this.name(held, frame.session_id);
      return;
    }
    if (!frame.type && frame.error) {
      // Terminal when nothing follows it; either way it is the thing to say.
      held.failed = true;
      held.view = { ...held.view, errorText: frame.error };
      this.schedule(held);
      return;
    }
    if (frame.type === 'replay_gap' || frame.type === 'run_evicted') {
      // The frames between are gone from the Pond's memory; the saved turn has them.
      held.stale = true;
      return;
    }
    const before = held.view.reply;
    const reply = applyFrame(before, frame);
    if (frame.type === 'tool_result' && frame.id) {
      const card = cardToKeep(frame);
      if (card) this.keep(held, frame.id, card);
    }
    const status = saysWhatItIsDoing(frame)
      ? frame
      : frame.type === 'text' || frame.type === 'review_revision'
        ? null
        : held.view.status;
    held.view = { ...held.view, reply, status };
    if (reply.content !== before.content) held.onText?.(reply.content);
    this.schedule(held);
  }

  // Cards reach the phone on the stream and nowhere else, so each is kept as it lands.
  private keep(held: Held, callId: string, card: CardHint): void {
    const session = held.view.sessionId;
    if (session) this.deps.keepCard(session, callId, card);
    else held.unnamed.set(callId, card);
  }

  private async follow(held: Held, open: Open): Promise<TurnEnd> {
    const { signal } = held.controller;
    const onFrame = (frame: ChatFrame) => this.onFrame(held, frame);
    let lost = false;
    let gone = false;
    let error: unknown = null;
    try {
      try {
        await open(onFrame, signal);
      } catch (e) {
        // A run looked up and gone before its first frame is gone as a reattach finds it.
        if (held.resumed && e instanceof ApiError) return this.finish(held, 'lost', null, e.status === 404);
        if (!isDrop(e)) throw e;
        lost = true;
      }
      // Ended without a `done`: the connection went, not the turn.
      if (!held.done && !held.failed && !signal.aborted) lost = true;

      for (const wait of REATTACH_DELAYS_MS) {
        if (!lost || !held.runId || signal.aborted) break;
        // Every attempt from a suspended app fails, so none is spent until it is back.
        await this.deps.untilForeground();
        await this.deps.sleep(wait);
        if (signal.aborted) break;
        try {
          const asks = waitingAsks(held.view.reply);
          await this.deps.api.reattachRun(held.runId, held.seq, held.epoch, onFrame, signal, ...(asks.size > 0 ? [asks] : []));
          lost = !held.done && !held.failed;
        } catch (e) {
          // 404 is a run finished long enough ago to be forgotten; 410, a Pond that restarted.
          if (e instanceof ApiError) {
            gone = e.status === 404;
            break;
          }
          if (!isDrop(e)) throw e;
        }
      }
    } catch (e) {
      error = e;
    }
    const outcome: TurnOutcome = held.done
      ? 'done'
      : signal.aborted
        ? 'stopped'
        : held.failed || error
          ? 'failed'
          : 'lost';
    return this.finish(held, outcome, error, gone);
  }

  private finish(held: Held, outcome: TurnOutcome, error: unknown, gone: boolean): TurnEnd {
    if (held.flushTimer) clearTimeout(held.flushTimer);
    held.flushTimer = null;
    const reply: Message = {
      ...held.view.reply,
      pending: false,
      // A tool that never answered by the end of the turn did not finish.
      tools: held.view.reply.tools?.map((c) => (c.status === 'running' ? { ...c, status: 'error' } : c)),
    };
    held.view = { ...held.view, reply, status: null, outcome };
    const { key, sessionId, errorText } = held.view;
    // Readers see the final reply before the turn is let go.
    this.emit();
    this.turns.delete(key);
    if (sessionId && this.bySession.get(sessionId) === key) this.bySession.delete(sessionId);
    this.recount();
    const end: TurnEnd = { key, outcome, sessionId, reply, error, errorText, stale: held.stale, gone };
    void this.tell(held, end);
    return end;
  }

  /** Say a turn ended, to someone who is not reading it. Stopping one is never news. */
  private async tell(held: Held, end: TurnEnd): Promise<void> {
    const { sessionId } = end;
    if (!sessionId || !held.runId || end.outcome === 'stopped' || this.looking(sessionId)) return;
    const notice = { sessionId, runId: held.runId, title: held.title };
    if (end.outcome === 'done') {
      this.announce({ ...notice, kind: 'answered', text: end.reply.content });
      return;
    }
    if (end.outcome === 'failed') {
      this.announce({ ...notice, kind: 'failed' });
      return;
    }
    if (!end.gone) return;
    // Forgotten means it ended a while ago, but not how; the saved conversation says.
    try {
      const [last] = await this.deps.api.listSessionMessages(sessionId, 1);
      if (last?.role === 'assistant' && !this.looking(sessionId)) {
        this.announce({ ...notice, kind: 'answered', text: last.content });
      }
    } catch {
      // Nothing to say that would be true.
    }
  }

  private announce(notice: TurnNotice): void {
    for (const announcer of [...this.announcers]) announcer(notice);
  }

  private recount(): void {
    const next = new Set<string>();
    for (const held of this.turns.values()) {
      if (held.view.sessionId && !held.view.outcome) next.add(held.view.sessionId);
    }
    const same = next.size === this.answeringNow.size && [...next].every((id) => this.answeringNow.has(id));
    if (same) return;
    this.answeringNow = next.size ? next : NOTHING;
    this.emit();
  }

  private schedule(held: Held): void {
    if (held.flushTimer) return;
    held.flushTimer = setTimeout(() => {
      held.flushTimer = null;
      this.emit();
    }, FLUSH_MS);
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

function untilForeground(): Promise<void> {
  if (AppState.currentState !== 'background') return Promise.resolve();
  return new Promise((resolve) => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') return;
      sub.remove();
      resolve();
    });
  });
}

/** The one the app uses. Tests build their own with fakes. */
export const chatRuns = new ChatRuns({
  api,
  // `unknown` too: an Android cold start can read it while the screen is plainly on show.
  onScreen: () => AppState.currentState === 'active' || AppState.currentState === 'unknown',
  untilForeground,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  keepCard: (sessionId, callId, card) => void rememberCard(sessionId, callId, card),
});
