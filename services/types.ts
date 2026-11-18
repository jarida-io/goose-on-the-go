/**
 * Wire types for the Pond REST API.
 *
 * Ported from `pond-desktop/src/api/types.ts` in the goose-in-a-pond repo, which
 * is the reference client for this same backend. Keeping the two in step matters
 * more than keeping either tidy: a field that drifts here is a field the server
 * sends and this app silently ignores.
 *
 * These are the shapes on the wire, in the server's own snake_case. They are
 * deliberately separate from the display-shaped types in `models/`, which carry
 * pre-rendered strings like `time: '2 days ago'` for the UI. Reconciling those
 * two is the subject of issues #12, #14 and #15, not this file.
 */

// ── Devices ───────────────────────────────────────────────────

import type { ReportImage, ReportOption } from '@/models/web-watches';

export interface Device {
  id: string;
  name: string;
  device_type?: string;
  hostname?: string;
  /** The room it is in, one of `GET /rooms`; null or absent when it is in none. */
  room_id?: string | null;
  /**
   * A Pond from before rooms had ids named a device's room in free text. Read only to show those
   * rooms; nothing writes it.
   */
  room?: string;
  is_online: boolean;
  last_seen?: string;
  /**
   * What the device can be told to do, in `set_device_state`'s verbs — `power`,
   * `brightness`, `fan_speed` and the rest.
   *
   * This is what gates the UI. A contact sensor's list is empty, and that is the
   * fact that stops it being offered a power button. An unmapped device arrives
   * typed `matter` with nothing here, which means show no controls, not an error.
   */
  capabilities?: string[];
  ip_address?: string;
  metadata?: Record<string, unknown>;
}

/**
 * One frame of `GET /devices/events`. A state change is sent when the device itself reports it, so
 * it is a confirmation, not an echo of a command. `resync` means the phone fell too far behind to
 * resume, and should read everything once.
 */
export type DeviceEvent =
  | { type: 'device_state'; seq: number; device_id: string; key: string; value: boolean | number | string; changed_at: string }
  | { type: 'device'; seq: number; change: 'added' | 'updated' | 'removed'; device: Device }
  | { type: 'resync' };

export interface CreateDeviceRequest {
  id?: string;
  name: string;
  device_type: string;
  hostname?: string;
  capabilities?: string[];
  room?: string;
}

/**
 * `PUT /devices/{id}`. An omitted field keeps its stored value; a blank `hostname` or `room` clears
 * it. The Pond refuses a blank name with 400, and a paired phone's row for any caller but that
 * phone or the host with 403 `device_not_yours`.
 */
/**
 * A room the household named (`GET /rooms`). It lasts on its own, so it can be made before any
 * device is in it; the Pond refuses to delete one that still has devices.
 */
export interface Room {
  id: string;
  name: string;
  created_at?: string;
}

/**
 * A device the Pond can see on the network, waiting to be added (`GET /devices/discovered`). Matter
 * never advertises a setup code, so one of these still needs the code from its box: the entry only
 * helps match the device in hand to the code.
 */
export interface DiscoveredDevice {
  device_identifier: string;
  discriminator?: number | null;
  vendor_id?: number | null;
  product_id?: number | null;
  /** Matter's numeric device type, e.g. 0x0101 for a dimmable light. */
  device_type?: number | null;
  name?: string | null;
  addresses?: { ip: string; port: number }[];
}

/** Fields left out keep their values; `room_id: null` takes the device out of every room. */
export interface UpdateDeviceRequest {
  name: string;
  hostname?: string;
  room_id?: string | null;
}

export interface CommissionDeviceRequest {
  /** QR payload (`MT:…`), an 11/21-digit manual code, or a bare 8-digit passcode. */
  code: string;
  name?: string;
}

export interface CommissionDeviceResponse {
  id: string;
  name: string;
  node_id: string;
}

/**
 * A device-state change, in `set_device_state`'s own field names.
 *
 * Deliberately a flat optional-field struct rather than `{verb, value}`. The
 * verb/value model is the controller-facing WebSocket protocol between the Pond
 * and its Matter sidecar; a client never speaks it.
 *
 * Every field is a GIAP unit, not a device one — the controller converts, and
 * reads back what the device actually did.
 */
export interface DeviceStatePatch {
  /** 0-100 percent. */
  brightness?: number;
  /** Degrees Celsius. */
  target_temp?: number;
  locked?: boolean;
  power?: boolean;
  /** Hue degrees 0-360. */
  hue?: number;
  /** 0-100 percent. */
  saturation?: number;
  /** Kelvin, roughly 2000 (warm) to 6500 (daylight). Not the same control as hue. */
  color_temp?: number;
  /** 0-100 percent. */
  volume?: number;
  /** 0-100 percent. */
  fan_speed?: number;
  /** off, low, medium, high, on, auto, smart. Preferred when a mode is named. */
  fan_mode?: string;
  /** 0-100 percent open, where 100 is fully open. */
  position?: number;
  /** Slat angle 0-100. Distinct from position: a blind can be down with slats open. */
  tilt?: number;
  /** Open or shut a valve. Not `power` — a valve has no on/off switch. */
  valve?: boolean;
}

/**
 * What `POST /tools/invoke` answers.
 *
 * Deliberately untyped beyond this: an MCP tool result carries text, because
 * its first consumer is a language model. A client reading state out of it is
 * parsing prose, which is why only the narrowest possible field is read.
 */
export interface ToolCallResult {
  content: string;
  success: boolean;
}

export interface MatterStatus {
  enabled: boolean;
  url: string;
  /** `connecting` can last minutes on first use while the controller installs itself. */
  state: 'disabled' | 'connecting' | 'connected' | 'unreachable';
  /** Present only when `state` is `unreachable`. */
  error?: string;
}

// ── Sessions ──────────────────────────────────────────────────

/** `POST /api/v1/chat` — one whole turn, not a stream. */
export interface ChatTurn {
  session_id: string;
  response: string;
  model_role: string;
}

/** Where a conversation was begun. The Goose thread, `goose`, is where the Pond posts what it did by itself. */
export type SessionSurface = 'phone' | 'desktop' | 'cli' | 'pond' | 'room' | 'schedule' | 'goose';

export interface SessionSummary {
  id: string;
  /** Absent on a conversation begun before the Pond recorded it, which `?surface=unknown` matches. */
  surface?: SessionSurface | null;
  /** Whether this phone began it; `?surface=here` keeps those, `elsewhere` another phone's. */
  started_here?: boolean;
  title?: string;
  /** How the conversation opened, for a history card. Absent on older servers. */
  preview?: string;
  /** A picture the Pond kept for the first page the conversation cited or read. Absent on older servers. */
  picture?: unknown;
  created_at: string;
  updated_at: string;
  message_count?: number;
  total_prompt_tokens?: number;
  total_completion_tokens?: number;
  model_name?: string;
}

export interface SessionMessageToolCall {
  id: string;
  name: string;
  arguments: string;
}

/** Persisted image on a message. `url` is relative to the API base. */
export interface SessionMessageImage {
  id: string;
  mime_type: string;
  byte_size: number;
  url: string;
}

/** What a message came from, when the Pond wrote it for itself. */
export interface MessageNoteFrom {
  kind: 'schedule' | 'reminder' | 'task' | 'lookup' | 'watch' | 'heartbeat' | 'suggestion';
  label: string;
  ref_id?: string;
}

/** Whether something a reply said it set was really set, as the tool answered. */
export interface MessageReceipt {
  kind: 'reminder' | 'todo' | 'timer' | 'schedule' | 'watch' | 'task' | 'standing';
  outcome: 'set' | 'not_set';
  what: string;
  id?: string;
  /** Why it was not set. */
  reason?: string;
}

/** Something Goose noticed and offers to do, answered at `/sessions/{id}/messages/{id}/offer`. */
export interface MessageSuggestion {
  noticed: string;
  action: string;
  /** What is sent as the person's own turn when they take the offer. */
  prompt: string;
  state: 'open' | 'done' | 'dismissed';
  suggestion_id?: string;
}

export interface MessageNote {
  from?: MessageNoteFrom;
  receipts?: MessageReceipt[];
  suggestion?: MessageSuggestion;
}

/** The Pond's answer to an offer: where it now stands, and what to send when it was taken. */
export interface OfferAnswer {
  state: MessageSuggestion['state'];
  prompt: string;
}

export interface SessionMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  created_at: string;
  /** Present on `assistant` messages that invoked tools. */
  tool_calls?: SessionMessageToolCall[];
  /** Present on `tool` messages — links back to the tool_call id. */
  tool_call_id?: string;
  images?: SessionMessageImage[];
  /**
   * Reasoning passages, in emission order. Absent rather than `[]` when nothing
   * was kept, so a turn that was never recorded stays distinguishable from one
   * that thought nothing.
   */
  thinking?: string[];
  /** `true` liked, `false` disliked, absent/null no vote. */
  liked?: boolean | null;
  /**
   * A `tool` row holding only the stub of a result the Pond does not keep. The
   * Pond puts the marker inside the JSON in `content`; this is the other place
   * a client accepts it.
   */
  transient?: boolean;
  /** Where the message came from, what it really set, and anything it offers. Stored, never inferred. */
  note?: MessageNote;
}

/**
 * One picture sent with a turn: raw base64, no `data:` prefix.
 *
 * The Pond's own limits (`image_limits.rs`): four per turn, 4 MiB each and
 * 8 MiB in all once decoded, and only JPEG, PNG, WebP, GIF or BMP.
 */
export interface ImageAttachment {
  data: string;
  mime_type: string;
}

/** A recording the model hears: a voice note's WAV, or an audio file the Pond decodes. One a turn. */
export interface AudioAttachment {
  data: string;
  mime_type: string;
  /** A file's own name, which the Pond saves in its place; a held voice note sends none. */
  name?: string;
  /** A spoken turn's words as Whisper heard them: what the model gets where it cannot hear. */
  heard_as?: string;
}

/** A PDF whose text the Pond reads out and puts after the message, under its name. */
export interface DocumentAttachment {
  data: string;
  mime_type: string;
  name: string;
}

/**
 * `POST /api/v1/chat/stream`. The only chat route that honours `images` and
 * `voice_mode`: `/chat` parses both and then drops them.
 */
export interface ChatStreamRequest {
  message: string;
  session_id?: string;
  images?: ImageAttachment[];
  audio?: AudioAttachment[];
  documents?: DocumentAttachment[];
  /** Shorter answers and no reasoning passage, because they will be spoken. */
  voice_mode?: boolean;
  /** Keep the turn running if the connection drops, so it can be reattached. */
  resumable?: boolean;
  /** The message is a research question: the Pond starts a long task on it, then acknowledges. */
  deep_research?: boolean;
  /** With `deep_research` only, and left out for `auto`, so an older Pond sees the body it knows. */
  deep_research_answer?: Exclude<AnswerShape, 'auto'>;
  /**
   * A card the member sent to chat, by kind and id. The Pond reads it as the speaker and gives
   * the turn the card's content with Goose's notes on it; an older Pond ignores the field.
   */
  card?: { kind: string; id: string };
  /** Where this phone is, by name, while the person has turned on telling Goose (`phone-place.ts`). */
  device_place?: string;
  /** Asked from a locked phone: the Pond runs the turn with no personal data or tools. */
  device_locked?: boolean;
}

/**
 * A frame of a streaming turn, as `routes.rs` writes it.
 *
 * Deliberately loose: most frames carry a `type`, but the two that end things
 * — `{error}` and `{done: true, …}` — carry none, and the server adds frame
 * types faster than a client needs to understand them. Anything unrecognised
 * is ignored, not rejected.
 */
export interface ChatFrame {
  type?: string;
  /** `text`, `thinking`, `status`, `review_revision`, `tool_result`. */
  content?: string;
  /** `tool_call`, `tool_result`: the full name, `extension__tool`. */
  tool?: string;
  id?: string;
  /** `tool_call`: the arguments as an object, or null. */
  input?: unknown;
  /**
   * `tool_call`, from a Pond that marks them: the `text` content sent since the
   * turn's previous tool call. Goose at work, not the answer. Absent when empty.
   */
  working_notes?: string;
  /** `tool_result`: a card hint, live only — history keeps just the text. */
  ui?: { card_type?: string; data?: Record<string, unknown> };
  /**
   * `tool_result`: the result is the turn's only. History keeps a stub in its
   * place (Brave's terms allow search results only transient storage), so the
   * phone must not keep its card either.
   */
  transient?: boolean;
  /** `tool_result`: what the call set or failed to set, as the saved reply's note will hold it. */
  receipt?: MessageReceipt;
  /** `question_answered`: the batch a message typed while a turn waited on it answered. */
  batch_id?: string;
  /** The `done` frame of such a message's stream: it answered a question and started no turn. */
  question_answered?: boolean;
  run_id?: string;
  session_id?: string;
  epoch?: number | string;
  error?: string;
  done?: boolean;
  interrupted?: boolean;
  /** Our own: the stream's `id:` line, for reattaching after a drop. */
  seq?: number;
}

/**
 * `GET /api/v1/sessions/{id}/active-run`: the conversation's latest resumable
 * turn, while the Pond still holds it (running, or finished in the last two
 * minutes). `epoch` names the Pond process, so a reattach can tell a restart
 * from an aged-out run.
 */
export interface ActiveRun {
  run_id: string;
  session_id: string;
  state: 'running' | 'finished' | 'failed' | 'cancelled';
  started_at: string;
  first_seq: number;
  last_seq: number;
  epoch: string;
}

/** `GET /api/v1/suggestions`: at most four, the Pond's own composed ones first. */
export interface Suggestion {
  id: string;
  prompt: string;
  /** Why the Pond is offering it, in its own words. */
  because: string;
  answered_by: string;
  /** Written from a memory by the Pond's idle pass, rather than a template. */
  composed: boolean;
  /** Deep operational instructions for the chat agent when this suggestion is tapped. */
  agent_notes?: string;
}

export interface SuggestionList {
  suggestions: Suggestion[];
  audience: 'personal' | 'shared';
}

export interface UsageSummary {
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  session_count: number;
}

// ── Reminders ─────────────────────────────────────────────────

/**
 * `GET /api/v1/reminders`: a dated thing the Pond lifted out of a conversation.
 *
 * There is no parsed due time on purpose. `when_said` is the conversation's own
 * words about the timing ("next Tuesday", "before the school run"), and the Pond
 * never turns them into a date, so neither does this app.
 */
export interface Reminder {
  id: string;
  /** What it is about, with no date in it. */
  about: string;
  /** The words used about when. Never parsed. */
  when_said: string;
  /** Whose reminder it is, by name. */
  subject: string;
  profile_id: string | null;
  /** When the conversation happened. */
  said_at: string;
  /** When the Pond lifted it out of that conversation. */
  captured_at: string;
  /** Always `pending` from the list route; the other values are for what dismiss returns. */
  disposition: 'pending' | 'proposed' | 'dismissed' | 'expired';
  session_id: string;
  window_id: string;
}

// ── Proposals (shown as "Suggestions") ────────────────────────

/**
 * `GET /api/v1/proposals`: something the Pond noticed and offers to do, waiting for
 * the one household member it is addressed to. Not the chat's `Suggestion`, which is
 * a question to ask and needs no decision.
 */
export interface Proposal {
  id: string;
  summary: string;
  /** Why the Pond is proposing it. A separate key so showing `summary` alone cannot pass for the reason. */
  rationale: string;
  confidence: number;
  profile_id: string | null;
  created_at: string;
  /** After this the Pond stops listing it and refuses a decision. */
  expires_at: string;
  /** What would be staged: the Pond's `TaskKind`, serde-tagged on "type". */
  proposed_action: { type: string; [field: string]: unknown };
  trigger: {
    kind: string;
    source_id: string | null;
    signal: string | null;
    observed_at: string;
  };
}

export interface ProposalList {
  profile_id: string | null;
  proposals: Proposal[];
}

/** No default on the Pond: anything else is a 400, never an approval. */
export type ProposalDecision = 'approve' | 'reject';

/** `POST /api/v1/proposals/{id}/decide`. `executed` is always false: approving runs nothing. */
export interface ProposalDecisionResult {
  id: string;
  status: string;
  executed: boolean;
}

// ── Memory ────────────────────────────────────────────────────
//
// The Pond's `MemoryFragment` (`pond-core/src/user_data/domain/memory.rs`),
// serialised as-is. The optional fields are skipped on the wire when unset:
// a fragment saved before segments existed has none of them.

/** What a memory is about. The Pond picks each one's default importance and tier. */
export type MemorySegment =
  | 'identity'
  | 'preference'
  | 'correction'
  | 'relationship'
  | 'project'
  | 'routine'
  | 'knowledge'
  | 'context';

/** How fast a memory decays: `permanent` never does, and cleanup never prunes it. */
export type MemoryTier = 'short' | 'long' | 'permanent';
export type MemoryLifecycle = 'active' | 'archived' | 'merged';

export interface MemoryFragment {
  id: string;
  profile_id: string | null;
  session_id: string | null;
  content: string;
  /** "chat", "extraction", "api", "mcp_tool", ... */
  source: string;
  tags: string[];
  created_at: string;
  segment?: MemorySegment;
  /** 0.0–1.0. */
  importance?: number;
  tier?: MemoryTier;
  decay_rate?: number;
  access_count: number;
  last_accessed_at?: string;
  lifecycle?: MemoryLifecycle;
  superseded_by?: string;
  corrects?: string;
}

/** `POST /memories`. A segment alone sets the importance and tier it implies. */
export interface SaveMemoryRequest {
  content: string;
  tags?: string[];
  source?: string;
  segment?: MemorySegment;
  importance?: number;
  tier?: MemoryTier;
}

/**
 * `PUT /memories/{id}`. A field left out stays as it is. A Pond from before
 * the tier could change ignores `tier` beside `content` and refuses it alone
 * (422), so send a tier change on its own to learn whether it took.
 */
export interface UpdateMemoryRequest {
  content?: string;
  tier?: MemoryTier;
}

/**
 * A note added to the assistant's instructions on every turn while `active`: `GET /api/v1/agent/extras`.
 * The Pond sends each one, in `sort_order` then `key` order, as its own block after its built-in
 * prompt; `key` names the block and is the note's identity.
 */
export interface PromptExtra {
  key: string;
  instruction: string;
  active: boolean;
  sort_order: number;
}

/**
 * A built-in or customized agent prompt template: `GET /api/v1/prompts`.
 * Templates include core agent identity (`soul`), autonomous pulse (`heartbeat`),
 * its rules for remembering (`scratchpad`), and tone presets (`balanced`, `concise`, etc.).
 */
export interface PromptTemplate {
  name: string;
  content: string;
  description?: string;
  is_system: boolean;
  is_customized?: boolean;
  factory_version?: number;
  updated_at?: string;
}

/** `POST /api/v1/agent/extras`: creates the note, or replaces the one already under `key`. */
export type SavePromptExtraRequest = PromptExtra;

/** The tally a finished consolidation run reports. */
export interface ConsolidationRunResult {
  accepted_count: number;
  rejected_count: number;
  duration_ms: number;
}

/**
 * One frame of `POST /memory/consolidate`. Each stage carries the full
 * proposals, challenges and rulings; only their number is read here.
 */
export type ConsolidationEvent =
  | { type: 'started'; memory_count: number }
  | { type: 'proposer_done'; proposals: unknown[] }
  | { type: 'adversary_done'; challenges: unknown[] }
  | { type: 'judge_done'; decisions: { accepted: boolean }[] }
  | { type: 'applied' }
  | { type: 'completed'; result: ConsolidationRunResult }
  | { type: 'error'; message: string }
  | { type: 'cancelled' };

// ── Models ────────────────────────────────────────────────────

/**
 * A row of `GET /api/v1/models`.
 *
 * The server answers six arrays keyed by category — `whisper`, `llamafile`,
 * `tts`, `gguf`, `ollama`, `embedding` — not one list and not `{models}`. The
 * client flattens them and carries `category` on each row, because that is both
 * the grouping the screen shows and the first path segment of the activate
 * call.
 *
 * There is no server-side id. `id` is synthesised in `listModels` from
 * `category` and `name`, which is the pair the activate route keys on.
 */
export interface ModelEntry {
  /** `${category}:${name}` — synthesised client-side; the API has no id. */
  id: string;
  category: ModelCategory;
  name: string;
  description?: string;
  size_mb?: number;
  downloaded?: boolean;
  /** Assigned to a role, i.e. this is one of the models actually serving. */
  active: boolean;
  url?: string;
  hf_id?: string;
  filename?: string;
  ram_estimate_mb?: number;
  recommended_role?: string;
  /**
   * Declared context window, from the catalog row the backend persisted. Prefer
   * it over guessing from `name` — that heuristic is a copy of a backend rule
   * which has already moved on.
   */
  context_length?: number;
  asr_language?: string;
  asr_size?: string;
  tts_engine?: string;
  config_filename?: string;
  /**
   * The Pond's own category for the row (`tts_kokoro` where the bucket says `tts`), which is what
   * activation and deletion name. Missing on a Pond older than the field.
   */
  pond_category?: string;
  /** What a household reads as the model's name. */
  title?: string;
  quantization?: string;
  engine?: { id: string; label: string };
  /** False when this Pond lacks the engine the model needs, so choosing it would only fail. */
  available?: boolean;
  /** Set only for the Pond's own suggestions. */
  recommended?: { rank: string; reason: string };
  /** Separate downloads that extend the model, such as picture support. */
  companions?: ModelCompanion[];
  /**
   * How the Pond gets the weights: `download` through its own downloader, `external` fetched by the
   * engine itself (a built-in memory model, Ollama), `unavailable` from nowhere it knows.
   */
  acquire?: 'download' | 'external' | 'unavailable';
  /** The jobs the Pond says this row is doing now, read from its settings. Missing on an older Pond. */
  roles?: ModelUse[];
  /** The section the Pond lists this row under. Missing on an older Pond. */
  section?: ModelSection;
}

/**
 * A job a model on the Pond is doing. The first five are held by a catalogue row; the rest by a
 * model that works beside one (`pictures`, `drafter`) or by a camera model with no row.
 */
export type ModelUse = 'chat' | 'tool' | 'asr' | 'tts' | 'embedding' | 'pictures' | 'drafter' | 'camera' | 'faces';

/** The sections the Models page lists, in this order. */
export const MODEL_SECTIONS = ['conversation', 'listening', 'speaking', 'memory', 'pictures', 'other'] as const;
export type ModelSection = (typeof MODEL_SECTIONS)[number];

/** A model the Pond has in use that is not a catalogue row: `helpers` of `GET /models/active-roles`. */
export interface HelperModel {
  id: string;
  /** Null when the Pond has no name for it but the job's. */
  title: string | null;
  uses: ModelUse[];
  section: ModelSection;
  /** The catalogue row it works for, as `{category}/{name}`. */
  serves: string | null;
}

export interface ModelCompanion {
  kind: string;
  label: string;
  size_bytes: number;
  /** `installed` | `available` | `downloading` | `verifying` | `not_on_this_device`. */
  state: string;
}

/** The jobs a model can hold. A Pond fills each with one model at a time. */
export type ModelRole = 'chat' | 'asr' | 'tts' | 'embedding';

/** The category buckets `GET /api/v1/models` answers with. */
export const MODEL_CATEGORIES = [
  'gguf',
  'litert',
  'ollama',
  'llamafile',
  'whisper',
  'tts',
  'embedding',
] as const;
export type ModelCategory = (typeof MODEL_CATEGORIES)[number];

export type ModelListResponse = Partial<Record<ModelCategory, ModelEntry[]>>;

/** Whether a voice note sent as sound would be heard; a Pond that predates sound sends none. */
export type VoiceNoteSupport = 'ready' | 'not_ready' | 'unsupported';

export interface ModelCapabilities {
  thinking: boolean;
  vision: boolean;
  /** Older Ponds set this from the model's name alone, so it is not a promise; `voice_notes` is. */
  audio_input: boolean;
  voice_notes?: VoiceNoteSupport;
  /** The limits the chat routes enforce on files; a Pond that predates files sends none. */
  attachments?: {
    audio?: { formats: string[]; max_bytes: number; max_seconds: number };
    documents?: { formats: string[]; max_bytes: number; max_per_turn: number };
  };
  context_window_tokens: number;
  structured_output: boolean;
  tool_calling: boolean;
}

export interface ModelActiveRoles {
  [role: string]: string | null;
}

/** The chat entry of `GET /models/active-roles`. */
export interface ActiveChatRole {
  model_id: string | null;
  model?: string | null;
  provider?: string | null;
  /** What `POST /models/rollback` would return to; null or absent when there is no way back. */
  rollback?: { model_id: string; model: string } | null;
}

/** `POST /models/rollback`: the model chat now runs on. */
export interface ModelRollbackResult {
  role: string;
  model_id: string;
}

export interface ModelMemoryStatus {
  total_mb: number;
  available_for_llm_mb: number;
  loaded_model: string | null;
  /** The most one model may weigh here; absent when the Pond does not check fit. */
  budget_mb?: number;
  reclaimable_mb?: number;
}

/** `GET /api/v1/models/disk-usage`. */
export interface DiskUsage {
  total_bytes: number;
  by_category: Record<string, number>;
  hf_cache_bytes: number;
  incomplete_bytes: number;
}

/** One file the Pond is fetching, from `GET /api/v1/models/download/progress`. */
export interface DownloadEntry {
  filename: string;
  category: string;
  downloaded_bytes: number;
  total_bytes: number | null;
  status: 'downloading' | 'paused' | 'done' | 'error' | 'cancelled';
  /** `{category}/{name}`, the row this file belongs to. */
  model_id?: string;
  /** `model` or `pictures`. */
  part?: string;
  error?: string;
  resumable?: boolean;
}

export type DownloadAction = 'pause' | 'resume' | 'cancel';

/** `GET /api/v1/models/search/gguf`: one Hugging Face repository. */
export interface HfModel {
  id: string;
  downloads: number;
  likes: number;
  tags: string[];
  url: string;
}

/** `GET /api/v1/models/search/gguf/files`: one file in a repository. */
export interface HfModelFile {
  filename: string;
  size_mb?: number;
  url: string;
  pictures?: { size_bytes: number; label: string } | null;
}

// ── Schedules ─────────────────────────────────────────────────
//
// The Pond's own scheduler types (`pond-core/src/user_data/domain/schedule.rs`),
// serialised as-is. One table holds both kinds of task: cron and one-off
// schedules, and sensor-triggered rules, which are stored with the cron
// `@event` and a `sensor_trigger` kind. `GET /schedules` returns both;
// `GET /rules` returns only the rules, reshaped as `Rule`.

/** Where a rule listens. `device_id` and `signal` narrow it; omitted matches any. */
export interface TriggerSource {
  kind: 'sensor' | 'camera' | 'device';
  device_id?: string;
  signal?: string;
}

/**
 * `op` and `value` go together: the Pond rejects one without the other, since
 * a half condition would fire on every reading. `after`/`before` are "HH:MM".
 */
export interface TriggerCondition {
  op?: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  value?: number;
  after?: string;
  before?: string;
}

export type TriggerAction =
  | { type: 'agent_prompt'; prompt: string }
  | { type: 'device_power'; device_id: string; on: boolean }
  | { type: 'notify'; title: string; body: string };

export type TaskKind =
  | { type: 'agent_prompt'; prompt: string }
  | { type: 'webhook'; webhook_url: string }
  /** A fixed list of actions the Pond runs itself, without Goose: a morning routine. */
  | { type: 'routine'; actions: TriggerAction[] }
  /**
   * A reminder one person set for themselves, by voice. It runs as them and goes only to their
   * phones. Lists always carry an empty `prompt`, because the Pond cannot tell who is asking.
   */
  | { type: 'member_reminder'; profile_id: string; prompt: string }
  | {
      type: 'sensor_trigger';
      source: TriggerSource;
      condition?: TriggerCondition;
      actions: TriggerAction[];
      cooldown_secs?: number;
    };

export interface Schedule {
  id: string;
  label: string;
  /** Six fields, seconds first; `@once` for a one-shot, `@event` for a rule. */
  cron: string;
  /** Set when this is a one-shot: fires once at this instant, then never again. */
  fire_at: string | null;
  timezone: string;
  kind: TaskKind;
  paused: boolean;
  currently_running: boolean;
  last_run: string | null;
  next_run: string | null;
  created_at: string;
  /**
   * Whether a run missed while the Pond was off is asked about rather than skipped. Absent on a
   * Pond that cannot ask, which is how the form knows not to offer it.
   */
  ask_if_missed?: boolean;
  /** A missed run waiting for somebody to say run it or skip it. */
  missed_run?: { due_at: string } | null;
}

/** `POST /schedules`. `name` is the label; `once` removes it after its first run. */
export interface CreateScheduleRequest {
  id?: string;
  name: string;
  cron: string;
  prompt?: string;
  timezone?: string;
  kind?: TaskKind;
  once?: boolean;
  ask_if_missed?: boolean;
}

/** `PUT /schedules/{id}`. Absent fields are left as they are. */
export interface UpdateScheduleRequest {
  name?: string;
  cron?: string;
  timezone?: string;
  prompt?: string;
  fire_at?: string;
  once?: boolean;
  ask_if_missed?: boolean;
  /** The schedule's new kind: a routine's actions, or a prompt in place of a routine's. */
  kind?: TaskKind;
}

export interface ScheduleRun {
  id: string;
  schedule_id: string;
  /**
   * `skipped` is a run missed while the Pond was off that nobody chose to run:
   * `started_at` is when it was due and `result` says why. Older Ponds never send it.
   */
  status: 'running' | 'completed' | 'failed' | 'skipped';
  result: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  /** Set on a missed run somebody chose to run late: when it was originally due. */
  caught_up_from?: string | null;
}

/** One frame of `GET /schedules/events`: a run starting or finishing. */
export interface ScheduleResultEvent {
  schedule_id: string;
  schedule_label: string;
  run_id: string;
  status: ScheduleRun['status'];
  result?: string | null;
  error?: string | null;
  duration_ms?: number | null;
}

/** A sensor-triggered rule as `GET /rules` presents it. */
export interface Rule {
  id: string;
  name: string;
  paused: boolean;
  currently_running: boolean;
  created_at: string;
  last_fired: string | null;
  cooldown_secs: number;
  source: TriggerSource;
  condition?: TriggerCondition;
  actions: TriggerAction[];
}

/** `POST /rules` and `PUT /rules/{id}`. A rule needs at least one action. */
export interface RuleRequest {
  id?: string;
  name: string;
  source: TriggerSource;
  condition?: TriggerCondition;
  actions: TriggerAction[];
  cooldown_secs?: number;
}

// ── Camera events (`/api/v1/camera/events`) ───────────────────
//
// What the Pond's vision pipeline, or anything posting to `POST /camera/events`,
// recorded. Serialised by `list_camera_events` in `pond-api/src/routes.rs`; the
// rows live in `pond_logs.db`, and acknowledged ones are pruned after 14 days.

/**
 * What the pipeline noted beside the event. Every field is optional: a camera that posts its own
 * events sends none of it, and a Pond without a face build never sets the face ones.
 */
export interface CameraEventMetadata {
  /** How much of the picture changed, 0 to 1: the motion detector's own measure. */
  changed_fraction?: number;
  source?: string;
  face_detected?: boolean;
  /** A face was found and matched nobody. */
  face_unknown?: boolean;
  /** The household member's profile id, when the face matched one. */
  identified_profile?: string;
  /** How closely the face matched, 0 to 1; for an unknown face, its nearest candidate. */
  face_confidence?: number;
}

/**
 * One thing a camera saw.
 *
 * `event_type` is the Pond's own free-form string; its documented values are
 * `motion`, `person`, `pet`, `package` and `vehicle`. `confidence` is the detector's score,
 * except for plain `motion`, where it is the fraction of the picture that changed.
 * `snapshot_path` is a file path on the Pond itself and is never shown: the picture is
 * `snapshot_url`, and the client reads both as null on a Pond that sends neither.
 */
export interface CameraEvent {
  id: number;
  camera_id: string;
  event_type: string;
  confidence: number | null;
  snapshot_path: string | null;
  /** `/api/v1/camera/events/{id}/snapshot`, or null when the event kept no picture. */
  snapshot_url: string | null;
  metadata: CameraEventMetadata | null;
  acknowledged: boolean;
  /** RFC 3339. */
  created_at: string;
}

// ── Vision (`/api/v1/vision/*`, `/cameras`, `/faces`) ─────────
//
// goose-in-a-pond's `.ai/vision-finish-plan.md` is the contract these follow.

/** Where the pond's vision pipeline stands, in the Pond's own words for it. */
export type VisionState = 'off' | 'consent_off' | 'no_camera' | 'starting' | 'running' | 'reconnecting';

/** `GET /vision/status`: what the pipeline is doing now, so nothing it does is invisible. */
export interface VisionStatus {
  /** The Privacy switch: false forbids the pipeline and every capture. */
  cameras_enabled: boolean;
  vision_enabled: boolean;
  state: VisionState;
  camera_id: string | null;
  /** The camera's address with any credentials redacted. */
  source: string | null;
  source_kind: 'configured' | 'discovered' | null;
  fps: number | null;
  /** RFC 3339. */
  last_frame_at: string | null;
  last_event_at: string | null;
  last_error: string | null;
  restarts: number;
  classifier: { available: boolean };
  faces: { available: boolean; enrolled_people: number };
  event_listeners: number;
  /** How pictures reach the pipeline; absent on a Pond older than the field. */
  capture?: VisionCapture | null;
}

/** `camera_jpeg`: the camera's own JPEGs, `hardware`: the Pond's video decoder, `software`: decoded on the processor. */
export type VisionCapture = 'camera_jpeg' | 'hardware' | 'software';

/** One entry of `GET /cameras`. `live` means a frame arrived in the last 10 seconds. */
export interface CameraInfo {
  id: string;
  live: boolean;
  last_frame_at: string | null;
  snapshot_url: string | null;
  stream_url: string | null;
}

/** `GET /vision/config`: the vision bus as the pipeline holds it, in the Pond's own field names. */
export interface VisionConfig {
  vision_enabled: boolean;
  vision_camera_id: string;
  vision_fps: number;
  vision_motion_threshold: number;
  min_event_interval_secs: number;
  classifier_confidence_threshold: number;
  face_detection_enabled: boolean;
  face_on_motion: boolean;
  enabled_event_types: string[];
  supported_signals: string[];
  active_cameras: string[];
  event_listener_count: number;
}

/** One household member as `GET /faces` lists them, whether or not the pond knows their face. */
export interface FacePerson {
  profile_id: string;
  name: string;
  /** How many face samples the pond holds for them. */
  enrollments: number;
  /** Their own strictness, or null when the pond's default applies. */
  threshold: number | null;
  last_enrolled_at: string | null;
}

/** `GET /faces`. `available` is false on a Pond with no face model, which still answers 200. */
export interface FaceOverview {
  available: boolean;
  default_threshold: number;
  people: FacePerson[];
}

/** The answer to registering a face sample: nothing of the face itself comes back. */
export interface FaceRegistration {
  id: number | string;
  profile_id: string;
  model_dims: number;
  created_at: string;
}

/** `GET`/`PUT`/`DELETE /faces/profile/{id}/threshold`. */
export interface FaceThreshold {
  profile_id: string;
  /** The override, or null when the pond's own applies. */
  threshold: number | null;
  global_threshold?: number;
}

/** Why the pond refused to take a sample from its camera, from the `reason` of the refusal. */
export type FaceCaptureReason = 'no_frame' | 'no_face' | 'cameras_disabled';

// ── Logs and activity ─────────────────────────────────────────

/**
 * One row of `GET /logs`: the Pond's own operational log, drained from its
 * tracing output. Kept are WARN and ERROR from anywhere, and INFO only from
 * trace targets, so this is mostly a list of what went wrong.
 */
export interface LogEntry {
  id: number;
  /** SQLite `datetime('now')`: UTC, but written "YYYY-MM-DD HH:MM:SS", with no zone. */
  timestamp: string;
  /** INFO | WARN | ERROR */
  level: string;
  /** The tracing target, usually a module path. */
  source: string;
  message: string;
  /** JSON, as a string, or null. */
  metadata: string | null;
}

/** The first frame of `GET /logs/stream`: what chat runs on as the stream opens. */
export interface LogStreamStatus {
  chat_provider: string;
  chat_model: string;
}

export type LogStreamEvent =
  | { kind: 'status'; status: LogStreamStatus }
  | { kind: 'log'; entry: LogEntry }
  /** Lines dropped because the phone fell behind; they are still in `GET /logs`. */
  | { kind: 'skipped'; count: number };

/** `GET`/`PUT /developer/debug`. */
export interface DeveloperDebug {
  /** Set by whoever started the Pond; nothing the phone sends changes it. */
  test_pond: boolean;
  /** Household content shows in the logs while on. Off after every restart. */
  debug: boolean;
}

export type EventCategory =
  | 'agent'
  | 'tool'
  | 'inference'
  | 'sensor'
  | 'camera'
  | 'device'
  | 'auth'
  | 'network'
  | 'system';

export type PrivacySensitivity = 'public' | 'internal' | 'sensitive' | 'secret';

export type AttributeValue =
  | { bool: boolean }
  | { int: number }
  | { float: number }
  | { text: string };

export interface ActivityEvent {
  /**
   * The backend's `Event` has no stable row id, so this is absent more often
   * than not — derive a React key rather than keying on it.
   */
  id?: string;
  timestamp: string;
  category: EventCategory;
  action: string;
  privacy_sensitivity: PrivacySensitivity;
  session_id?: string | null;
  trace_id?: string | null;
  attributes: Record<string, AttributeValue>;
}

export interface ActivityResponse {
  count: number;
  events: ActivityEvent[];
}

/** What `GET /activity/summary` counts over. */
export type ActivityWindow = 'hour' | 'day' | 'week';

/**
 * Events per category over a window. A category with none is left out rather
 * than given a zero, and the Pond counts at most the newest 1000 events.
 */
export interface ActivitySummary {
  window: ActivityWindow;
  since: string;
  total: number;
  by_category: Partial<Record<EventCategory, number>>;
}

/** `DELETE /activity`: how many events went. */
export interface ActivityPurge {
  purged: number;
}

// ── Telemetry ─────────────────────────────────────────────────
//
// Recorded per conversation turn, and only while the Pond's telemetry setting
// is on; with it off these read back empty rather than failing.

/** `GET /telemetry/summary?session_id=`: averages over one conversation. All zero for an unknown one. */
export interface TelemetrySummary {
  /** Mean time to first token, ms. */
  avg_ttft_ms: number;
  avg_completion_tokens: number;
  total_turns: number;
  /** Mean share of the model's context window used, 0–100. */
  avg_context_utilization: number;
}

/** One turn of `GET /telemetry/turns`. Only the fields the app reads, plus the identifying ones. */
export interface TurnMetrics {
  session_id: string;
  /** 1-based, within the conversation. */
  turn_number: number;
  prompt_tokens: number;
  completion_tokens: number;
  ttft_ms: number;
  total_latency_ms: number;
  tool_name: string | null;
  tool_latency_ms: number | null;
  context_utilization_pct: number;
  model_name: string;
  timestamp: string;
  decode_tok_per_sec?: number;
}

// ── Extensions and the marketplace ────────────────────────────

export interface Extension {
  name: string;
  kind: string;
  description: string;
  tools: string[];
  enabled: boolean;
  /** `connected`, `error`, or `loading`. */
  status?: string;
  last_error?: string | null;
}

/** One answer a `choice` requirement takes. */
export interface SecretOption {
  /** What is stored and put in the extension's environment. */
  value: string;
  label: string;
  description?: string;
}

export interface SecretRequirement {
  key: string;
  display_name: string;
  description: string;
  required: boolean;
  /** A `choice` is not a secret: it is one of `options`, and its value is shown rather than masked. */
  kind: 'api_key' | 'oauth_flow' | 'generic' | 'choice';
  /** Used by the Pond itself and never given to the extension. */
  host_only?: boolean;
  /** Bring-your-own credentials and overrides, kept off the ordinary setup path. */
  advanced?: boolean;
  /** For a `choice`: the answers it takes, the first applying until one is saved. */
  options?: SecretOption[];
}

/** `POST /extensions/{name}/secrets`. The values are stored even when the restart fails. */
export interface ExtensionSecretsResult {
  stored: number;
  restarted: boolean;
  restart_error: string | null;
}

/**
 * What `PUT /api/v1/secrets/{key}` reports beyond "stored": the enabled extensions that read the
 * key and were restarted to pick it up, and the ones that could not be. Never the value.
 */
export interface SecretSaveResult {
  restarted: string[];
  /** Extension names only. The Pond's reasons are English for a log, not for the screen. */
  restartFailed: string[];
}

export interface MarketplaceExtension {
  id: string;
  name: string;
  description: string;
  kind: string;
  category: string;
  author: string;
  tools: string[];
  featured: boolean;
  /**
   * Set when the Pond already does this extension's job itself (`web_search` for Brave Search):
   * installing it would only duplicate tools in every prompt, so it is never offered.
   */
  built_in?: string;
  /** For a `built_in` entry, whether the Pond's own capability is ready (sent by newer Ponds). */
  built_in_state?: 'on' | 'needs_key' | 'knowledge_off';
  required_secrets: SecretRequirement[];
}

// ── OAuth ─────────────────────────────────────────────────────

export interface OAuthProvider {
  id: string;
  display_name: string;
  scopes: string[];
}

/** `POST /oauth/authorize`: the provider's sign-in page, and the nonce the sign-in is read back by. */
export interface OAuthStart {
  auth_url: string;
  state: string;
}

/**
 * `GET /oauth/status/{state}`: how one sign-in stands. `unknown` is a nonce the Pond no longer
 * holds, such as one whose outcome was recorded more than five minutes ago.
 */
export interface OAuthSignInStatus {
  status: 'pending' | 'completed' | 'failed' | 'unknown';
  /** Why it failed, in the Pond's English: for a log line, not a screen. */
  error?: string;
}

// ── Web search ────────────────────────────────────────────────

/**
 * What the Pond knows about its Brave Search key, never the key itself.
 *
 * `rejected` and `quota` are learned at call time, when Brave refuses a search the Pond made on
 * the household's behalf, so they can appear on a key that was fine when it was saved.
 * `unverified` is a key stored while Brave could not be reached, and is checked on first use.
 */
export type WebSearchStatus = 'ok' | 'not_configured' | 'rejected' | 'quota' | 'unverified';

/**
 * Nearby places: whether each search sends the household's town to Brave, and the town it would
 * send, which is null while no place name is set. Never coordinates.
 */
export interface WebSearchLocalResults {
  enabled: boolean;
  town: string | null;
}

/** `GET /api/v1/web-search`. `local_results` is absent from a Pond that predates nearby places. */
export interface WebSearchState {
  provider: 'brave';
  configured: boolean;
  status: WebSearchStatus;
  local_results?: WebSearchLocalResults;
}

/**
 * `PUT /api/v1/web-search/key`, on a 200. `status` is `ok`, `quota` (a valid key that is spent) or
 * `unverified` (stored, Brave unreachable). A key Brave refuses is a 422 and nothing is stored.
 */
export interface WebSearchKeyResult {
  configured: boolean;
  status: WebSearchStatus;
}

// ── Voice ─────────────────────────────────────────────────────

export interface TranscribeResponse {
  text: string;
}

// ── Profiles ──────────────────────────────────────────────────

export interface Profile {
  id: string;
  display_name: string;
  avatar_emoji: string;
}

/**
 * `GET /api/v1/devices/self` -- this device, and the household member it is attributed to.
 *
 * The Pond reads the device off the token it issued at pairing; the phone never names itself.
 * `profile: null` means nobody has claimed this device, which is the normal case: pairing
 * happens before anyone says who they are. Display only -- it proves nothing to the Pond.
 */
export interface DeviceSelf {
  device_id: string;
  profile: { id: string; display_name: string } | null;
}

/**
 * `GET /api/v1/weather` -- outdoor conditions where the Pond is configured to be.
 *
 * Temperatures are Celsius: the adapter asks open-meteo for `temperature_unit=celsius` and the
 * field is `temperature_c` rounded. `{enabled: false}` means no location is configured, which
 * is a setting, not a failure. Only the fields read here.
 */
export interface WeatherResponse {
  enabled: boolean;
  temp?: number;
  location_name?: string;
  /** The condition, in English from the WMO list (`pond-adapters-weather/src/wmo.rs`). */
  cond?: string;
  /** Day or night where the Pond is; absent from a Pond older than this field. */
  is_day?: boolean;
  icon?: string;
  hi?: number;
  lo?: number;
  hum?: number;
  wind?: number;
  sunrise?: string;
  sunset?: string;
  forecast?: { d: string; i: string; t: number }[];
}

/**
 * `GET /api/v1/music/now-playing` -- a Spotify snapshot. `connected: false` is no account (or a
 * refused network); `connected: true, playing: false` is the only genuine "nothing playing".
 * `error` is set when Spotify answered and refused, in which case nothing here can be trusted.
 */
export interface NowPlayingResponse {
  connected: boolean;
  service?: string;
  player?: string | null;
  playing?: boolean;
  track?: string;
  artist?: string;
  album_art?: string | null;
  progress_ms?: number;
  duration_ms?: number;
  link?: string | null;
  can?: { pause?: boolean; resume?: boolean; next?: boolean; previous?: boolean };
  error?: string;
  message?: string;
}

/**
 * One entry of `GET /api/v1/schedules/upcoming`: the Pond's own `Schedule`, serialised as-is.
 *
 * Declared separately because it is not the shape `Schedule` above claims. The Pond sends
 * `label` and `paused`; there is no `name`, no `enabled` and no top-level `prompt` on the wire.
 * Only the fields read here.
 */
export interface UpcomingSchedule {
  id: string;
  label: string;
  next_run: string | null;
  paused: boolean;
}

/** `GET /api/v1/system/info` -- the Pond describing itself. Only the fields read here. */
export interface SystemInfo {
  hostname: string;
  version?: string;
  /** The Pond's public-key pin, `sha256/<base64>`; null when it has no TLS identity. */
  tls_spki_sha256?: string | null;
  /**
   * `host:port` of the Pond's public tunnel while it runs, given only to a caller with a valid
   * token; null when none runs, absent from a Pond too old to have one.
   */
  tunnel_address?: string | null;
  /**
   * The pairing protocol the Pond speaks. 3 is CPace, the only one this app
   * pairs with; a Pond that reports anything else, or nothing, is too old.
   */
  protocol?: number;
}

// ── Rides (`/api/v1/rides`) ───────────────────────────────────

export interface RidePoint {
  name: string;
  latitude: number;
  longitude: number;
}

export type RideStatus =
  | 'processing'
  | 'no_drivers_available'
  | 'accepted'
  | 'arriving'
  | 'in_progress'
  | 'driver_canceled'
  | 'rider_canceled'
  | 'completed'
  | { other: string };

export interface BookedRide {
  request_id: string;
  status: RideStatus;
  driver: { name: string; phone_number: string | null; rating: number | null } | null;
  vehicle: { make: string; model: string; license_plate: string } | null;
  pickup_eta_mins: number | null;
}

/** Where a quoted ride stands on the Pond. Only `awaiting_confirmation` can be confirmed. */
export type RideBookingState =
  | { state: 'awaiting_confirmation' }
  | { state: 'requesting' }
  | { state: 'requested'; ride: BookedRide }
  | { state: 'declined' }
  | { state: 'failed'; reason: string };

export interface RideQuote {
  id: string;
  provider: string;
  pickup: RidePoint;
  dropoff: RidePoint;
  fare: { display: string; currency_code: string; expires_at: string };
  pickup_eta_mins: number | null;
  state: RideBookingState;
}

// ── Pond settings (`GET` / `PUT /api/v1/settings`) ─────────────

/**
 * The Pond's settings record, the fields this app shows. The Pond holds more; a field missing
 * here is one nothing on the phone reads, or one the Pond itself does not act on.
 *
 * `PUT /settings` takes a partial patch and answers the whole merged record. Every key a patch
 * carries is marked set by the household for good, so the phone sends only the key it changed.
 */
export interface PondSettings {
  // Household
  user_name: string;
  assistant_name: string;
  assistant_personality: string;
  primary_profile_id: string | null;
  home_name: string;
  timezone: string;
  weather_enabled: boolean;
  weather_location_name: string;
  /** Where the coordinates came from: `geocoded` (a town's centre), `manual`, `device` (a phone's fix), or empty. */
  weather_location_source?: string;
  weather_latitude: number;
  weather_longitude: number;

  // Personality
  prompt_style: string;
  prompt_addendum: string;
  custom_system_prompt: string | null;

  // Voice
  voice_wake_word: string;
  voice_wake_word_transcriptions: string[];
  voice_kws_energy_threshold: number;
  voice_kws_post_trigger_silence_ms: number;
  voice_kws_cooldown_ms: number;
  voice_recording_duration_secs: number;
  voice_whisper_url: string;
  voice_tts_voice: string;
  voice_tts_speed: number;
  voice_tts_quality: string;
  voice_thinking_tone_enabled: boolean;
  voice_max_turns: number;
  /** The Pond listens through its own microphone, where it has a microphone and a speaker. */
  voice_room_enabled: boolean;

  // Models and generation
  chat_provider: string;
  /** The model the chat job loads; empty on a fresh Pond, which `/onboard/complete` refuses. */
  chat_model: string;
  llm_provider: string;
  tool_model: string | null;
  llm_max_tokens: number;
  llm_temperature: number;
  context_window_override: number;
  embedding_provider: string;

  // Memory
  agent_memory_inject: boolean;
  agent_memory_limit: number;
  memory_extraction_enabled: boolean;
  memory_extraction_max_facts: number;
  memory_extraction_interval_secs: number;
  memory_cleanup_enabled: boolean;
  memory_cleanup_interval_hours: number;
  memory_prune_threshold: number;
  memory_archive_threshold: number;
  memory_decay_base_half_life_days: number;
  memory_decay_beta: number;
  memory_consolidation_enabled: boolean;
  memory_consolidation_mode: string;
  memory_consolidation_interval_hours: number;
  memory_consolidation_batch_size: number;

  // Privacy and reach
  mic_enabled: boolean;
  /** The consent switch: false forbids the vision pipeline and every camera capture. */
  cameras_enabled: boolean;
  network_mode: string;
  mesh_enabled: boolean;
  security_policy_mode: string;
  telemetry_enabled: boolean;
  context_ingest_enabled: boolean;

  // Tools
  ext_memory_enabled: boolean;
  ext_schedule_enabled: boolean;
  ext_weather_enabled: boolean;
  ext_knowledge_enabled: boolean;
  ext_system_enabled: boolean;
  ext_device_enabled: boolean;
  ext_sensor_enabled: boolean;
  ext_travel_enabled: boolean;
  ext_orchestrator_enabled: boolean;
  ext_context_enabled: boolean;
  tool_selection_mode: string;
  searxng_url: string | null;
  /** Nearby places in web search. Off by default; absent from a Pond that predates it. */
  web_search_local_results?: boolean;

  // Automations
  schedule_max_concurrent: number;
  schedule_max_runs_per_task: number;
  unprompted_speech_enabled: boolean;
  unprompted_speech_categories: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
  /** In quiet hours only alerts and what was asked for then reach a phone; the rest wait for one notice. */
  notices_wait_in_quiet_hours: boolean;
  /** A reminder no phone fetched within five minutes is said once in the room, outside quiet hours. */
  speak_unfetched_reminders: boolean;
  /** Days unseen before a phone stops being notified; 0 never stops. */
  unseen_phone_skip_days: number;
  /** Days unseen before the Pond removes a phone; 0 never removes. */
  unseen_phone_remove_days: number;
  /** In a household of one, a voice the Pond cannot identify sets reminders and to-dos as that member. */
  lone_voice_sets_reminders: boolean;
  proactive_review_enabled: boolean;
  suggestions_muted: string[];
  session_titling_enabled: boolean;

  // Reasoning
  thinking_mode: string;
  reasoning_effort: string;
  show_thinking: boolean;
  persist_thinking: boolean;
  review_mode: string;
  review_max_rounds: number;
  review_pass_threshold: number;
  goal_check_enabled: boolean;

  // Performance and context
  agent_max_turns: number;
  agent_timeout_secs: number;
  prefix_cache_prompt: boolean;
  hybrid_compaction_enabled: boolean;
  summary_idle_secs: number;
  compaction_verbatim_days: number;
  context_monitor_enabled: boolean;
  show_turn_stats: boolean;

  // Cameras and Matter
  vision_enabled: boolean;
  vision_camera_url: string;
  vision_camera_id: string;
  vision_fps: number;
  vision_motion_threshold: number;
  vision_classifier_model: string;
  /** Seconds after one event before the pond records another. Applied live. */
  vision_event_cooldown_secs: number;
  /** The least sure the detector may be for something to count, 0 to 1. Applied live. */
  vision_classifier_confidence: number;
  vision_face_recognition_enabled: boolean;
  vision_face_on_motion: boolean;
  /** Which kinds of event the pond records. Empty means every kind. */
  vision_event_types: string[];
  picture_support_download_enabled: boolean;
  matter_ws_url: string;
  matter_ble_enabled: boolean;

  // Retention and cost
  retention_event_log_days: number;
  retention_sensor_days: number;
  retention_session_messages_keep: number;
  retention_events_days: number;
  retention_events_by_category: Record<string, number>;
  retention_sensitive_days: number;
  cloud_input_price_per_million: number;
  cloud_output_price_per_million: number;
}

export type PondSettingKey = keyof PondSettings;

/** One field the Pond refused, from the `fields` of a 422. */
export interface SettingsFieldError {
  field: string;
  message: string;
}

/** `GET /api/v1/time/zones`: one IANA zone with its current offset and a place it covers. */
export interface ZoneChoice {
  zone: string;
  offset: string;
  place: string;
}

/** `POST /api/v1/location/detect`. Nothing is saved; the caller stores what it accepts. */
export interface DetectedPlace {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  source: 'timezone' | 'geocoded' | 'device' | 'network';
  certain: boolean;
  has_coordinates: boolean;
  note: string | null;
}

/** `POST /api/v1/voice/tts/apply`: the speaking engine as it now stands. */
export interface TtsApplyResult {
  voice: string;
  speed: number;
  quality: string;
  downloaded_voice: boolean;
  downloaded_weights: boolean;
  engine_reloaded: boolean;
  installed_voices: string[];
}

/** `POST /api/v1/sessions/retitle`: whether the titling job was woken. */
export interface RetitleResult {
  started: boolean;
  reason?: string;
}

/** `POST /api/v1/sessions/{id}/retitle`: the model named one conversation, or did not. */
export interface RetitleOneResult {
  session_id: string;
  outcome: 'retitled' | 'skipped' | 'unusable' | 'cancelled';
  /** The new name, or null when nothing was written. */
  title: string | null;
  /** Present on "skipped": why, in a stable slug. */
  reason?: string;
}

// ── Owner setup ───────────────────────────────────────────────

/** `GET /api/v1/onboard/status`. `current_step` is the furthest step recorded, PascalCase, or `not_started`. */
export interface OnboardStatus {
  onboarded: boolean;
  current_step: string;
  steps_completed: number;
  total_steps: number;
}

/** `POST /api/v1/onboard/complete`: done, or the settings it refused to finish without. */
export type OnboardCompletion =
  /**
   * `adminKey`: My Pond's key for the phone that claimed the Pond, given once on this call only.
   * `interview`: the owner's setup interview, from a Pond that has one (goose-in-a-pond#731).
   */
  | { completed: true; adminKey?: string; interview?: InterviewOffer }
  | { completed: false; missing: string[] };

/** Where a member's setup interview stands. `not_started` is the only state with no session yet. */
export type InterviewStatus = 'not_started' | 'in_progress' | 'awaiting_approval' | 'done' | 'stopped';

export type InterviewTopicStatus = 'pending' | 'answered' | 'skipped';

export interface InterviewTopic {
  id: string;
  label: string;
  status: InterviewTopicStatus;
}

/** A note the interview wants to keep, one per topic, keyed `me_*`; the answers behind it never leave the Pond. */
export interface InterviewDraftNote {
  key: string;
  topic: string;
  instruction: string;
}

/** `GET` and `POST /api/v1/profiles/{id}/interview`. */
export interface ProfileInterview {
  profileId: string;
  status: InterviewStatus;
  /** The conversation the questions are asked in; null only before it starts. */
  sessionId: string | null;
  topics: InterviewTopic[];
  draft: InterviewDraftNote[];
}

/** The owner's interview as `/onboard/complete` offers it. */
export interface InterviewOffer {
  profileId: string;
  status: InterviewStatus;
}

/** `GET /api/v1/profiles/{id}/notes`: the member's own notes, and how much of the shared budget is used. */
export interface MemberNotes {
  notes: PromptExtra[];
  limits: { maxNotes: number; maxTotalChars: number; usedChars: number } | null;
}

/** `GET /api/v1/warmup`: whether the chat model has been primed for a first message. */
export interface WarmupStatus {
  state: 'warming' | 'ready' | 'skipped' | 'failed';
  reason?: string;
  model: string;
  started_unix_ms: number;
  finished_unix_ms: number | null;
  elapsed_ms: number;
}

/** `PATCH /api/v1/profiles/{id}`. The map sent replaces the stored one whole. */
export interface ProfilePrefs {
  id: string;
  display_name: string;
  preferences: Record<string, string>;
}

/** The Pond's own wake detector, or Whisper listening for the phrase in what it transcribes. */
export type WakeDetectorKind = 'hey_goose' | 'whisper';

/** Why the Pond listens with the detector it does; null for a reason this phone does not know. */
export type WakeDetectorReason = 'chosen' | 'calibrated' | 'not_calibrated' | 'custom_phrase' | 'no_ear';

export interface WakeDetectorVerdict {
  kind: WakeDetectorKind;
  /** Takes the "hey goose" detector heard, of the takes recorded. */
  heard: number;
  of: number;
  reason: WakeDetectorReason | null;
}

export type RoomVoiceState = 'off' | 'starting' | 'wait' | 'listen' | 'thinking' | 'speak' | 'paused';

export type RoomVoiceUnavailable = 'no_mic_speaker_pair' | 'voice_running_elsewhere' | 'models_missing';

/** `GET /api/v1/voice/room`: the Pond listening through its own microphone. */
export interface VoiceRoom {
  enabled: boolean;
  /** False when the Pond cannot run it here, whatever `enabled` says; `unavailable_reason` says why. */
  available: boolean;
  unavailable_reason: RoomVoiceUnavailable | null;
  state: RoomVoiceState;
  wake: { phrase: string; detector: WakeDetectorKind; reason: WakeDetectorReason | null };
  /** `enrolled_or_wake`: a voice Voice Match knows, talking over the reply, or the wake word. */
  interrupts: 'enrolled_or_wake' | 'wake_only';
  last_heard: { profile_id: string; name: string; at: string } | null;
  session_id: string | null;
  /** When a `paused` room listens again by itself, unless the pause is renewed. */
  paused_until: string | null;
}

export interface VoiceSpeaker {
  profile_id: string;
  name: string;
}

/** One `data:` line of `GET /api/v1/voice/room/events`, as `chat --voice --json-events` writes it. */
export type RoomVoiceEvent =
  | { event: 'state'; state: RoomVoiceState }
  | { event: 'transcript'; text: string }
  | { event: 'token'; content: string }
  | { event: 'tool_call'; tool: string; id: string }
  | { event: 'tool_result'; tool: string; id: string; content: string }
  | { event: 'turn_complete'; session_id: string }
  | { event: 'error'; message: string }
  | { event: 'wake'; who: VoiceSpeaker | null }
  | { event: 'interrupt'; why: 'voice' | 'wake_word' | 'button' };

export interface VoiceAgentExample {
  brief: string;
  answer: string;
}

export interface VoiceAgentToolGroup {
  group: string;
  label: string;
  on: boolean;
}

/** Whether a spoken answer thinks first; `auto` follows the household's thinking setting. */
export type VoiceThinking = 'off' | 'auto' | 'on';

/** `GET /api/v1/agents/voice`: the shipped agent that answers every spoken turn, as this household has it. */
export interface VoiceAgent {
  name: 'voice';
  title: string;
  /** The household has changed it; reset goes back to the shipped one. */
  edited: boolean;
  instructions: string;
  shipped_instructions: string;
  examples: VoiceAgentExample[];
  tool_groups: VoiceAgentToolGroup[];
  /** The household's own cap on tool calls per spoken answer; null leaves it to `shipped_max_turns`. */
  max_turns: number | null;
  /** The Pond's `voice_max_turns` setting, where 0 is no cap of its own; null when it could not read it. */
  shipped_max_turns: number | null;
  /** Null from a Pond that does not offer the choice. */
  thinking: VoiceThinking | null;
  prefill: AgentPrefill;
}

/** `PUT /api/v1/agents/voice`. Tools only narrow: a group can be turned off, never one added. */
export interface VoiceAgentPatch {
  instructions?: string;
  examples?: VoiceAgentExample[];
  tool_groups_off?: string[];
  /** Null drops the household's cap. */
  max_turns?: number | null;
  /** Null is `auto`, as the Pond takes it. */
  thinking?: VoiceThinking | null;
}

export type VoicePrintModelState = 'missing' | 'downloading' | 'ready' | 'failed';

export interface VoicePrintMember {
  profile_id: string;
  name: string;
  takes: number;
  needed: number;
  enrolled: boolean;
  /** How alike the takes sound to each other, 0 to 1; null before there are two. */
  consistency: number | null;
  updated_at: string | null;
}

/** `GET /api/v1/voice/prints`. */
export interface VoicePrints {
  model: { state: VoicePrintModelState; progress: number | null; credit: string };
  members: VoicePrintMember[];
}

/** `PUT /api/v1/location/device`: whether the Pond took this phone's fix, and where it now is. */
export interface HomeLocationResult {
  applied: boolean;
  /** `location_known` when the Pond already had a position someone set and none was asked for. */
  reason?: string;
  name: string;
  latitude: number;
  longitude: number;
}

/** `POST /api/v1/voice/wake/check`: the Pond's verdict on one segment, and the phrase it matched. */
export interface WakeCheck {
  heard: boolean;
  phrase: string;
}

/**
 * `POST /api/v1/voice/takes`: one sentence read while teaching Goose a voice. It tunes the wake
 * phrase, and adds to the person's voice print unless Voice Match is off for the run.
 */
/** One teach sentence to send: `replaces` names a missed take of this run that it takes the place of. */
export interface VoiceTakeInput {
  fileUri: string;
  prompt: string;
  profileId: string | null;
  voiceMatch: boolean;
  replaces?: string | null;
}

export interface VoiceTakeResult {
  /** This take's id, which a retake of its sentence names to replace it; null from an older Pond. */
  take_id: string | null;
  /** Takes the Pond has accepted in this run, this one included. */
  take: number;
  of: number;
  /**
   * `heard`: Whisper found the wake phrase at the start, heard as `heard_as`. `new_detector`: the
   * "hey goose" detector fired on this take.
   */
  wake: { heard: boolean; heard_as: string | null; new_detector: boolean };
  voice_match: { stored: boolean; enrolled: boolean; consistency: number | null } | null;
  /** The household's verdict across every taught member's latest run, not this run's. */
  wake_detector: WakeDetectorVerdict;
}

/**
 * A row of `GET /api/v1/recipes`. An agent is a recipe whose YAML has a `giap_role` block
 * (goose-in-a-pond PAI-6 section 9); the others are plain recipes and are not shown as agents.
 */
export interface AgentRecipe {
  /** The key `PUT` and `DELETE /recipes/{id}` take. */
  id: string;
  /** Unique; other agents name it to hand work to it, and its prefill is listed under it. */
  name: string;
  description?: string;
  yaml: string;
  /** Absent on older rows, which are on. */
  active?: boolean;
  created_at?: string;
  /** The YAML's own `title`, parsed by the Pond; may be empty. */
  title?: string;
  /** The member whose paired device first saved it, or null when no member did. */
  owner_profile_id?: string | null;
}

/** One problem `POST /recipes/validate` found, at its field's path, such as `giap_role.instructions`. */
export interface RecipeFieldError {
  path: string;
  message: string;
}

/** `POST /api/v1/recipes/validate`: a 200 whether or not the block is acceptable. */
export interface RecipeValidation {
  ok: boolean;
  role: { name: string; tool_groups: string[]; preamble_chars: number } | null;
  errors: RecipeFieldError[];
}

/** A shipped agent template `GET /api/v1/agents/suggestions` offers because this Pond can run it. */
export interface AgentSuggestion {
  /** The key the enable and dismiss routes take. */
  template: string;
  title: string;
  description: string;
  /** Why it fits this Pond, in the Pond's words. */
  why: string;
  /** What it uses that this Pond has, such as presence or a camera. */
  needs: string[];
  /** When it would run, such as "Every weekday at 7:00". */
  activations_summary: string;
}

export type PrefillKind = 'default' | 'member';

/**
 * Where an agent's saved prefill stands. `idle` is one put away after `retention_days` unused; its
 * next run compiles it again.
 */
export type PrefillStatus = 'ready' | 'building' | 'queued' | 'idle' | 'not_built' | 'failed';

export interface AgentPrefill {
  agent: string;
  kind: PrefillKind;
  status: PrefillStatus;
  compiled_at: string | null;
  last_used_at: string | null;
}

/** The pass the Pond is running, if any: `current` is the agent being compiled now. */
export interface PrefillBuilding {
  active: boolean;
  current: string | null;
  done: number;
  total: number;
}

/** `GET /api/v1/agents/prefills`. */
export interface AgentPrefills {
  building: PrefillBuilding;
  retention_days: number;
  agents: AgentPrefill[];
}

/** Where a long task is (pond-core `LongTaskState`). The last three are the ends it cannot leave. */
export type LongTaskState = 'planning' | 'running' | 'awaiting_approval' | 'paused' | 'completed' | 'failed' | 'cancelled';

export type LongTaskStepState = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'awaiting_approval';

export interface LongTaskStep {
  key: string;
  /** The agent doing it, by name: a built-in such as `long-task-worker`, or a household agent. */
  role: string;
  state: LongTaskStepState;
  attempts: number;
  summary: string | null;
  failure: string | null;
}

/** What a step wrote, without its body; `GET .../artifacts/{id}` has the body. */
export interface LongTaskArtifact {
  id: string;
  task_id: string;
  step_key: string | null;
  kind: string;
  title: string;
  summary: string;
  tokens: number;
  created_at: string;
}

/** `research` is one a person asked for as deep research; an older Pond sends no kind. */
export type LongTaskKind = 'general' | 'research';

/** How long a task's answer is: `auto` until the Pond reads it from the question, then `short` or `report`. */
export type AnswerShape = 'auto' | 'short' | 'report';

/** `GET /api/v1/long-tasks/{id}`. */
export interface LongTask {
  id: string;
  kind: LongTaskKind;
  goal: string;
  state: LongTaskState;
  origin_session_id: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  steps: LongTaskStep[];
  artifacts: LongTaskArtifact[];
  /** The artifact that answers the goal, once there is one. */
  result_artifact_id: string | null;
  /** Absent from an older Pond. */
  answer?: AnswerShape;
  /** A finished short answer's whole text, in Markdown; null otherwise. */
  answer_text?: string | null;
  /** Where an open task waits; `null` once it has ended, and absent from an older Pond. */
  queue?: LongTaskQueuePlace | null;
}

/** A task ahead in the line: one this member reaches (their own or the household's), or only a place another member holds. */
export type LongTaskAhead = { id: string; goal: string; state: LongTaskState } | { another_member: true };

/** One slot works the household's long tasks in the order they were asked for; position 1 is the one under way. */
export interface LongTaskQueuePlace {
  position: number;
  of: number;
  ahead: LongTaskAhead[];
}

/** `GET /api/v1/long-tasks/{id}/artifacts/{artifact_id}`: `body` is markdown. */
export interface LongTaskArtifactBody {
  id: string;
  title: string;
  kind: string;
  summary: string;
  body: string;
}

/**
 * `GET /api/v1/long-tasks/deep-research`: whether this member may ask for research. `off` is the
 * household's long tasks switched off; `unidentified` is a caller the Pond does not know as a member.
 */
export type DeepResearchAvailability = { available: true } | { available: false; reason: 'off' | 'unidentified' };

/**
 * `GET /api/v1/long-tasks/{id}/report`: the whole report as one markdown document, the summary and
 * every drafted section in plan order, then its sources. `sections` and `calendar_events` are counts.
 */
export interface LongTaskReportWire {
  id: string;
  title: string;
  state: LongTaskState;
  kind: LongTaskKind;
  markdown: string;
  sections: number;
  sources: { title: string; url: string }[];
  calendar_events: number;
  /** Pictures the Pond kept from the pages the report cites; none from an older Pond. */
  images: ReportImage[];
  /** The options a compare step wrote, as cards; none from an older Pond. */
  options: ReportOption[];
}

/** What `GET /long-tasks/{id}/export` gives: Markdown, a self-contained page, or a calendar file. */
export type ReportFormat = 'markdown' | 'html' | 'ics';

/**
 * My Pond, the administration area under `/api/v1/admin` (goose-in-a-pond
 * `docs/architecture/pond-administrator.md`). Sizes are bytes and times RFC 3339.
 */
export interface AdminStatus {
  card: 'present' | 'missing';
  unlocked: boolean;
  expires_at: string | null;
  idle_minutes: number;
  /** Seconds before another unlock is heard, while wrong passwords are being slowed. */
  retry_after: number | null;
  /** Whether the Pond holds a live key for this phone; false when it does not say. */
  key: boolean;
  /**
   * Whether this Pond keeps a key for each phone at all, which it shows by saying `key`. One built
   * before goose-in-a-pond#715 does not, and no phone can open My Pond with its biometrics there.
   */
  keys: boolean;
}

export interface AdminUnlocked {
  unlocked: true;
  expires_at: string | null;
}

export type AdminAreaId = 'models' | 'conversations' | 'kv_snapshots' | 'engine_caches' | 'attachments' | 'camera' | 'logs' | 'other';

export interface AdminOverview {
  /** The disk the Pond's files are on; with an encrypted data volume, the one that holds it. */
  disk: { total_bytes: number; free_bytes: number };
  /** The encrypted data volume, when the Pond keeps its data in one. Older Ponds send nothing. */
  volume?: { total_bytes: number; free_bytes: number } | null;
  data_dir_bytes: number;
  areas: { id: AdminAreaId; bytes: number }[];
  databases: { name: string; bytes: number }[];
  counts: {
    sessions: number | null;
    messages: number | null;
    memories: number | null;
    long_tasks: number | null;
    artifacts: number | null;
    models: number | null;
  };
}

export type AdminEntryKind = 'file' | 'directory' | 'symlink';
/** Why an entry cannot be deleted here: the Pond has it open, or Models removes it. */
export type AdminKeepReason = 'in_use' | 'managed_by_models' | 'protected';

export interface AdminFileEntry {
  name: string;
  /** Relative to the Pond's data directory. */
  path: string;
  kind: AdminEntryKind;
  bytes: number;
  modified_at: string | null;
  deletable: boolean;
  reason: AdminKeepReason | null;
}

export interface AdminFileListing {
  path: string;
  entries: AdminFileEntry[];
}

export type AdminCacheId = 'kv_snapshots' | 'download_leftovers' | 'accelerator_caches';

export interface AdminCache {
  id: AdminCacheId;
  bytes: number;
  files: number;
}

export interface AdminTaskArtifact {
  id: string;
  /** Null on another member's task. */
  title: string | null;
  kind: string;
  tokens: number;
  created_at: string | null;
}

export interface AdminTask {
  id: string;
  /** Null on another member's task, whose goal is theirs. */
  goal: string | null;
  another_member: boolean;
  /** Null for a state this phone does not know, which is never taken for finished. */
  state: LongTaskState | null;
  kind: LongTaskKind;
  created_at: string | null;
  finished_at: string | null;
  has_report: boolean;
  artifacts: AdminTaskArtifact[];
}

export type AdminCheckId = 'disk_space' | 'memory' | 'temperature' | 'other';
export type AdminCheckStatus = 'ok' | 'warning' | 'critical';

/** `GET /admin/reliability?days=`: whether notices arrived and messages were answered over a stretch of days. */
export interface AdminReliability {
  days: number;
  notices: {
    queued: number;
    woken: number;
    fetched: number;
    fetched_within_a_minute: number;
    fetched_after_an_hour: number;
    shown: number;
    opened: number;
    spoken: number;
  };
  turns: { asked: number; answered: number };
  phones: { paired: number; test: number; unseen: number; with_push_token: number };
  /** Times the Pond was told to stop. */
  stops: number;
  android_push_key: boolean;
  apple_push_key: boolean;
}

export interface AdminHealth {
  version: string;
  uptime_secs: number | null;
  host: {
    hostname: string;
    os: string;
    arch: string;
    cpus: number | null;
    uptime_secs: number | null;
    load: number[];
  };
  memory: { total_bytes: number; available_bytes: number; swap_total_bytes: number; swap_free_bytes: number } | null;
  disk: { total_bytes: number; free_bytes: number } | null;
  temperatures: { zone: string; celsius: number }[];
  process: { rss_bytes: number } | null;
  checks: { id: AdminCheckId; status: AdminCheckStatus }[];
}

export interface PowerMode {
  id: number;
  name: string;
}

export interface AdminPower {
  control: 'nvpmodel' | 'none';
  mode: PowerMode | null;
  default_mode_id: number | null;
  modes: PowerMode[];
  can_change: boolean;
  supply: { millivolts: number; milliamps: number; milliwatts: number } | null;
  battery: { percent: number; charging: boolean } | null;
}

export interface PowerModeChange {
  mode: PowerMode | null;
  reboot_required: boolean;
}

// ── My Goose: the member's hub (`/api/v1/me/...`, docs/MY-GOOSE-HUB.md) ──
// The Pond's own shapes, snake_case as sent. The readers in `models/` turn each into what the
// screens use, and take any field of the wrong shape as missing.

export interface MeHubWire {
  version: number;
  interests: boolean;
  news: boolean;
  todos: boolean;
  cart: boolean;
  connectors: boolean;
  ideas: boolean;
  catalog: boolean;
}

export interface MoneyWire {
  amount: number;
  currency: string;
}

export type InterestCategoryWire =
  | 'sport' | 'tech' | 'science' | 'business' | 'money' | 'politics' | 'culture' | 'film_tv' | 'music'
  | 'games' | 'books' | 'food' | 'travel' | 'health' | 'home' | 'cars' | 'shopping' | 'people'
  | 'places' | 'learning' | 'other';
export type InterestDepthWire = 'curious' | 'keen' | 'devoted';
export type InterestNewsWire = 'off' | 'tiles' | 'digest' | 'both';

export interface InterestWire {
  id: string;
  topic: string;
  category: InterestCategoryWire;
  facets: string[];
  depth: InterestDepthWire;
  news: InterestNewsWire;
  avoid: boolean;
  origin: 'interview' | 'chat' | 'you';
  evidence: number;
  confirmed: boolean;
  /** The topic's own picture (Wikipedia's lead image), when one was found. */
  picture: string | null;
  updated_at: string;
}

/** What `POST /me/interests` and `PATCH /me/interests/{id}` take; every field optional on a PATCH. */
export interface InterestWriteWire {
  topic?: string;
  category?: InterestCategoryWire;
  facets?: string[];
  depth?: InterestDepthWire;
  news?: InterestNewsWire;
  avoid?: boolean;
  confirmed?: true;
}

export interface InterviewTurnWire {
  id: string;
  role: 'goose' | 'you';
  text: string;
  choices: string[];
  multi: boolean;
  allow_free: boolean;
  at: string;
}

export type InterestInterviewStatusWire = 'not_started' | 'asking' | 'thinking' | 'review' | 'done';

export interface InterestInterviewWire {
  status: InterestInterviewStatusWire;
  turns: InterviewTurnWire[];
  draft: InterestWire[];
  asked: number;
  planned: number;
}

export interface InterviewApproveWire {
  keep: string[];
  edits: Record<string, InterestWriteWire>;
}

export interface PortraitWire {
  summary: string;
  into: string[];
  working_on: string[];
  likes: string[];
  updated_at: string;
}

export interface NewsSettingsWire {
  digest: boolean;
  digest_time: string;
  spoken_on_speaker: boolean;
  tiles: boolean;
  timezone: string;
}

export type StoryKindWire = 'news' | 'long_read';

export interface StoryWire {
  id: string;
  /** A long read is an occasional evergreen deep dive, not a headline. */
  kind: StoryKindWire;
  headline: string;
  dek: string;
  picture: string | null;
  source: { name: string; url: string };
  interest: { id: string; topic: string; category: InterestCategoryWire };
  published_at: string | null;
  written_at: string;
  /** The member has opened it. */
  read: boolean;
}

/** A story in `GET /me/news/history`, with when the member read it. */
export interface ReadStoryWire extends StoryWire {
  read_at: string;
}

export type StoryVoteWire = 'up' | 'down' | 'wrong';

export interface SourceRefWire {
  title: string;
  url: string;
  site: string;
}

export interface StoryDetailWire extends StoryWire {
  summary: string;
  why_you: string;
  sources: SourceRefWire[];
}

export interface DigestSectionWire {
  interest: { id: string; topic: string };
  heading: string;
  body: string;
  pictures: { path: string; caption: string; source_url: string }[];
  references: SourceRefWire[];
}

export interface DigestWire {
  id: string;
  title: string;
  written_at: string;
  intro: string;
  sections: DigestSectionWire[];
  listen: string;
}

export interface NewsFeedWire {
  stories: StoryWire[];
  digest: DigestWire | null;
  state: 'idle' | 'writing';
  next_digest_at: string | null;
  last_written_at: string | null;
  /** Why the Pond cannot write news yet: no interests to write from, or no web search to read with. */
  blocked?: 'no_interests' | 'web_search' | null;
}

export type HookKindWire = 'time' | 'repeat' | 'place' | 'event' | 'connector';
export type RepeatEveryWire = 'day' | 'weekday' | 'week' | 'month';
export type PlaceTransitionWire = 'arrive' | 'leave';

export type HookSpecWire =
  | { at: string }
  | { every: RepeatEveryWire; at: string; days?: number[] }
  | { place_id: string; transition: PlaceTransitionWire }
  | { source_id: string; event: string }
  | { connector_id: string; event: string; filter: string | null };

export interface HookWire {
  id: string;
  kind: HookKindWire;
  label: string;
  spec: HookSpecWire;
  next_fire_at: string | null;
  last_fired_at: string | null;
}

export interface TodoWire {
  id: string;
  kind: 'todo' | 'reminder';
  text: string;
  notes: string | null;
  state: 'open' | 'done' | 'dropped';
  due_at: string | null;
  hooks: HookWire[];
  ask: boolean;
  source: 'you' | 'chat' | 'goose' | 'idea';
  last_asked_at: string | null;
  asked: number;
  snoozed_until: string | null;
  created_at: string;
  done_at: string | null;
}

/** A hook as the phone sends it: the Pond writes its id, label and fire times. */
export interface HookWriteWire {
  kind: HookKindWire;
  spec: HookSpecWire;
}

export interface TodoWriteWire {
  kind?: 'todo' | 'reminder';
  text?: string;
  notes?: string | null;
  due_at?: string | null;
  ask?: boolean;
  state?: 'open' | 'done' | 'dropped';
  /** Replaces every hook the to-do had. */
  hooks?: HookWriteWire[];
  /** At most 40 characters; null or empty is no list. */
  list?: string | null;
  priority?: TodoPriorityWire;
  /** Replaces the whole list: a step is ticked by sending every step again. */
  steps?: TodoStepWire[];
  /** Null clears it. */
  goose_can?: GooseCanWire | null;
  anchor_id?: string | null;
}

export type TodoPriorityWire = 'low' | 'normal' | 'high';

export interface TodoStepWire {
  text: string;
  done: boolean;
}

export interface GooseCanWire {
  label: string;
  kind: 'research' | 'chat' | 'watch';
  prompt: string;
}

export type TodoAnswerWire = 'done' | 'not_yet' | 'drop';

// ── The idea engine (pond docs/architecture/idea-engine.md, section 11) ──

/** Why a member waves something off; the same chips on every surface. */
export type RejectReasonWire = 'too_generic' | 'not_relevant' | 'wrong_facts' | 'already_know' | 'bad_timing';

export type AnchorKindWire = 'event' | 'trip' | 'purchase' | 'project' | 'interest' | 'standing';

export interface AnchorFactWire {
  label: string;
  value: string;
  source: string;
}

export interface NewAnchorWire {
  kind: Exclude<AnchorKindWire, 'standing'>;
  title: string;
  starts_at?: string;
  ends_at?: string;
  place?: string;
  notes?: string;
}

/** A date or place sent as null is cleared; `facts` replaces the whole list. */
export interface AnchorPatchWire {
  title?: string;
  starts_at?: string | null;
  ends_at?: string | null;
  place?: string | null;
  facts?: AnchorFactWire[];
}

export interface AnchorStopWire {
  reasons: RejectReasonWire[];
  text?: string;
  never?: boolean;
}

export interface DeliverableRejectWire {
  verb: 'not_this' | 'never';
  reasons: RejectReasonWire[];
  text?: string;
}

/** `POST /me/idea-cards/{id}/dismiss`: the same chips as everywhere, and the member's words. */
export interface IdeaCardDismissWire {
  reasons: RejectReasonWire[];
  text?: string;
}

/** A choice is one of the question's options; `text` is the member's "Other". */
export interface QuestionAnswerWire {
  choices: string[];
  text?: string;
}

/** `POST /me/questions/batches/{id}/answer`: one entry for each question the member answered. */
export interface QuestionBatchAnswerWire {
  answers: (QuestionAnswerWire & { question_id: string })[];
}

export type FactCategoryWire =
  | 'identity' | 'home' | 'work' | 'people' | 'plan' | 'hunt' | 'interest' | 'food' | 'health' | 'style'
  | 'routine' | 'avoid' | 'other';

export interface FactPatchWire {
  fact?: string;
  category?: FactCategoryWire;
  pinned?: boolean;
}

export type LedgerCategoryWire =
  | 'groceries' | 'eating_out' | 'transport' | 'bills' | 'rent' | 'health' | 'shopping' | 'travel'
  | 'entertainment' | 'transfers' | 'other';

/** An amount is a decimal string in the currency's major unit; `note` and `anchor_id` sent as null are cleared. */
export interface LedgerPatchWire {
  payee?: string;
  amount?: string;
  category?: LedgerCategoryWire;
  occurred_on?: string;
  note?: string | null;
  anchor_id?: string | null;
}

export interface CaptureSettingsWire {
  screenshots?: boolean;
  albums?: string[];
}

export interface CaptureWire {
  image: string;
  mime_type: string;
  kind: 'screenshot' | 'photo';
  album?: string;
  taken_at?: string;
}

/** A dated mention lifted from a chat, offered as a to-do. */
export interface TodoOfferWire {
  reminder_id: string;
  text: string;
  when_said: string;
  due_at: string | null;
  said_at: string;
}

export interface PlaceWire {
  id: string;
  label: string;
  lat: number;
  lng: number;
  radius_m: number;
}

export type HookSourceKindWire = 'presence' | 'camera' | 'device' | 'sensor' | 'web_watch' | 'cart' | 'connector';

export interface HookSourceWire {
  id: string;
  kind: HookSourceKindWire;
  label: string;
  events: { id: string; label: string }[];
}

export interface HookSourcesWire {
  places: PlaceWire[];
  sources: HookSourceWire[];
}

export interface CartItemWire {
  id: string;
  url: string;
  title: string;
  picture: string | null;
  site: string;
  price: MoneyWire | null;
  previous: MoneyWire | null;
  lowest: MoneyWire | null;
  highest: MoneyWire | null;
  target: MoneyWire | null;
  in_stock: boolean | null;
  history: { at: string; amount: number }[];
  status: 'ok' | 'checking' | 'failing';
  checked_at: string | null;
  next_check_at: string | null;
  every_hours: number;
  collection: string | null;
  notify: 'drop' | 'target' | 'stock' | 'any';
}

export interface CartWriteWire {
  url?: string;
  target?: MoneyWire | null;
  collection?: string | null;
  every_hours?: number;
  notify?: CartItemWire['notify'];
}

export type ConnectorCategoryWire = 'mail' | 'calendar' | 'home' | 'web' | 'travel' | 'weather' | 'music' | 'money' | 'custom';

export interface ConnectorFieldWire {
  key: string;
  label: string;
  kind: 'text' | 'secret' | 'url' | 'toggle' | 'select';
  options?: string[];
  required: boolean;
  help?: string;
}

export interface ConnectorWire {
  id: string;
  name: string;
  summary: string;
  icon: string;
  category: ConnectorCategoryWire;
  status: 'connected' | 'available' | 'needs_setup' | 'error';
  status_detail: string | null;
  kind: 'built_in' | 'account' | 'mcp' | 'webhook';
  provides: { tools: number; events: { id: string; label: string }[]; feeds: ('news' | 'todos' | 'ideas')[] };
  setup: { fields: ConnectorFieldWire[]; oauth: string | null };
  /** Only on the answer to `POST /me/connectors/webhook`, and only that once. */
  webhook_url?: string;
}

export interface IdeaWire {
  id: string;
  title: string;
  pitch: string;
  why: string;
  grounded_in: { kind: 'interest' | 'memory' | 'conversation'; label: string }[];
  sources: SourceRefWire[];
  picture: string | null;
  goose_can: { label: string; kind: 'research' | 'watch' | 'todo' | 'schedule' | 'chat' } | null;
  you_can: string[];
  state: 'new' | 'working' | 'done' | 'dismissed';
  progress: { task_id: string } | null;
  created_at: string;
}

export type CatalogOpensWire =
  | 'news' | 'todos' | 'cart' | 'connectors' | 'ideas' | 'interests' | 'agents' | 'web_watches' | 'cameras'
  | 'voice' | 'models' | 'settings';

export interface CatalogItemWire {
  id: string;
  title: string;
  body: string;
  icon: string;
  state: 'on' | 'off' | 'needs_setup';
  try: string | null;
  opens: CatalogOpensWire | null;
}
