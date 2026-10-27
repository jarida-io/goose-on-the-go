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

export interface Device {
  id: string;
  name: string;
  device_type?: string;
  hostname?: string;
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
export interface UpdateDeviceRequest {
  name: string;
  hostname?: string;
  room?: string;
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

export interface SessionSummary {
  id: string;
  title?: string;
  /** How the conversation opened, for a history card. Absent on older servers. */
  preview?: string;
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

/**
 * `POST /api/v1/chat/stream`. The only chat route that honours `images` and
 * `voice_mode`: `/chat` parses both and then drops them.
 */
export interface ChatStreamRequest {
  message: string;
  session_id?: string;
  images?: ImageAttachment[];
  /** Shorter answers and no reasoning passage, because they will be spoken. */
  voice_mode?: boolean;
  /** Keep the turn running if the connection drops, so it can be reattached. */
  resumable?: boolean;
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
  /** `tool_result`: a card hint, live only — history keeps just the text. */
  ui?: { card_type?: string; data?: Record<string, unknown> };
  run_id?: string;
  session_id?: string;
  epoch?: number | string;
  error?: string;
  done?: boolean;
  interrupted?: boolean;
  /** Our own: the stream's `id:` line, for reattaching after a drop. */
  seq?: number;
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

export interface ModelCapabilities {
  thinking: boolean;
  vision: boolean;
  audio_input: boolean;
  context_window_tokens: number;
  structured_output: boolean;
  tool_calling: boolean;
}

export interface ModelActiveRoles {
  [role: string]: string | null;
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
}

/** `PUT /schedules/{id}`. Absent fields are left as they are. */
export interface UpdateScheduleRequest {
  name?: string;
  cron?: string;
  timezone?: string;
  prompt?: string;
  fire_at?: string;
  once?: boolean;
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
  required_secrets: SecretRequirement[];
}

// ── OAuth ─────────────────────────────────────────────────────

export interface OAuthProvider {
  id: string;
  display_name: string;
  scopes: string[];
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

/** `GET /api/v1/web-search`. */
export interface WebSearchState {
  provider: 'brave';
  configured: boolean;
  status: WebSearchStatus;
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
}

/**
 * `GET /api/v1/music/now-playing` -- a Spotify snapshot. `connected: false` is no account (or a
 * refused network); `connected: true, playing: false` is the only genuine "nothing playing".
 * `error` is set when Spotify answered and refused, in which case nothing here can be trusted.
 */
export interface NowPlayingResponse {
  connected: boolean;
  playing?: boolean;
  track?: string;
  artist?: string;
  error?: string;
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
  suggestion_generation_enabled: boolean;
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

  // Automations
  schedule_max_concurrent: number;
  schedule_max_runs_per_task: number;
  unprompted_speech_enabled: boolean;
  unprompted_speech_categories: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
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

// ── Owner setup ───────────────────────────────────────────────

/** `GET /api/v1/onboard/status`. `current_step` is the furthest step recorded, PascalCase, or `not_started`. */
export interface OnboardStatus {
  onboarded: boolean;
  current_step: string;
  steps_completed: number;
  total_steps: number;
}

/** `POST /api/v1/onboard/complete`: done, or the settings it refused to finish without. */
export type OnboardCompletion = { completed: true } | { completed: false; missing: string[] };

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

/** `POST /api/v1/voice/calibrate`: what the Pond heard in one take. */
export interface CalibrationTake {
  transcript: string;
  normalized: string;
  /** The wake phrase as heard in this take; null when the take did not contain it. */
  heard: string | null;
  new_variant: boolean;
  all_variants: string[];
  sample_count: number;
  target_count: number;
  complete: boolean;
}
