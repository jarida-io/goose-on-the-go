/**
 * The controls that edit the Pond's settings, the defaults the mock answers with, and the
 * conversions between what the Pond stores and what a household reads.
 */

import type { IconName } from '@/constants/icons';
import type { TileColor } from '@/constants/colors';
import type { TranslationKey } from '@/services/i18n';
import type { PondSettingKey, PondSettings } from '@/services/types';

type KeysOf<V> = { [K in PondSettingKey]: PondSettings[K] extends V ? K : never }[PondSettingKey];

export type BoolSettingKey = KeysOf<boolean>;
export type NumberSettingKey = KeysOf<number>;
/** Text fields, including the ones the Pond stores as null when empty. */
export type TextSettingKey = KeysOf<string> | KeysOf<string | null>;
/** Text fields with a fixed set of values. */
export type ChoiceSettingKey = KeysOf<string>;

export interface ChoiceOption {
  value: string;
  labelKey: TranslationKey;
  hintKey?: TranslationKey;
}

/** What a control needs besides its field: its words, and whether a change waits for a restart. */
interface ItemBase {
  labelKey: TranslationKey;
  hintKey?: TranslationKey;
  /** Read once when the Pond starts, so a change waits for the next restart. */
  restart?: boolean;
}

export type SettingItem =
  | (ItemBase & { kind: 'switch'; key: BoolSettingKey })
  | (ItemBase & {
      kind: 'toggle';
      key: ChoiceSettingKey;
      /** Written when switched on. Any stored value but `off` reads as on, so older values still do. */
      on: string;
      off: string;
    })
  | (ItemBase & {
      kind: 'choice';
      key: ChoiceSettingKey;
      options: ChoiceOption[];
      /** `radio` lists every option with its description; `menu` shows the value and opens a list. */
      display: 'radio' | 'menu';
    })
  | (ItemBase & {
      kind: 'text';
      key: TextSettingKey;
      placeholderKey?: TranslationKey;
      multiline?: boolean;
      /** Stored as null when emptied, which the Pond reads as "use the built-in one". */
      nullable?: boolean;
      /** An address: no capitals, no autocorrect, a URL keyboard. */
      address?: boolean;
    })
  | (ItemBase & {
      kind: 'number';
      key: NumberSettingKey;
      min: number;
      max?: number;
      step: number;
      /** Values − and + move between, for a wide range where most whole numbers are not worth a tap. */
      stops?: readonly number[];
      unitKey?: TranslationKey;
    })
  | (ItemBase & {
      kind: 'slider';
      key: NumberSettingKey;
      min: number;
      max: number;
      step: number;
      format: SliderFormat;
    })
  | (ItemBase & { kind: 'time'; key: KeysOf<string> })
  | (ItemBase & {
      kind: 'list';
      key: 'voice_wake_word_transcriptions' | 'suggestions_muted';
      emptyKey: TranslationKey;
    })
  | (ItemBase & { kind: 'link'; route: string; icon?: IconName; tile?: TileColor; summary?: SummaryId })
  | { kind: 'special'; id: SpecialId };

/** Controls drawn by their own component, because they read more than one field or another route. */
export type SpecialId =
  | 'voicePicker'
  | 'roomVoice'
  | 'roomInterrupts'
  | 'wakeWordReset'
  | 'timezone'
  | 'location'
  | 'retitle'
  | 'retentionOverrides'
  | 'speechCategories'
  | 'toolModel'
  | 'chatProvider'
  | 'llmProvider'
  | 'primaryProfile'
  | 'theme'
  | 'accent'
  | 'haptics'
  | 'posture'
  | 'visionStatus'
  | 'visionEventTypes'
  | 'debugScreen'
  | 'stayConnected'
  | 'replyNotices'
  | 'phoneAssistant';

export type SliderFormat = 'pace' | 'creativity' | 'fraction';

/** A row value shown on a menu, worked out from the settings and what else the phone knows. */
export type SummaryId =
  | 'remoteAccess'
  | 'speaking'
  | 'internet'
  | 'webSearch'
  | 'assistant'
  | 'voice'
  | 'wakeWord'
  | 'thinking'
  | 'models'
  | 'memory'
  | 'tools'
  | 'extensions'
  | 'home'
  | 'household'
  | 'people'
  | 'cameras'
  | 'visionEvents'
  | 'faces'
  | 'visionAutomations'
  | 'announcements'
  | 'privacy'
  | 'retention'
  | 'appearance'
  | 'timezone';

export interface SettingsSection {
  titleKey?: TranslationKey;
  footerKey?: TranslationKey;
  items: SettingItem[];
}

export type SettingsPageId =
  | 'assistant'
  | 'voice'
  | 'speaking'
  | 'listening'
  | 'thinking'
  | 'memory'
  | 'memoryTuning'
  | 'tools'
  | 'internet'
  | 'home'
  | 'household'
  | 'cameras'
  | 'announcements'
  | 'privacy'
  | 'retention'
  | 'appearance'
  | 'phoneNotifications'
  | 'advanced';

export interface SettingsPage {
  id: SettingsPageId;
  icon: IconName;
  tile: TileColor;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  sections: SettingsSection[];
}

/** The fields a page edits, for tests and for counting what a page holds. */
export function pageKeys(page: SettingsPage): PondSettingKey[] {
  return page.sections.flatMap((section) =>
    section.items.flatMap((item) => ('key' in item ? [item.key as PondSettingKey] : [])),
  );
}

/**
 * The Pond's own defaults (`impl Default for Settings`), which the mock source answers with so the
 * screens can be built and looked at without a Pond.
 */
export const SAMPLE_SETTINGS: PondSettings = {
  user_name: 'Friend',
  assistant_name: 'Goose',
  assistant_personality: 'friendly and concise',
  primary_profile_id: null,
  home_name: '',
  timezone: 'Africa/Nairobi',
  weather_enabled: true,
  weather_location_name: 'Nairobi',
  weather_latitude: -1.2864,
  weather_longitude: 36.8172,
  // Listed so `readSettings` keeps it: it drops every key not named here, and without this one the
  // phone took a Pond holding a phone's fix for a guess and asked for home's location on every start.
  // Empty is what an older Pond sends, which counts as a guess.
  weather_location_source: '',
  prompt_style: 'balanced',
  prompt_addendum: '',
  custom_system_prompt: null,
  voice_wake_word: 'hey goose',
  voice_wake_word_transcriptions: [],
  voice_kws_energy_threshold: 0.003,
  voice_kws_post_trigger_silence_ms: 400,
  voice_kws_cooldown_ms: 2000,
  voice_recording_duration_secs: 3,
  voice_whisper_url: 'http://127.0.0.1:9000',
  voice_tts_voice: 'af_heart',
  voice_tts_speed: 1,
  voice_tts_quality: 'q8',
  voice_thinking_tone_enabled: true,
  voice_max_turns: 0,
  voice_room_enabled: true,
  chat_provider: '',
  chat_model: '',
  llm_provider: '',
  tool_model: null,
  llm_max_tokens: 4096,
  llm_temperature: 0.7,
  context_window_override: 0,
  embedding_provider: 'auto',
  agent_memory_inject: true,
  agent_memory_limit: 5,
  memory_extraction_enabled: true,
  memory_extraction_max_facts: 3,
  memory_extraction_interval_secs: 60,
  memory_cleanup_enabled: true,
  memory_cleanup_interval_hours: 6,
  memory_prune_threshold: 0.05,
  memory_archive_threshold: 0.15,
  memory_decay_base_half_life_days: 11.25,
  memory_decay_beta: 0.8,
  memory_consolidation_enabled: true,
  memory_consolidation_mode: 'single',
  memory_consolidation_interval_hours: 24,
  memory_consolidation_batch_size: 50,
  mic_enabled: true,
  cameras_enabled: true,
  network_mode: 'open',
  mesh_enabled: false,
  security_policy_mode: 'audit',
  telemetry_enabled: true,
  context_ingest_enabled: false,
  ext_memory_enabled: true,
  ext_schedule_enabled: true,
  ext_weather_enabled: true,
  ext_knowledge_enabled: true,
  ext_system_enabled: true,
  ext_device_enabled: true,
  ext_sensor_enabled: true,
  ext_travel_enabled: false,
  ext_orchestrator_enabled: false,
  ext_context_enabled: false,
  tool_selection_mode: 'all',
  searxng_url: null,
  schedule_max_concurrent: 2,
  schedule_max_runs_per_task: 50,
  unprompted_speech_enabled: false,
  unprompted_speech_categories: 'alert',
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
  notices_wait_in_quiet_hours: true,
  speak_unfetched_reminders: true,
  unseen_phone_skip_days: 14,
  unseen_phone_remove_days: 30,
  lone_voice_sets_reminders: true,
  proactive_review_enabled: false,
  suggestions_muted: [],
  session_titling_enabled: true,
  thinking_mode: 'on',
  reasoning_effort: 'brief',
  show_thinking: true,
  persist_thinking: true,
  review_mode: 'off',
  review_max_rounds: 1,
  review_pass_threshold: 3,
  goal_check_enabled: true,
  agent_max_turns: 50,
  agent_timeout_secs: 300,
  prefix_cache_prompt: true,
  hybrid_compaction_enabled: true,
  summary_idle_secs: 120,
  compaction_verbatim_days: 3,
  context_monitor_enabled: true,
  show_turn_stats: false,
  vision_enabled: false,
  vision_camera_url: '',
  vision_camera_id: 'camera-1',
  vision_fps: 2,
  vision_motion_threshold: 0.05,
  vision_classifier_model: '',
  vision_event_cooldown_secs: 10,
  vision_classifier_confidence: 0.5,
  vision_face_recognition_enabled: true,
  vision_face_on_motion: true,
  vision_event_types: ['motion', 'person', 'pet', 'vehicle', 'package', 'face_detected', 'face_recognized', 'face_unknown'],
  picture_support_download_enabled: false,
  matter_ws_url: 'ws://127.0.0.1:5580/giap',
  matter_ble_enabled: false,
  retention_event_log_days: 30,
  retention_sensor_days: 7,
  retention_session_messages_keep: 500,
  retention_events_days: 30,
  retention_events_by_category: {},
  retention_sensitive_days: 7,
  cloud_input_price_per_million: 2.5,
  cloud_output_price_per_million: 10,
};

/**
 * Fill whatever an older Pond leaves out from the defaults, so a control never reads `undefined`.
 * Anything that is not an object answers the defaults whole.
 */
export function readSettings(raw: unknown): PondSettings {
  if (!raw || typeof raw !== 'object') return { ...SAMPLE_SETTINGS };
  const out = { ...SAMPLE_SETTINGS } as Record<string, unknown>;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key in out && value !== undefined) out[key] = value;
  }
  return out as unknown as PondSettings;
}

// ── Numbers ───────────────────────────────────────────────────

/** The Pond widens decimals through f32 (`0.7` comes back `0.699999988`); show what was meant. */
export function tidyNumber(value: number): number {
  return Number.isFinite(value) ? Number(value.toPrecision(6)) : value;
}

/** A typed number checked against a control's range, or why it cannot be saved. */
export function parseSettingNumber(
  text: string,
  { min, max, step }: { min: number; max?: number; step: number },
): { value: number } | { error: 'notNumber' | 'whole' | 'tooSmall' | 'tooBig' } {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed || !/^-?\d*\.?\d+$/.test(trimmed)) return { error: 'notNumber' };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { error: 'notNumber' };
  if (Number.isInteger(step) && !Number.isInteger(value)) return { error: 'whole' };
  if (value < min) return { error: 'tooSmall' };
  if (max !== undefined && value > max) return { error: 'tooBig' };
  return { value };
}

/** The stop past `value` in the direction of `delta`; a value between stops lands on the nearer side. */
export function nextStop(stops: readonly number[], value: number, delta: number): number {
  const sorted = [...stops].sort((a, b) => a - b);
  const found = delta > 0 ? sorted.find((s) => s > value) : [...sorted].reverse().find((s) => s < value);
  return found ?? value;
}

// ── Clock times ───────────────────────────────────────────────

/** `HH:MM` as the Pond stores quiet hours, or null when it is not one. */
export function parseClock(text: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

export function formatClock(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// ── Lists the Pond stores as text ─────────────────────────────

/** `alert, security` into its categories: lowercase, deduplicated, empty entries dropped. */
export function splitCategories(text: string): string[] {
  return [...new Set(text.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean))];
}

/** Per-category retention as the household writes it, `network 14, sensor 7`. */
export function formatRetentionOverrides(map: Record<string, number>): string {
  return Object.entries(map)
    .map(([category, days]) => `${category} ${days}`)
    .join(', ');
}

/** The reverse, or null when a pair is not `name days`. */
export function parseRetentionOverrides(text: string): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const part of text.split(',').map((p) => p.trim()).filter(Boolean)) {
    const m = /^([a-z_]+)\s+(\d+)$/.exec(part.toLowerCase());
    if (!m) return null;
    out[m[1]] = Number(m[2]);
  }
  return out;
}

// ── Voices ────────────────────────────────────────────────────

/**
 * Kokoro names its voices `<language><gender>_<name>`, `af_heart`. The language letters, in the
 * order the picker offers them.
 */
export const VOICE_LANGUAGES = ['a', 'b', 'e', 'f', 'h', 'i', 'j', 'p', 'z'] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];

export interface VoiceInfo {
  id: string;
  /** `Van Dyke` from `van_dyke`. */
  name: string;
  language: VoiceLanguage | null;
  gender: 'f' | 'm' | null;
  /** Kokoro's published grade for the voice's training data, when it publishes one. */
  grade: string | null;
}

/** Kokoro's grades from its `VOICES.md`, which pond-desktop shows beside each English voice. */
const VOICE_GRADES: Record<string, string> = {
  af_heart: 'A', af_bella: 'A-', af_nicole: 'B-', af_aoede: 'C+', af_kore: 'C+',
  af_sarah: 'C+', af_alloy: 'C', af_nova: 'C', af_sky: 'C-', af_jessica: 'D', af_river: 'D',
  am_fenrir: 'C+', am_michael: 'C+', am_puck: 'C+', am_echo: 'D', am_eric: 'D',
  am_liam: 'D', am_onyx: 'D', am_santa: 'D-', am_adam: 'F+',
  bf_emma: 'B-', bf_isabella: 'C', bf_alice: 'D', bf_lily: 'D',
  bm_fable: 'C', bm_george: 'C', bm_lewis: 'D+', bm_daniel: 'D',
};

/** Kokoro's graded voices, which a Pond fetches by name before it is set up enough to list its models. */
export const KNOWN_VOICES: readonly string[] = Object.keys(VOICE_GRADES);

function titleCase(segment: string): string {
  return segment
    .split(/[_-]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** A zone the way a clock app names it: its city, not the region that files it. */
export function zoneCity(zone: string): string {
  const city = zone.split('/').pop() ?? zone;
  return city.replace(/_/g, ' ');
}

/** The Pond stores no voice until one is chosen, and Kokoro then speaks in this one. */
export const DEFAULT_VOICE = 'af_heart';

/** The voice that is actually speaking, so an unchosen voice reads as one, not as missing. */
export function voiceInUse(id: string): string {
  return id.trim() || DEFAULT_VOICE;
}

export function describeVoice(id: string): VoiceInfo {
  const m = /^([a-z])([fm])_(.+)$/.exec(id);
  const language = m && (VOICE_LANGUAGES as readonly string[]).includes(m[1]) ? (m[1] as VoiceLanguage) : null;
  return {
    id,
    name: titleCase(m ? m[3] : id),
    language,
    gender: m ? (m[2] as 'f' | 'm') : null,
    grade: VOICE_GRADES[id] ?? null,
  };
}

/** A to F, ungraded last, then by name, so the best-trained voice of an accent comes first. */
export function sortVoices(voices: VoiceInfo[]): VoiceInfo[] {
  const rank = (v: VoiceInfo) => {
    if (!v.grade) return 99;
    const modifier = v.grade[1] === '+' ? -0.3 : v.grade[1] === '-' ? 0.3 : 0;
    return 'ABCDF'.indexOf(v.grade[0]) + modifier;
  };
  return [...voices].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** The pace a household reads, from the engine's multiplier. */
export function paceWord(speed: number): 'muchSlower' | 'slower' | 'natural' | 'faster' | 'muchFaster' {
  if (speed < 0.7) return 'muchSlower';
  if (speed < 0.9) return 'slower';
  if (speed <= 1.1) return 'natural';
  if (speed <= 1.35) return 'faster';
  return 'muchFaster';
}

/** Kokoro's quality tiers, in the order pond-desktop offers them, with their download size. */
export const VOICE_QUALITY_SIZES_MB: Record<string, number> = {
  q8: 92,
  q8f16: 86,
  q4f16: 155,
  fp16: 163,
  fp32: 326,
};

// ── Engines ───────────────────────────────────────────────────

/**
 * Where a model runs, as the Pond's providers name it. A GGUF or LiteRT file runs inside the Pond,
 * which the Pond calls `local`.
 */
export function providerOf(category: string): string {
  return category === 'gguf' || category === 'litert' ? 'local' : category;
}

// ── What the Pond is doing, in one sentence ───────────────────

export interface Posture {
  listens: boolean;
  watches: boolean;
  remembers: boolean;
  speaksFirst: boolean;
  reach: 'open' | 'allowlist' | 'offline';
}

export function postureOf(s: PondSettings): Posture {
  const reach = s.network_mode === 'allowlist' || s.network_mode === 'offline' ? s.network_mode : 'open';
  return {
    listens: s.mic_enabled,
    watches: s.vision_enabled && s.cameras_enabled,
    remembers: s.memory_extraction_enabled,
    speaksFirst: s.unprompted_speech_enabled,
    reach,
  };
}

/** The built-in tool modules, for the Tools row's "7 of 10 on". */
export const TOOL_SWITCHES = [
  'ext_memory_enabled',
  'ext_schedule_enabled',
  'ext_weather_enabled',
  'ext_knowledge_enabled',
  'ext_system_enabled',
  'ext_device_enabled',
  'ext_sensor_enabled',
  'ext_travel_enabled',
  'ext_orchestrator_enabled',
  'ext_context_enabled',
] as const satisfies readonly BoolSettingKey[];

export function toolsOn(s: PondSettings): number {
  return TOOL_SWITCHES.filter((key) => s[key]).length;
}
