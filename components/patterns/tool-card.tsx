/**
 * ToolTrail — what Goose did on the way to its answer, under it.
 *
 * Two shapes. A tool whose answer is a fact a person wants to see — the
 * weather now or for the week, the devices it found, the time, the article it
 * read, the pages and places a web search found — draws that fact in place,
 * from the card the tool itself described (`ui.card_type` on the live stream).
 * A card whose payload holds nothing it can draw is folded like the rest.
 * Everything else folds into the one chip under the answer (`answer-trail.tsx`),
 * whose sheet lists each tool as a row: its name, whether it is still running,
 * and its raw answer one tap away, because that answer was written for the
 * model and is best kept out of the reader's way until asked for.
 *
 * A fact lies flat on a hairline under the answer, which is what the turn is
 * for; a tool card wearing the plate would outrank it. A reopened conversation
 * has no card hints — the Pond strips them before saving — so its tools come
 * back folded, with the text their card would have drawn from. A result the
 * Pond did not keep at all says so on its row, naming its sources.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as WebBrowser from 'expo-web-browser';
import { InkEdge, InkEyebrow, inkText, useInkTheme } from '@/components/ui/ink';

import { AskCard } from '@/components/patterns/ask-card';
import { LongTaskCard } from '@/components/patterns/long-task-card';
import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import {
  humanizeTool,
  keptLine,
  readSearch,
  toolIcon,
  toolWords,
  type SearchEntry,
} from '@/constants/tools';
import type { ToolCall } from '@/models/chat';
import { startedTaskId } from '@/models/long-tasks';
import { isAskTool, readAskInput } from '@/models/questions';
import {
  conditionIcon,
  dayLabel,
  rangeEnd,
  readWeatherCard,
  type CurrentWeather,
  type WeatherForecast,
} from '@/models/weather-card';
import { selectionTick } from '@/services/haptics';
import { Spacing } from '@/constants/spacing';

/** How much of a raw tool answer a chip shows when opened: the desktop's 300. */
const RESULT_PREVIEW = 300;

type Data = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/** A tool's answer without the Pond's trailing source line, which draws as a link. */
function bodyOf(result: string | undefined): string {
  return (result ?? '').replace(/\n+Source:\s*\S+\s*$/i, '').trim();
}

function CurrentWeatherCard({ weather }: { weather: CurrentWeather }) {
  const theme = useInkTheme();
  const { t } = useTranslation();
  const big = inkText(theme, { role: 'display', size: '3xl', weight: theme.weight.bold, tracking: 'title', leading: 'tight' });
  const line = inkText(theme, { size: 'md', weight: theme.weight.semibold });
  const meta = inkText(theme, { role: 'mono', size: 'xs', color: theme.color.textTertiary });
  const facts = [
    weather.feelsLike !== null ? t('chat.tools.feelsLike', { value: Math.round(weather.feelsLike) }) : '',
    weather.humidity !== null ? t('chat.tools.humidity', { value: Math.round(weather.humidity) }) : '',
    weather.wind !== null ? t('chat.tools.wind', { value: Math.round(weather.wind) }) : '',
  ].filter(Boolean);
  return (
    <View style={styles.cardBody}>
      <InkEyebrow>{weather.location || t('chat.tools.weather')}</InkEyebrow>
      <View style={styles.row}>
        <GIcon name={conditionIcon(weather.condition, weather.isDay)} size={28} color={theme.color.text} />
        {weather.temperature !== null ? <Text style={big.style}>{`${Math.round(weather.temperature)}°`}</Text> : null}
        <Text style={[line.style, styles.shrink]}>{weather.condition}</Text>
      </View>
      {facts.length > 0 ? <Text style={meta.style}>{facts.join(' · ')}</Text> : null}
    </View>
  );
}

/** Rows a forecast draws before it counts the rest: the Pond's own ceiling of a week. */
export const FORECAST_ROWS = 7;

const degrees = (v: number | null) => (v === null ? '' : `${Math.round(v)}°`);

function ForecastCard({ forecast }: { forecast: WeatherForecast }) {
  const theme = useInkTheme();
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const shown = forecast.days.slice(0, FORECAST_ROWS);
  const first = forecast.days[0];
  const last = forecast.days[forecast.days.length - 1];
  const range =
    first === last
      ? rangeEnd(first.date, locale)
      : t('chat.tools.forecastRange', { from: rangeEnd(first.date, locale), to: rangeEnd(last.date, locale) });
  const day = inkText(theme, { size: 'base', weight: theme.weight.semibold });
  const high = inkText(theme, { role: 'mono', size: 'sm', weight: theme.weight.semibold });
  const low = inkText(theme, { role: 'mono', size: 'sm', color: theme.color.textTertiary });
  const meta = inkText(theme, { role: 'mono', size: 'xs', color: theme.color.textTertiary });
  const rule = { borderTopWidth: theme.edge.hairlineWidth, borderTopColor: theme.color.line };
  return (
    <View style={styles.cardBody}>
      <InkEyebrow>{forecast.location || t('chat.tools.forecast')}</InkEyebrow>
      <Text style={meta.style}>{range}</Text>
      <View>
        {shown.map((d, i) => {
          const label = dayLabel(d.date, locale);
          const spoken = [
            label,
            d.condition,
            d.high !== null ? t('chat.tools.forecastHigh', { value: Math.round(d.high) }) : '',
            d.low !== null ? t('chat.tools.forecastLow', { value: Math.round(d.low) }) : '',
            d.rainChance !== null ? t('chat.tools.forecastRain', { value: Math.round(d.rainChance) }) : '',
          ].filter(Boolean);
          return (
            <View
              key={d.iso}
              style={[styles.forecastRow, i > 0 ? rule : null]}
              accessible
              accessibilityLabel={spoken.join(', ')}
            >
              <Text style={[day.style, styles.forecastDay]} numberOfLines={1}>
                {label}
              </Text>
              <GIcon name={conditionIcon(d.condition)} size={18} color={theme.color.text} />
              <Text style={[high.style, styles.forecastTemp]}>{degrees(d.high)}</Text>
              <Text style={[low.style, styles.forecastTemp]}>{degrees(d.low)}</Text>
              <View style={styles.forecastRain}>
                {d.rainChance !== null ? (
                  <>
                    <GIcon name="droplet" size={12} color={theme.color.textTertiary} />
                    <Text style={meta.style}>{t('chat.tools.rainChance', { value: Math.round(d.rainChance) })}</Text>
                  </>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
      {forecast.days.length > shown.length ? (
        <Text style={meta.style}>{t('chat.tools.moreDays', { count: forecast.days.length - shown.length })}</Text>
      ) : null}
    </View>
  );
}

/** Either weather card, by what the payload holds. `hasFact` has already refused one that holds nothing. */
function Weather({ data }: { data: Data }) {
  const weather = readWeatherCard(data);
  if (!weather) return null;
  return weather.kind === 'forecast' ? <ForecastCard forecast={weather} /> : <CurrentWeatherCard weather={weather} />;
}

function Devices({ data }: { data: Data }) {
  const theme = useInkTheme();
  const { t } = useTranslation();
  const devices = (Array.isArray(data.devices) ? data.devices : []) as Data[];
  const online = devices.filter((d) => d.is_online === true).length;
  const name = inkText(theme, { size: 'base', weight: theme.weight.semibold });
  const meta = inkText(theme, { role: 'mono', size: 'xs', color: theme.color.textTertiary });
  return (
    <View style={styles.cardBody}>
      <InkEyebrow>
        {t('chat.tools.devicesSummary', { online, offline: devices.length - online })}
      </InkEyebrow>
      {devices.slice(0, 4).map((d, i) => (
        <View key={`${str(d.name)}-${i}`} style={styles.row}>
          <View
            style={[
              styles.dot,
              { backgroundColor: d.is_online === true ? theme.color.success : theme.color.textDisabled },
            ]}
          />
          <Text style={[name.style, styles.shrink]} numberOfLines={1}>
            {str(d.name)}
          </Text>
          <Text style={meta.style} numberOfLines={1}>
            {str(d.room)}
          </Text>
        </View>
      ))}
      {devices.length > 4 ? (
        <Text style={meta.style}>{t('chat.tools.more', { count: devices.length - 4 })}</Text>
      ) : null}
    </View>
  );
}

function Clock({ data }: { data: Data }) {
  const theme = useInkTheme();
  const big = inkText(theme, { role: 'display', size: '3xl', weight: theme.weight.bold, tracking: 'title', leading: 'tight' });
  const meta = inkText(theme, { role: 'mono', size: 'xs', color: theme.color.textTertiary });
  return (
    <View style={styles.cardBody}>
      <Text style={big.style}>{str(data.time)}</Text>
      <Text style={meta.style}>{[str(data.date), str(data.timezone)].filter(Boolean).join(' · ')}</Text>
    </View>
  );
}

function Article({ data }: { data: Data }) {
  const theme = useInkTheme();
  const { t } = useTranslation();
  const title = inkText(theme, { role: 'display', size: 'md', weight: theme.weight.bold, tracking: 'snug' });
  const body = inkText(theme, { size: 'base', color: theme.color.textSecondary });
  const summary = str(data.summary) || str(data.primary);
  const heading = str(data.title) || str(data.primary_title) || str(data.query);
  return (
    <View style={styles.cardBody}>
      <InkEyebrow>{t(data.pods ? 'chat.tools.computed' : 'chat.tools.wikipedia')}</InkEyebrow>
      {heading ? <Text style={title.style}>{heading}</Text> : null}
      {summary ? (
        <Text style={body.style} numberOfLines={4}>
          {summary}
        </Text>
      ) : null}
    </View>
  );
}

function Memories({ data }: { data: Data }) {
  const theme = useInkTheme();
  const { t } = useTranslation();
  const memories = (Array.isArray(data.memories) ? data.memories : []) as Data[];
  const body = inkText(theme, { size: 'base', color: theme.color.textSecondary });
  return (
    <View style={styles.cardBody}>
      <InkEyebrow>{t('chat.tools.recalled', { count: memories.length })}</InkEyebrow>
      {memories.slice(0, 3).map((m, i) => (
        <Text key={i} style={body.style} numberOfLines={2}>
          {str(m.content)}
        </Text>
      ))}
    </View>
  );
}

/** A chat bubble's worth: the desktop's chat chip shows three of each too. */
const SEARCH_SHOWN = 3;

function SearchRow({ entry, first }: { entry: SearchEntry; first: boolean }) {
  const theme = useInkTheme();
  const { t } = useTranslation();
  const title = inkText(theme, { size: 'base', weight: theme.weight.semibold, leading: 'snug' });
  const site = inkText(theme, { role: 'mono', size: 'xs', color: theme.color.textTertiary });
  const body = inkText(theme, { size: 'sm', color: theme.color.textSecondary });
  const rule = first ? null : { borderTopWidth: theme.edge.hairlineWidth, borderTopColor: theme.color.line };
  const words = (
    <View style={styles.sourceText}>
      <Text style={title.style} numberOfLines={2}>
        {entry.title}
      </Text>
      {entry.site && entry.site !== entry.title ? (
        <Text style={site.style} numberOfLines={1}>
          {entry.site}
        </Text>
      ) : null}
      {entry.snippet ? (
        <Text style={body.style} numberOfLines={2}>
          {entry.snippet}
        </Text>
      ) : null}
    </View>
  );
  const url = entry.url;
  if (!url) return <View style={[styles.searchRow, rule]}>{words}</View>;
  return (
    <GPressable
      feedback="tint"
      onPress={() => void WebBrowser.openBrowserAsync(url)}
      accessibilityRole="link"
      accessibilityLabel={t('chat.tools.openSource', { source: entry.title })}
      style={[styles.searchRow, rule]}
    >
      {words}
      <GIcon name="external" size={13} color={theme.color.textTertiary} />
    </GPressable>
  );
}

function SearchLabel({ icon, children }: { icon: 'pin' | 'globe'; children: string }) {
  const theme = useInkTheme();
  return (
    <View style={styles.row}>
      <GIcon name={icon} size={12} color={theme.color.textTertiary} />
      <InkEyebrow>{children}</InkEyebrow>
    </View>
  );
}

// Drawn live only: a transient result's card is never kept, so a saved turn shows its stub instead.
function Search({ data }: { data: Data }) {
  const theme = useInkTheme();
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const { query, pages, places } = readSearch(data);
  const shownPlaces = places.slice(0, SEARCH_SHOWN);
  const shownPages = all ? pages : pages.slice(0, SEARCH_SHOWN);
  const heading = inkText(theme, { size: 'md', weight: theme.weight.semibold, leading: 'snug' });
  const quiet = inkText(theme, { size: 'sm', color: theme.color.textSecondary });
  const more = inkText(theme, { size: 'sm', weight: theme.weight.medium, color: theme.color.accentLine });
  return (
    <View style={styles.cardBody}>
      <View style={styles.row}>
        <GIcon name="search" size={14} color={theme.color.textSecondary} />
        <Text style={[heading.style, styles.shrink]} numberOfLines={2}>
          {query || t('chat.tools.webSearch')}
        </Text>
      </View>
      {shownPlaces.length > 0 ? (
        <View>
          <SearchLabel icon="pin">{t('chat.tools.nearbyPlaces')}</SearchLabel>
          {shownPlaces.map((place, i) => (
            <SearchRow key={`${place.url ?? place.title}-${i}`} entry={place} first={i === 0} />
          ))}
        </View>
      ) : null}
      {shownPages.length > 0 ? (
        <View>
          {shownPlaces.length > 0 ? <SearchLabel icon="globe">{t('chat.tools.pages')}</SearchLabel> : null}
          {shownPages.map((page, i) => (
            <SearchRow key={`${page.url ?? page.title}-${i}`} entry={page} first={i === 0} />
          ))}
          {!all && pages.length > SEARCH_SHOWN ? (
            <GPressable feedback="none"
              onPress={() => {
                void selectionTick();
                setAll(true);
              }}
              accessibilityRole="button"
              style={styles.searchRow}
            >
              <Text style={more.style}>{t('chat.tools.moreSources', { count: pages.length - SEARCH_SHOWN })}</Text>
            </GPressable>
          ) : null}
        </View>
      ) : null}
      {pages.length === 0 && places.length === 0 ? <Text style={quiet.style}>{t('chat.tools.noPages')}</Text> : null}
    </View>
  );
}

const CARDS: Record<string, React.ComponentType<{ data: Data }>> = {
  weather: Weather,
  devices: Devices,
  time: Clock,
  knowledge: Article,
  wolfram: Article,
  memory: Memories,
  search: Search,
};

/**
 * Cards that can tell from the payload alone that it holds nothing to draw.
 * Such a payload keeps its tool as a chip, so its answer is still a tap away
 * rather than a frame around an empty card.
 */
const DRAWS: Partial<Record<string, (data: Data) => boolean>> = {
  weather: (data) => readWeatherCard(data) !== null,
};

/** A finished tool that asked to be drawn as a card this app knows how to draw, with something to draw. */
const hasFact = (tool: ToolCall) =>
  Boolean(
    tool.card &&
      tool.status !== 'running' &&
      CARDS[tool.card.type] &&
      (DRAWS[tool.card.type]?.(tool.card.data) ?? true),
  );

const expandable = (tool: ToolCall) => tool.status !== 'running' && bodyOf(tool.result).length > 0;

const FactCard = React.memo(function FactCard({ tool }: { tool: ToolCall }) {
  const theme = useInkTheme();
  if (!hasFact(tool) || !tool.card) return null;
  const Card = CARDS[tool.card.type];
  return (
    <InkEdge raised={false} budgeted={false} radius={theme.radius.lg} contentStyle={styles.card}>
      <Card data={tool.card.data} />
    </InkEdge>
  );
});

/** A tool as the sheet under an answer lists it: what it was, how it went, and its raw answer a tap away. */
export function ToolRow({ tool }: { tool: ToolCall }) {
  const theme = useInkTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const words = toolWords(tool.name);
  const label = words ? t(words.label) : humanizeTool(tool.name);
  const running = tool.status === 'running';
  const failed = tool.status === 'error';
  const canOpen = expandable(tool);
  const status = tool.kept
    ? keptLine(tool, t)
    : running
      ? t('chat.trail.running')
      : failed
        ? t('chat.trail.failed')
        : null;
  const name = inkText(theme, { size: 'md', weight: theme.weight.semibold, leading: 'snug' });
  const quiet = inkText(theme, { size: 'sm', color: failed ? theme.color.dangerFg : theme.color.textSecondary });
  const ink = running ? theme.color.textTertiary : theme.color.textSecondary;
  return (
    <View>
      <GPressable
        feedback="none"
        disabled={!canOpen}
        onPress={() => {
          void selectionTick();
          setOpen((value) => !value);
        }}
        accessibilityRole={canOpen ? 'button' : 'text'}
        accessibilityLabel={[label, status].filter(Boolean).join(', ')}
        accessibilityState={canOpen ? { expanded: open } : undefined}
        style={({ pressed }) => [styles.toolRow, pressed ? { backgroundColor: theme.color.neutralSoft } : null]}
      >
        <GIcon name={failed ? 'warn' : toolIcon(tool.name)} size={16} color={failed ? theme.color.dangerFg : ink} />
        <View style={styles.toolText}>
          <Text style={name.style} numberOfLines={1}>
            {label}
          </Text>
          {status ? <Text style={quiet.style}>{status}</Text> : null}
        </View>
        {canOpen ? <GIcon name={open ? 'chevron' : 'chevron-right'} size={14} color={theme.color.textTertiary} /> : null}
      </GPressable>
      {open ? <ResultPanel tool={tool} /> : null}
    </View>
  );
}

function ResultPanel({ tool }: { tool: ToolCall }) {
  const theme = useInkTheme();
  const body = bodyOf(tool.result);
  const text = inkText(theme, { role: 'mono', size: 'xs', color: theme.color.textSecondary });
  return (
    <View
      style={[
        styles.result,
        { borderColor: theme.color.line, borderWidth: theme.edge.hairlineWidth, borderRadius: theme.radius.md },
      ]}
    >
      <Text style={text.style} selectable>
        {body.length > RESULT_PREVIEW ? `${body.slice(0, RESULT_PREVIEW).trimEnd()}…` : body}
      </Text>
    </View>
  );
}

/** A call Goose asked the member through, which draws its own card. */
function asks(tool: ToolCall): boolean {
  return isAskTool(tool.name) && readAskInput(tool.args).length > 0;
}

/** The tools a reply folds into the chip under it: all but those that draw a fact, follow a task or ask. */
export function foldedTools(tools: ToolCall[]): ToolCall[] {
  return tools.filter((tool) => !hasFact(tool) && !startedTaskId(tool) && !asks(tool));
}

/**
 * What under an answer is drawn in place, most useful first: Goose's questions, which the turn waits
 * on, a long task the turn started, followed live, then the facts its tools drew. The rest is in the
 * chip; the steps are at the reply's top.
 */
export const ToolTrail = React.memo(function ToolTrail({ tools, sessionId = null }: { tools: ToolCall[]; done?: boolean; sessionId?: string | null }) {
  const tasks = tools.flatMap((tool) => {
    const taskId = startedTaskId(tool);
    return taskId ? [{ call: tool.id, taskId }] : [];
  });
  const asked = tools.filter(asks);
  if (tasks.length === 0 && asked.length === 0 && !tools.some(hasFact)) return null;
  return (
    <View style={styles.trail}>
      {asked.map((call) => (
        <AskCard key={call.id} call={call} sessionId={sessionId} />
      ))}
      {tasks.map((task) => (
        <LongTaskCard key={task.call} taskId={task.taskId} callId={task.call} />
      ))}
      {tools.map((tool) => (
        <FactCard key={tool.id} tool={tool} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  trail: { gap: 8, marginTop: 2 },
  card: { padding: 14 },
  cardBody: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shrink: { flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  forecastRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  forecastDay: { flex: 1 },
  forecastTemp: { minWidth: 34, textAlign: 'right' },
  forecastRain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, minWidth: 48 },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  toolText: { flex: 1, gap: 2 },
  result: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md, padding: 10 },
  sourceCard: { paddingVertical: 4 },
  sourceHead: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 2 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  sourceText: { flex: 1, gap: 2 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
});
