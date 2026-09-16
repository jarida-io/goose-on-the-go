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

// ── Memory ────────────────────────────────────────────────────

export type MemoryTier = 'short' | 'long' | 'permanent';
export type MemoryLifecycle = 'active' | 'archived' | 'merged';

export interface MemoryFragment {
  id: string;
  content: string;
  source?: string;
  tags?: string[];
  created_at: string;
  importance?: number;
  tier?: MemoryTier;
  lifecycle?: MemoryLifecycle;
  access_count: number;
  last_accessed_at?: string;
  superseded_by?: string;
}

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
}

/** The category buckets `GET /api/v1/models` answers with. */
export const MODEL_CATEGORIES = [
  'gguf',
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
  status: 'running' | 'completed' | 'failed';
  result: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
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

// ── Logs and activity ─────────────────────────────────────────

export interface LogEntry {
  id: number;
  timestamp: string;
  /** INFO | WARN | ERROR */
  level: string;
  source: string;
  message: string;
  /** JSON, as a string. */
  metadata?: string;
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

export interface ActivitySummary {
  window: string;
  since: string;
  total: number;
  by_category: Record<string, number>;
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

export interface SecretRequirement {
  key: string;
  display_name: string;
  description: string;
  required: boolean;
  kind: 'api_key' | 'oauth_flow' | 'generic';
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
}
