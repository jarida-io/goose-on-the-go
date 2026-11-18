/**
 * What Goose's tools are called when a person is watching.
 *
 * The Pond names a tool `extension__tool` — `giap-weather__get_current_weather`
 * — and has no display names of its own; pond-desktop keeps them client-side
 * (`ToolCallChip.tsx`, `chatRunStore.ts`), and these are its choices in this
 * app's sentence case. The key is the bare name after the `__`, because the
 * same tool can be served by a differently named extension.
 *
 * A tool nobody has named here is shown as its own name with the underscores
 * taken out. That is a raw identifier reaching the screen, which the app
 * otherwise refuses — but extensions are installed on the Pond, not in this
 * app, and a tool it has never heard of still did something worth showing.
 */

import type { TFunction } from 'i18next';

import type { IconName } from '@/constants/icons';
import type { ToolCall } from '@/models/chat';
import type { TranslationKey } from '@/services/i18n';

interface ToolWords {
  /** What the card is called. */
  label: TranslationKey;
  /** What Goose is doing while it runs, for the thinking line. */
  doing?: TranslationKey;
  icon: IconName;
}

const TOOLS: Record<string, ToolWords> = {
  // The Pond's own step: it loads a group of tools before the model may use them.
  enable_tool_group: { label: 'chat.tools.toolGroup', doing: 'chat.tools.doingToolGroup', icon: 'skills' },
  get_current_weather: { label: 'chat.tools.weather', doing: 'chat.tools.doingWeather', icon: 'sun' },
  get_weather_forecast: { label: 'chat.tools.forecast', doing: 'chat.tools.doingWeather', icon: 'partly-sunny' },
  get_wikipedia_article: { label: 'chat.tools.wikipedia', doing: 'chat.tools.doingLookup', icon: 'globe' },
  search_web: { label: 'chat.tools.webSearch', doing: 'chat.tools.doingWebSearch', icon: 'search' },
  read_web_page: { label: 'chat.tools.webPage', doing: 'chat.tools.doingWebPage', icon: 'globe' },
  compute_answer: { label: 'chat.tools.computed', doing: 'chat.tools.doingCompute', icon: 'sparkle' },
  list_schedules: { label: 'chat.tools.schedules', doing: 'chat.tools.doingSchedules', icon: 'schedule' },
  create_schedule: { label: 'chat.tools.createSchedule', icon: 'schedule' },
  delete_schedule: { label: 'chat.tools.deleteSchedule', icon: 'schedule' },
  pause_schedule: { label: 'chat.tools.pauseSchedule', icon: 'schedule' },
  resume_schedule: { label: 'chat.tools.resumeSchedule', icon: 'schedule' },
  run_schedule_now: { label: 'chat.tools.runSchedule', icon: 'schedule' },
  save_memory: { label: 'chat.tools.saveMemory', doing: 'chat.tools.doingSaveMemory', icon: 'memory' },
  recall_memories: { label: 'chat.tools.recallMemory', doing: 'chat.tools.doingRecall', icon: 'memory' },
  forget_memory: { label: 'chat.tools.forgetMemory', icon: 'memory' },
  get_system_info: { label: 'chat.tools.systemInfo', icon: 'cpu' },
  get_current_time: { label: 'chat.tools.currentTime', icon: 'schedule' },
  send_notification: { label: 'chat.tools.notification', icon: 'bell' },
  list_registered_devices: { label: 'chat.tools.devices', doing: 'chat.tools.doingDevices', icon: 'device' },
  get_device_state: { label: 'chat.tools.deviceState', doing: 'chat.tools.doingDevices', icon: 'device' },
  set_device_state: { label: 'chat.tools.setDevice', doing: 'chat.tools.doingSetDevice', icon: 'power' },
  get_current_profile: { label: 'chat.tools.profile', icon: 'profile' },
  get_user_profile: { label: 'chat.tools.profile', doing: 'chat.tools.doingProfile', icon: 'profile' },
  get_model_config: { label: 'chat.tools.modelConfig', icon: 'models' },
  list_skills: { label: 'chat.tools.skills', doing: 'chat.tools.doingSkills', icon: 'skills' },
  task_start: { label: 'chat.tools.taskStart', doing: 'chat.tools.doingTaskStart', icon: 'logs' },
  task_status: { label: 'chat.tools.taskStatus', doing: 'chat.tools.doingTaskStatus', icon: 'logs' },
  task_cancel: { label: 'chat.tools.taskCancel', icon: 'logs' },
  ask: { label: 'chat.tools.ask', doing: 'chat.tools.doingAsk', icon: 'chat' },
  play: { label: 'chat.tools.playMusic', icon: 'music' },
  status: { label: 'chat.tools.nowPlaying', icon: 'music' },
  control: { label: 'chat.tools.playback', icon: 'music' },
};

/** `giap-weather__get_current_weather` → `get_current_weather`. */
export function bareToolName(name: string): string {
  const at = name.lastIndexOf('__');
  return at === -1 ? name : name.slice(at + 2);
}

/** `get_current_weather` → `Get current weather`: sentence case, as the app writes. */
export function humanizeTool(name: string): string {
  const words = bareToolName(name).replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name;
}

export function toolWords(name: string): ToolWords | undefined {
  return TOOLS[bareToolName(name)];
}

export function toolIcon(name: string): IconName {
  return toolWords(name)?.icon ?? 'skills';
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** A page a reply read from, as the list under the answer shows it. */
export interface Source {
  /** The page's own title when the tool gave one, otherwise its site. */
  title: string;
  /** The site as a person names it: "Wikipedia", not `en.wikipedia.org`. */
  site: string;
  url: string;
}

// Read off the text rather than through `URL`, whose getters React Native has not always had.
const WEB_HOST = /^https?:\/\/([^/?#:\s]+)/i;

/** Null for anything that is not a web page, which a source is never allowed to open. */
export function siteName(url: string): string | null {
  const host = WEB_HOST.exec(url)?.[1]?.toLowerCase().replace(/^www\./, '');
  if (!host) return null;
  // eslint-disable-next-line i18next/no-literal-string -- a product name
  if (/(^|\.)wikipedia\.org$/.test(host)) return 'Wikipedia';
  // eslint-disable-next-line i18next/no-literal-string -- a product name
  if (/(^|\.)wolframalpha\.com$/.test(host)) return 'Wolfram Alpha';
  return host;
}

/** A page or a place on a web search card, ready to draw. */
export interface SearchEntry {
  title: string;
  /** Null unless the address is a web page, so the entry draws as plain text. */
  url: string | null;
  site: string;
  snippet: string;
}

export interface SearchCard {
  query: string;
  pages: SearchEntry[];
  places: SearchEntry[];
}

function searchEntries(raw: unknown, titleKey: 'title' | 'name'): SearchEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SearchEntry[] = [];
  for (const entry of raw as unknown[]) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const address = str(e.url).trim();
    const site = siteName(address);
    const url = site ? address : null;
    const domain = str(e.domain).trim() || site || '';
    const title = str(e[titleKey]).trim() || (titleKey === 'title' ? domain : '');
    if (!title) continue;
    out.push({ title, url, site: domain, snippet: str(e.snippet).trim() });
  }
  return out;
}

/**
 * The card `search_web` draws, read defensively: a partial one draws what it
 * has. A place's address may be empty, and neither a page nor a place is a
 * link unless its address is http(s), as on the desktop's `SearchCard`.
 */
export function readSearch(data: Record<string, unknown>): SearchCard {
  return {
    query: str(data.query).trim(),
    pages: searchEntries(data.results, 'title'),
    places: searchEntries(data.places, 'name'),
  };
}

const KEPT_SOURCES = /\bSources:\s*(.+?)\.?\s*$/s;

/** The sites a stub names, the one part of a transient result the Pond keeps. */
export function keptSites(tool: ToolCall): string[] {
  const named = KEPT_SOURCES.exec(tool.kept ?? '')?.[1] ?? '';
  return named
    .split(/,\s*/)
    .map((site) => site.trim().toLowerCase())
    .filter((site) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(site));
}

/**
 * The quiet line a saved turn shows for a result the Pond kept only as a stub,
 * as the desktop's `keptLine` words it. The sources are the stub's domains,
 * and the rest is this app's own words, so it reads in the app's language.
 */
export function keptLine(tool: ToolCall, t: TFunction): string {
  const words = toolWords(tool.name);
  const label = words ? t(words.label) : humanizeTool(tool.name);
  const sources = KEPT_SOURCES.exec(tool.kept ?? '')?.[1]?.trim().slice(0, 200);
  return sources ? t('chat.tools.notKeptSources', { tool: label, sources }) : t('chat.tools.notKept', { tool: label });
}

/**
 * The pages a turn's tools read from, in the order it read them, once each.
 *
 * A web search draws its pages on its own card, so they are not listed again.
 * Its results may be kept only for the turn, so a saved one is a stub naming
 * its sites, and each site is listed to open on its own. Wikipedia and Wolfram
 * name one source: live, on the card; in a saved turn whose card this phone
 * never kept, only as a closing `Source: <url>` line in the result.
 */
export function sourcesOf(tools: ToolCall[] | undefined): Source[] {
  const out: Source[] = [];
  const add = (url: string, title: string) => {
    const site = siteName(url);
    if (!site || out.some((s) => s.url === url)) return;
    out.push({ url, site, title: title || site });
  };
  for (const tool of tools ?? []) {
    const data = tool.card?.data;
    for (const site of keptSites(tool)) add(`https://${site}/`, '');
    if (tool.card?.type === 'search') continue;
    const fromCard = data ? str(data.source_url) : '';
    const fromText = /Source:\s*(https?:\/\/\S+)\s*$/i.exec(tool.result ?? '')?.[1] ?? '';
    // A page read names itself on its first lines: `Page: <title>` then `Address: <url>`.
    const read = /^Page: (.*)\nAddress: (https?:\/\/\S+)/.exec(tool.result ?? '');
    const url = fromCard || fromText || read?.[2] || '';
    if (url) add(url, data ? str(data.title) || str(data.primary_title) : read?.[1]?.trim() ?? '');
  }
  return out;
}
