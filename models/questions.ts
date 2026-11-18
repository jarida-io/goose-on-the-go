// Goose's structured questions (pond docs/architecture/structured-questions.md): each with a header
// chip, 2 to 4 options with descriptions and an optional preview, and Goose's pick. The same shape
// arrives from `/me/questions` with ids and from the chat's `giap-questions__ask` call without them.
// Every reader here is tolerant: older rows hold options as plain strings.

import { formatMoney, list, oneOf, pondPath, readAll, readMoney, record, text, textOrNull, webUrl } from './me-read';

export type QuestionPurpose = 'anchor' | 'interest' | 'profile' | 'ledger' | 'chat';
export type BatchState = 'open' | 'waiting';

const PURPOSES: readonly QuestionPurpose[] = ['anchor', 'interest', 'profile', 'ledger', 'chat'];
const STATES: readonly BatchState[] = ['open', 'waiting'];

/** The chat tool whose call draws a question card in place. */
export const ASK_TOOL = 'giap-questions__ask';

/** The limits the Pond sets on a table preview; anything past them would not fit a phone anyway. */
const TABLE_COLUMNS = 4;
const TABLE_ROWS = 6;
const DRAFT_CHARS = 600;

export type QuestionPreview =
  | { kind: 'draft'; text: string }
  // Only a picture the Pond serves: the phone never fetches from the place's own site.
  | { kind: 'place'; name: string; price: string | null; url: string | null; imagePath: string | null }
  | { kind: 'table'; columns: string[]; rows: string[][] };

export interface QuestionOption {
  label: string;
  /** What choosing it means, in one line; empty in older rows. */
  description: string;
  preview: QuestionPreview | null;
}

/** A question as the model asks it in chat, before the Pond has stored it. */
export interface AskedQuestion {
  /** A chip of at most 12 characters; empty in older rows. */
  header: string;
  text: string;
  /** Never "Other": every surface offers that itself. */
  options: QuestionOption[];
  /** The index in `options` of Goose's pick. */
  recommended: number | null;
  multi: boolean;
}

export interface Question extends AskedQuestion {
  id: string;
}

export interface QuestionBatch {
  id: string;
  purpose: QuestionPurpose;
  anchorId: string | null;
  /** The chat a `chat` batch was asked in. */
  sessionId: string | null;
  round: number;
  /** The plan's or the chat's title. */
  title: string;
  /** `waiting`: asked in a chat turn that stopped waiting for the answer. */
  state: BatchState;
  questions: Question[];
}

/** An option as a list shows it: Goose's pick first and marked. */
export interface ShownOption {
  option: QuestionOption;
  recommended: boolean;
}

/** A cell of a table: words or a number, as the Pond wrote it. */
function cell(raw: unknown): string {
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return text(raw);
}

/** A price the Pond may write as words, a number or `{amount, currency}`. */
function price(raw: unknown): string | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  const money = readMoney(raw);
  return money ? formatMoney(money) : textOrNull(raw);
}

export function readPreview(raw: unknown): QuestionPreview | null {
  const r = record(raw);
  switch (r?.kind) {
    case 'draft': {
      const words = text(r.text);
      return words ? { kind: 'draft', text: words.length > DRAFT_CHARS ? `${words.slice(0, DRAFT_CHARS).trimEnd()}…` : words } : null;
    }
    case 'place': {
      const name = text(r.name);
      return name ? { kind: 'place', name, price: price(r.price), url: webUrl(r.url), imagePath: pondPath(r.image_url) } : null;
    }
    case 'table': {
      const columns = list(r.columns).map(cell).slice(0, TABLE_COLUMNS);
      const rows = list(r.rows)
        .map((row) => list(row).map(cell).slice(0, columns.length))
        .filter((row) => row.some(Boolean))
        .slice(0, TABLE_ROWS);
      return columns.length > 0 && rows.length > 0 ? { kind: 'table', columns, rows } : null;
    }
    default:
      return null;
  }
}

/** An option from an object, or from a plain string as older rows hold it. */
export function readOption(raw: unknown): QuestionOption | null {
  if (typeof raw === 'string') {
    const label = raw.trim();
    return label ? { label, description: '', preview: null } : null;
  }
  const r = record(raw);
  const label = text(r?.label);
  return label ? { label, description: text(r?.description), preview: readPreview(r?.preview) } : null;
}

const key = (label: string) => label.trim().toLowerCase();

export function readAskedQuestion(raw: unknown): AskedQuestion | null {
  const r = record(raw);
  const words = text(r?.text);
  if (!r || !words) return null;
  const all = list(r.options).map(readOption);
  const pick = typeof r.recommended === 'number' && Number.isInteger(r.recommended) ? all[r.recommended] : null;
  const seen = new Set<string>();
  // "Other" is the screen's, and a repeated label could never be told apart in an answer.
  const options = all.filter((o): o is QuestionOption => {
    if (!o || key(o.label) === 'other' || seen.has(key(o.label))) return false;
    seen.add(key(o.label));
    return true;
  });
  const recommended = pick ? options.indexOf(pick) : -1;
  return { header: text(r.header), text: words, options, recommended: recommended >= 0 ? recommended : null, multi: r.multi === true };
}

export function readQuestion(raw: unknown): Question | null {
  const id = text(record(raw)?.id);
  const asked = readAskedQuestion(raw);
  return id && asked ? { id, ...asked } : null;
}

export function readQuestionBatch(raw: unknown): QuestionBatch | null {
  const r = record(raw);
  const id = text(r?.id);
  if (!r || !id) return null;
  const questions = readAll(r.questions, 'questions', readQuestion);
  if (questions.length === 0) return null;
  const round = typeof r.round === 'number' && Number.isFinite(r.round) && r.round > 0 ? Math.floor(r.round) : 1;
  return {
    id,
    // An unknown purpose reads as the profile's, which asks nothing of a plan or a chat.
    purpose: oneOf(r.purpose, PURPOSES, 'profile'),
    anchorId: textOrNull(r.anchor_id),
    sessionId: textOrNull(r.session_id),
    round,
    title: text(r.title),
    state: oneOf(r.state, STATES, 'open'),
    questions,
  };
}

export function readQuestionBatches(raw: unknown): QuestionBatch[] {
  return readAll(raw, 'batches', readQuestionBatch);
}

/** The questions a chat `ask` call carries: its input as an object, or as the JSON text a saved turn keeps. */
export function readAskInput(raw: unknown): AskedQuestion[] {
  let input = raw;
  if (typeof raw === 'string') {
    try {
      input = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return readAll(input, 'questions', readAskedQuestion);
}

export function isAskTool(name: string): boolean {
  return name === ASK_TOOL;
}

/** The frame fields the ask watch reads; the chat stream's own type lives with the client. */
interface AskFrame {
  type?: string;
  tool?: string;
  id?: string;
}

/**
 * The `ask` calls a stream is waiting on: one is added by its `tool_call` and goes with its
 * `tool_result`. While any is held, the Pond is silent by design for up to 10 minutes.
 */
export function watchAsks(held: ReadonlySet<string>, frame: AskFrame): ReadonlySet<string> {
  if (!frame.id) return held;
  if (frame.type === 'tool_call' && frame.tool && isAskTool(frame.tool) && !held.has(frame.id)) return new Set([...held, frame.id]);
  if (frame.type === 'tool_result' && held.has(frame.id)) {
    const next = new Set(held);
    next.delete(frame.id);
    return next;
  }
  return held;
}

/** The options in the order a card lists them: Goose's pick first. */
export function shownOptions(question: AskedQuestion): ShownOption[] {
  const all = question.options.map((option, i) => ({ option, recommended: i === question.recommended }));
  return [...all.filter((o) => o.recommended), ...all.filter((o) => !o.recommended)];
}

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The stored batch a chat `ask` call made. The Pond may have refused some of the questions, so a
 * batch whose every question was asked matches; the one keeping the most of them wins, newest first.
 */
export function matchBatch(batches: readonly QuestionBatch[], asked: readonly AskedQuestion[]): QuestionBatch | null {
  let best: QuestionBatch | null = null;
  for (const batch of batches) {
    if (batch.purpose !== 'chat') continue;
    const all = batch.questions.every((q) => asked.some((a) => sameText(a.text, q.text)));
    if (all && (!best || batch.questions.length > best.questions.length)) best = batch;
  }
  return best;
}

/** How a finished `ask` call ended, from the text the tool returned to the model. */
export type AskResult = { kind: 'answers'; lines: AnswerLine[] } | { kind: 'enough' } | { kind: 'waiting' } | { kind: 'other' };

const ENOUGH = /^the member wants you to go ahead with what you have/i;
const WAITING = /^not answered yet/i;

export function readAskResult(result: string | undefined, asked: readonly AskedQuestion[]): AskResult {
  const words = (result ?? '').trim();
  if (ENOUGH.test(words)) return { kind: 'enough' };
  if (WAITING.test(words)) return { kind: 'waiting' };
  const lines = readAnswerLines(words, asked);
  return lines.length > 0 ? { kind: 'answers', lines } : { kind: 'other' };
}

/** One answered question as a card shows it in place of the questions. */
export interface AnswerLine {
  header: string;
  answer: string;
}

/**
 * The answers a finished `ask` call returned (`Dates: 12-15 Dec`), as a saved turn keeps them.
 * Only lines naming an asked header count, so a refusal or the "not answered yet" note reads as none.
 */
export function readAnswerLines(result: string | undefined, asked: readonly AskedQuestion[]): AnswerLine[] {
  const headers = asked.map((q) => q.header || q.text).filter(Boolean);
  return (result ?? '').split('\n').flatMap((line) => {
    const at = line.indexOf(':');
    if (at <= 0) return [];
    const header = line.slice(0, at).trim();
    const answer = line.slice(at + 1).trim();
    return answer && headers.some((h) => sameText(h, header)) ? [{ header, answer }] : [];
  });
}
