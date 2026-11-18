/**
 * What the Settings pages read besides the settings record: the menu values on each row, and the
 * lists some controls choose from. Each read is made only by a page that shows it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TFunction } from 'i18next';

import { useServer } from '@/providers/server-provider';
import { useTheme } from '@/providers/theme-provider';
import { ApiError, api } from '@/services/api-client';
import { readPhoneFix, sendHomeLocation } from '@/services/home-location';
import i18n from '@/services/i18n';
import type { ModelEntry, PondSettings, Profile, WebSearchStatus, ZoneChoice } from '@/services/types';
import { knownByFace } from '@/models/faces';
import { cameraRules, unacknowledgedCount } from '@/models/vision';
import {
  describeVoice,
  providerOf,
  SAMPLE_SETTINGS,
  toolsOn,
  TOOL_SWITCHES,
  voiceInUse,
  zoneCity,
  type SummaryId,
} from '@/models/pond-settings';
import { describeApiError, logFailure } from './describe-error';
import { useLive } from './use-live';

const EXTRAS_MS = 60_000;

/** The language a Kokoro voice speaks, one literal key per letter. */
export function voiceLanguageKey(language: string | null) {
  switch (language) {
    case 'a':
      return 'settings.voice.lang.a' as const;
    case 'b':
      return 'settings.voice.lang.b' as const;
    case 'e':
      return 'settings.voice.lang.e' as const;
    case 'f':
      return 'settings.voice.lang.f' as const;
    case 'h':
      return 'settings.voice.lang.h' as const;
    case 'i':
      return 'settings.voice.lang.i' as const;
    case 'j':
      return 'settings.voice.lang.j' as const;
    case 'p':
      return 'settings.voice.lang.p' as const;
    case 'z':
      return 'settings.voice.lang.z' as const;
    default:
      return 'settings.voice.lang.other' as const;
  }
}

function themeKey(preference: 'system' | 'light' | 'dark') {
  switch (preference) {
    case 'system':
      return 'settings.theme.system' as const;
    case 'light':
      return 'settings.theme.light' as const;
    case 'dark':
      return 'settings.theme.dark' as const;
  }
}

function networkKey(mode: string) {
  switch (mode) {
    case 'allowlist':
      return 'settings.option.network_mode.allowlist.label' as const;
    case 'offline':
      return 'settings.option.network_mode.offline.label' as const;
    default:
      return 'settings.option.network_mode.open.label' as const;
  }
}

function thinkingKey(mode: string) {
  switch (mode) {
    case 'on':
      return 'settings.option.thinking_mode.on.label' as const;
    case 'off':
      return 'settings.option.thinking_mode.off.label' as const;
    default:
      return 'settings.option.thinking_mode.auto.label' as const;
  }
}

/** Facts from beyond the settings record that some rows show. */
export interface Extras {
  remoteEnabled: boolean;
  webSearch: WebSearchStatus | 'unsupported' | null;
  chatModel: string | null;
  extensions: number | null;
  people: number | null;
  /** How many rooms the household has; null until read, or on a Pond from before rooms had ids. */
  rooms: number | null;
  /** Events nobody has acknowledged, among the latest the Pond lists. */
  visionNew: number | null;
  /** How many people the pond knows by face, or that it has no face model. */
  facesKnown: number | 'unavailable' | null;
  /** How many automations listen to a camera. */
  visionRules: number | null;
  theme: 'system' | 'light' | 'dark';
}

/** What a menu row reads as. Null when there is nothing worth showing beside it. */
export function summarize(id: SummaryId, s: PondSettings | null, x: Extras, t: TFunction): string | null {
  const onOff = (on: boolean) => t(on ? 'settings.summary.on' : 'settings.summary.off');
  switch (id) {
    case 'remoteAccess':
      return onOff(x.remoteEnabled);
    case 'webSearch':
      if (x.webSearch === null || x.webSearch === 'unsupported') return null;
      if (x.webSearch === 'not_configured') return t('settings.summary.off');
      if (x.webSearch === 'rejected') return t('settings.summary.needsKey');
      return t('settings.summary.on');
    case 'models':
      return x.chatModel ?? t('settings.summary.noModel');
    case 'extensions':
      return x.extensions === null ? null : t('settings.summary.extensions', { count: x.extensions });
    case 'people':
      return x.people === null ? null : t('settings.summary.people', { count: x.people });
    case 'rooms':
      return x.rooms === null ? null : t('settings.summary.rooms', { count: x.rooms });
    case 'visionEvents':
      if (x.visionNew === null) return null;
      return x.visionNew === 0 ? t('settings.summary.eventsNone') : t('settings.summary.eventsNew', { count: x.visionNew });
    case 'faces':
      if (x.facesKnown === null) return null;
      if (x.facesKnown === 'unavailable') return t('settings.summary.facesUnavailable');
      return x.facesKnown === 0 ? t('settings.summary.facesNone') : t('settings.summary.facesKnown', { count: x.facesKnown });
    case 'visionAutomations':
      if (x.visionRules === null) return null;
      return x.visionRules === 0 ? t('settings.summary.rulesNone') : t('settings.summary.rules', { count: x.visionRules });
    case 'appearance':
      return t(themeKey(x.theme));
    default:
      break;
  }
  if (!s) return null;
  switch (id) {
    case 'internet':
      return t(networkKey(s.network_mode));
    case 'assistant':
      return s.assistant_name || null;
    case 'speaking':
      return describeVoice(voiceInUse(s.voice_tts_voice)).name;
    case 'voice':
    case 'wakeWord':
      return s.voice_wake_word ? t('settings.summary.wakeWord', { word: s.voice_wake_word }) : null;
    case 'thinking':
      return t(thinkingKey(s.thinking_mode));
    case 'memory':
      return s.memory_extraction_enabled ? t('settings.summary.learning') : t('settings.summary.off');
    case 'tools':
      return t('settings.summary.tools', { on: toolsOn(s), total: TOOL_SWITCHES.length });
    case 'home':
      return s.weather_location_name || (s.timezone ? zoneCity(s.timezone) : null);
    case 'household':
      return s.user_name || null;
    case 'cameras':
      return onOff(s.vision_enabled && s.cameras_enabled);
    case 'announcements':
      return s.unprompted_speech_enabled
        ? t('settings.summary.quiet', { start: s.quiet_hours_start, end: s.quiet_hours_end })
        : t('settings.summary.off');
    case 'privacy':
      return t(s.mic_enabled ? 'settings.summary.micOn' : 'settings.summary.micOff');
    case 'retention':
      return s.retention_event_log_days === 0
        ? t('settings.summary.forever')
        : t('settings.summary.days', { count: s.retention_event_log_days });
    case 'timezone':
      return s.timezone ? zoneCity(s.timezone) : null;
    default:
      return null;
  }
}

/** The chat model's title from the active-roles answer, whichever shape the Pond sends it in. */
export function chatModelTitle(roles: unknown): string | null {
  if (!roles || typeof roles !== 'object') return null;
  const chat = (roles as Record<string, unknown>).chat;
  if (typeof chat === 'string') return chat || null;
  if (chat && typeof chat === 'object') {
    const model = (chat as Record<string, unknown>).model;
    return typeof model === 'string' && model ? model : null;
  }
  return null;
}

/**
 * Reads made only for the rows a page shows.
 *
 * @param cameraId The camera whose events the Vision events row counts: the Pond lists one camera
 *   per read, and the settings name it. Null until they are known.
 */
export function useSummaryExtras(ids: readonly SummaryId[], cameraId: string | null = null): Extras {
  const { hydrated, remoteEnabled, isScreenReal } = useServer();
  const { preference } = useTheme();
  const real = isScreenReal('settings');
  const webReal = isScreenReal('webSearch');
  const want = useMemo(() => new Set(ids), [ids]);
  const [webSearch, setWebSearch] = useState<Extras['webSearch']>(null);
  const [chatModel, setChatModel] = useState<string | null>(null);
  const [extensions, setExtensions] = useState<number | null>(null);
  const [people, setPeople] = useState<number | null>(null);
  const [rooms, setRooms] = useState<number | null>(null);
  const [visionNew, setVisionNew] = useState<number | null>(null);
  const [facesKnown, setFacesKnown] = useState<Extras['facesKnown']>(null);
  const [visionRules, setVisionRules] = useState<number | null>(null);

  const read = useCallback(async () => {
    if (!real) return;
    const jobs: Promise<void>[] = [];
    if (want.has('webSearch') && webReal) {
      jobs.push(
        api.webSearchState().then(
          (s) => setWebSearch(s.status),
          (e) => setWebSearch(e instanceof ApiError && e.status === 404 ? 'unsupported' : null),
        ),
      );
    }
    if (want.has('models')) jobs.push(api.activeModelRoles().then((r) => setChatModel(chatModelTitle(r)), () => undefined));
    if (want.has('extensions')) jobs.push(api.listExtensions().then((l) => setExtensions(l.length), () => undefined));
    if (want.has('people')) jobs.push(api.listProfiles().then((l) => setPeople(l.length), () => undefined));
    if (want.has('rooms')) jobs.push(api.listRooms().then((l) => setRooms(l.length), () => undefined));
    if (want.has('visionEvents') && cameraId) {
      jobs.push(api.listCameraEvents(cameraId, 100).then((l) => setVisionNew(unacknowledgedCount(l)), () => undefined));
    }
    if (want.has('faces')) {
      jobs.push(
        api.listFaces().then(
          (o) => setFacesKnown(o.available ? knownByFace(o.people) : 'unavailable'),
          () => undefined,
        ),
      );
    }
    if (want.has('visionAutomations')) {
      jobs.push(api.listRules().then((l) => setVisionRules(cameraRules(l).length), () => undefined));
    }
    await Promise.all(jobs);
  }, [real, webReal, want, cameraId]);

  useLive(read, EXTRAS_MS, hydrated && real);

  // The camera is named by the settings, which arrive after the first read: count its events when
  // they do, rather than leave the row blank until the next minute.
  const countsEvents = want.has('visionEvents');
  useEffect(() => {
    if (hydrated && real && countsEvents && cameraId) void read();
  }, [hydrated, real, countsEvents, cameraId, read]);

  return {
    remoteEnabled,
    webSearch: real ? webSearch : 'not_configured',
    chatModel: real ? chatModel : null,
    extensions: real ? extensions : 0,
    people: real ? people : 1,
    rooms: real ? rooms : null,
    visionNew: real ? visionNew : 0,
    facesKnown: real ? facesKnown : 0,
    visionRules: real ? visionRules : 0,
    theme: preference,
  };
}

// ── Lists to choose from ──────────────────────────────────────

const LLM_CATEGORIES = new Set(['gguf', 'litert', 'llamafile', 'ollama']);

export interface Choices<T> {
  items: T[];
  loading: boolean;
  /** The last read failed. Words for it; the list keeps whatever an earlier read found. */
  error: string | null;
  /** Reads the choices again now, rather than at the next poll. */
  refresh: () => Promise<void>;
}

function useChoices<T>(read: () => Promise<T[]>, sample: T[], enabled: boolean): Choices<T> {
  const { hydrated, isScreenReal } = useServer();
  const real = isScreenReal('settings');
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!real || !enabled) return;
    try {
      setItems(await read());
      setError(null);
    } catch (e) {
      logFailure('settings', 'choices read failed', e);
      setError(describeApiError(e) ?? i18n.t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [real, enabled, read]);

  useLive(load, EXTRAS_MS, hydrated && real && enabled);
  return real
    ? { items, loading: loading && enabled, error, refresh: load }
    : { items: sample, loading: false, error: null, refresh: load };
}

const readModels = () => api.listModels();
const SAMPLE_MODELS: ModelEntry[] = [
  { id: 'gguf:qwen3-4b', category: 'gguf', name: 'qwen3-4b', downloaded: true, active: true },
  { id: 'gguf:qwen3-0.6b', category: 'gguf', name: 'qwen3-0.6b', downloaded: true, active: false },
  { id: 'tts:af_heart', category: 'tts', name: 'af_heart', downloaded: true, active: true },
  { id: 'tts:af_bella', category: 'tts', name: 'af_bella', downloaded: false, active: false },
  { id: 'tts:bf_emma', category: 'tts', name: 'bf_emma', downloaded: false, active: false },
  { id: 'tts:am_michael', category: 'tts', name: 'am_michael', downloaded: false, active: false },
];

export function useModelChoices(enabled = true): Choices<ModelEntry> {
  return useChoices(readModels, SAMPLE_MODELS, enabled);
}

/** Downloaded language models, for the tool helper. */
export function llmModels(models: ModelEntry[]): ModelEntry[] {
  return models.filter((m) => LLM_CATEGORIES.has(m.category) && m.downloaded !== false);
}

/** Where conversation can run, from the engines of the models on this Pond. */
export function providerChoices(models: ModelEntry[], meshEnabled: boolean): string[] {
  const providers = new Set(llmModels(models).map((m) => providerOf(m.category)));
  if (meshEnabled) providers.add('mesh');
  return [...providers];
}

export interface VoiceChoice {
  id: string;
  installed: boolean;
}

/** The Pond's voices: every Kokoro voice it lists, downloaded or not. */
export function voiceChoices(models: ModelEntry[]): VoiceChoice[] {
  return models
    .filter((m) => m.category === 'tts')
    .map((m) => ({ id: m.name, installed: m.downloaded !== false }));
}

const readProfiles = () => api.listProfiles();

export function useProfileChoices(enabled = true): Choices<Profile> {
  return useChoices(readProfiles, [], enabled);
}

const readZones = () => api.listTimeZones();
const SAMPLE_ZONES: ZoneChoice[] = [
  { zone: 'Africa/Nairobi', offset: '+03:00', place: 'Nairobi' },
  { zone: 'Africa/Lagos', offset: '+01:00', place: 'Lagos' },
  { zone: 'Europe/London', offset: '+01:00', place: 'London' },
  { zone: 'America/New_York', offset: '-04:00', place: 'New York' },
  { zone: 'Asia/Tokyo', offset: '+09:00', place: 'Tokyo' },
  { zone: 'UTC', offset: '+00:00', place: 'Coordinated Universal Time' },
];

export function useTimeZones(): Choices<ZoneChoice> {
  return useChoices(readZones, SAMPLE_ZONES, true);
}

/** The zones a search matches, by zone name, place or offset, ignoring case and underscores. */
export function searchZones(zones: ZoneChoice[], query: string): ZoneChoice[] {
  const q = query.trim().toLowerCase().replace(/_/g, ' ');
  if (!q) return zones;
  return zones.filter((z) =>
    [z.zone.replace(/_/g, ' '), z.place, z.offset].some((field) => field.toLowerCase().includes(q)),
  );
}

// ── One-off actions ───────────────────────────────────────────

export type ActionState = { busy: boolean; message: string | null; tone: 'neutral' | 'danger' };

const IDLE: ActionState = { busy: false, message: null, tone: 'neutral' };

/** Ask the Pond to name conversations now. */
export function useRetitle(): ActionState & { run: () => Promise<void> } {
  const { isScreenReal } = useServer();
  const [state, setState] = useState<ActionState>(IDLE);
  const run = useCallback(async () => {
    setState({ busy: true, message: null, tone: 'neutral' });
    if (!isScreenReal('settings')) {
      setState({ busy: false, message: i18n.t('settings.retitle.started'), tone: 'neutral' });
      return;
    }
    try {
      const result = await api.retitleSessions();
      setState({ busy: false, message: i18n.t(result.started ? 'settings.retitle.started' : 'settings.retitle.idle'), tone: 'neutral' });
    } catch (e) {
      setState({ busy: false, message: describeApiError(e) ?? i18n.t('settings.retitle.failed'), tone: 'danger' });
    }
  }, [isScreenReal]);
  return { ...state, run };
}

/** Where the Pond thinks this home is. Saves nothing; the caller stores what it keeps. */
export function useDetectLocation(): ActionState & {
  run: (typed: string) => Promise<{ name: string; timezone: string } | null>;
} {
  const { isScreenReal } = useServer();
  const [state, setState] = useState<ActionState>(IDLE);
  const run = useCallback(
    async (typed: string) => {
      setState({ busy: true, message: null, tone: 'neutral' });
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!isScreenReal('settings')) {
        const name = typed.trim() || SAMPLE_SETTINGS.weather_location_name;
        setState({ busy: false, message: i18n.t('settings.location.found', { name }), tone: 'neutral' });
        return { name, timezone: zone };
      }
      try {
        const place = await api.detectLocation({ system_zone: zone, typed_name: typed.trim() || undefined });
        const message = place.source === 'timezone'
          ? i18n.t('settings.location.guessed', { name: place.name })
          : place.note ?? i18n.t('settings.location.found', { name: place.name });
        setState({ busy: false, message, tone: 'neutral' });
        return { name: place.name, timezone: place.timezone };
      } catch (e) {
        setState({ busy: false, message: describeApiError(e) ?? i18n.t('settings.location.failed'), tone: 'danger' });
        return null;
      }
    },
    [isScreenReal],
  );
  return { ...state, run };
}

/** What "Find my location" came to: the Pond saved this phone's fix, or a guess to save. */
export type FoundLocation = { kind: 'saved'; name: string } | { kind: 'guess'; name: string; timezone: string };

/**
 * "Find my location". At home (the connection is `local`), this phone's own fix, which the Pond
 * saves itself; it asks for location permission if it has none. Away, the Pond's guess from the
 * time zone or the typed name, as before, with a word that home is where the phone can do better:
 * a phone away from home must not move the household (the Pond refuses it too).
 */
export function useFindLocation(): ActionState & { run: (typed: string) => Promise<FoundLocation | null> } {
  const { connectionState, isScreenReal } = useServer();
  const detect = useDetectLocation();
  const [state, setState] = useState<ActionState>(IDLE);
  const atHome = connectionState === 'local' && isScreenReal('settings');
  const run = useCallback(
    async (typed: string): Promise<FoundLocation | null> => {
      if (!atHome) {
        const place = await detect.run(typed);
        return place ? { kind: 'guess', ...place } : null;
      }
      setState({ busy: true, message: null, tone: 'neutral' });
      const fix = await readPhoneFix(true);
      if (fix.kind === 'denied') {
        setState({ busy: false, message: i18n.t(fix.canAskAgain ? 'settings.location.allow' : 'settings.location.allowInSettings'), tone: 'danger' });
        return null;
      }
      if (fix.kind === 'unavailable') {
        setState({ busy: false, message: i18n.t('settings.location.noFix'), tone: 'danger' });
        return null;
      }
      try {
        const result = await sendHomeLocation(fix, true);
        setState({ busy: false, message: i18n.t('settings.location.fromPhone', { name: result.name }), tone: 'neutral' });
        return { kind: 'saved', name: result.name };
      } catch (e) {
        const away = e instanceof ApiError && e.status === 403 && e.detail === 'not_on_home_network';
        setState({ busy: false, message: away ? i18n.t('settings.location.atHome') : describeApiError(e) ?? i18n.t('settings.location.failed'), tone: 'danger' });
        return null;
      }
    },
    [atHome, detect],
  );
  return atHome ? { ...state, run } : { ...detect, message: detect.message && `${detect.message} ${i18n.t('settings.location.atHome')}`, run };
}

/** Forget the wake word's learned pronunciations. Resolves to whether the Pond did. */
export function useResetWakeWord(): ActionState & { run: () => Promise<boolean> } {
  const { isScreenReal } = useServer();
  const [state, setState] = useState<ActionState>(IDLE);
  const run = useCallback(async () => {
    if (!isScreenReal('settings')) return true;
    setState({ busy: true, message: null, tone: 'neutral' });
    try {
      await api.resetWakeWordCalibration();
      setState(IDLE);
      return true;
    } catch (e) {
      setState({ busy: false, message: describeApiError(e) ?? i18n.t('settings.wake.clearFailed'), tone: 'danger' });
      return false;
    }
  }, [isScreenReal]);
  return { ...state, run };
}
