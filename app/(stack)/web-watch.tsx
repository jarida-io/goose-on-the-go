/**
 * WebWatchScreen — one watch: what it looks for, the listings it saw last, and what changed, with
 * the member's three controls (pause, how often, stop). A notice about a watch opens here.
 */

import React, { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { InkButton, InkCard, InkChip, InkEyebrow, InkNotice, InkSpinner, InkSwitch, InkText } from '@/components/ui/ink';
import { SendToChat } from '@/components/goose/send-to-chat';

import type { ThemeColors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { siteOf } from '@/models/web-watches';
import { useConfirm } from '@/providers/confirm-provider';
import { confirm as confirmTick, toggle } from '@/services/haptics';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';
import { WATCH_INTERVALS, useWebWatch } from '@/view-models/use-web-watches';

/** An id from a link: only what the Pond issues, never anything that could be a path. */
function idOf(param: string | string[] | undefined): string {
  const id = Array.isArray(param) ? param[0] : param;
  return id && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : '';
}

export default function WebWatchScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const ask = useConfirm();
  const params = useLocalSearchParams<{ id?: string; watch_id?: string }>();
  const id = idOf(params.id ?? params.watch_id);
  const { watch, loading, error, saving, gone, actions } = useWebWatch(id);
  const pull = usePullToRefresh(actions.refresh);

  const stop = useCallback(async () => {
    const yes = await ask({
      title: t('webWatches.stopTitle'),
      message: t('webWatches.stopBody'),
      confirmLabel: t('webWatches.stop'),
      destructive: true,
    });
    if (yes && (await actions.stop())) {
      void confirmTick();
      router.back();
    }
  }, [actions, ask, t]);

  if (gone || !id) {
    return (
      <View style={styles.container}>
        <View style={styles.scroll}>
          <InkNotice tone="neutral">{t('webWatches.gone')}</InkNotice>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl {...pull} />}
    >
      {loading && !watch ? <InkSpinner label={t('webWatches.loading')} /> : null}
      {error ? <InkNotice tone="danger">{error}</InkNotice> : null}
      {watch ? (
        <>
          <InkCard>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm }}>
              <InkText weight="semibold" style={{ flex: 1 }}>{watch.title}</InkText>
              <InkNotice tone={watch.paused ? 'neutral' : watch.active ? 'success' : 'warning'}>
                {watch.paused ? 'Paused' : watch.active ? 'Active' : 'Checking...'}
              </InkNotice>
            </View>
            <InkText size="sm" tone="secondary">{siteOf(watch.address)}</InkText>
            {watch.hasRule ? (
              <InkText>{t('goose.watching.tellsYou', { rule: watch.filtersWords })}</InkText>
            ) : (
              <InkText>{t('webWatches.lookingFor', { what: watch.filtersWords || watch.lookingFor })}</InkText>
            )}
            {watch.standing ? (
              <InkText size="sm" tone="secondary">
                {t('goose.watching.standing', { standing: watch.standing })}
              </InkText>
            ) : null}
            <InkSwitch
              checked={!watch.paused}
              disabled={saving}
              label={t('webWatches.checking')}
              onChange={(on) => {
                void toggle();
                void actions.edit({ paused: !on });
              }}
            />
            <InkEyebrow>{t('webWatches.howOften')}</InkEyebrow>
            <View style={styles.chips}>
              {WATCH_INTERVALS.map((hours) => (
                <InkChip
                  key={hours}
                  selected={watch.intervalHours === hours}
                  disabled={saving}
                  onPress={() => void actions.edit({ interval_hours: hours })}
                >
                  {t('webWatches.hours', { count: hours })}
                </InkChip>
              ))}
            </View>
            {watch.failures >= 3 ? <InkNotice tone="warning">{t('webWatches.failing')}</InkNotice> : null}
          </InkCard>

          <InkEyebrow>Webpage Preview</InkEyebrow>
          <InkCard>
            {watch.preview ? (
              <>
                <InkText weight="semibold" numberOfLines={2}>{watch.preview.title}</InkText>
                {watch.preview.snippet ? <InkText size="sm" tone="secondary" numberOfLines={4}>{watch.preview.snippet}</InkText> : null}
              </>
            ) : (
              <InkText size="sm" tone="secondary">
                {watch.lastCheckedAt ? 'Page reached (no preview snippet extracted).' : 'Reading webpage to capture initial preview...'}
              </InkText>
            )}
            <InkButton variant="quiet" icon="external" onPress={() => void WebBrowser.openBrowserAsync(watch.preview?.link ?? watch.address)}>
              Open webpage
            </InkButton>
          </InkCard>

          <InkEyebrow>Goose&apos;s Thinking</InkEyebrow>
          <InkCard>
            <InkText size="sm" weight="semibold">Initial check</InkText>
            <InkText size="sm" tone="secondary">
              {watch.initialThinking ?? `Watching ${watch.title} for: ${watch.lookingFor}`}
            </InkText>
            {watch.thinkingHistory.map((entry) => (
              <View key={entry.id} style={styles.change}>
                <InkText size="xs" weight="semibold">On change</InkText>
                <InkText size="sm" tone="secondary">{entry.text}</InkText>
              </View>
            ))}
          </InkCard>

          <InkEyebrow>{t('webWatches.changes')}</InkEyebrow>
          {watch.changes.length === 0 ? (
            <InkText size="sm" tone="tertiary">{t('webWatches.noChanges')}</InkText>
          ) : (
            watch.changes.map((change) => (
              <View key={change.id} style={styles.change}>
                <InkText weight={change.matched ? 'semibold' : 'regular'}>{change.line}</InkText>
                <InkText size="xs" tone="tertiary">
                  {change.matched ? t('webWatches.matchSent') : t('webWatches.inDigest')}
                </InkText>
              </View>
            ))
          )}

          <InkEyebrow>{t('webWatches.listings', { count: watch.items.length })}</InkEyebrow>
          {watch.items.map((item, i) => (
            <InkCard key={`${item.link ?? item.title}-${i}`}>
              <InkText weight="semibold" numberOfLines={2}>{item.title}</InkText>
              <InkText size="sm" tone="secondary">
                {[item.currency && item.price && !item.price.includes(item.currency) ? `${item.currency} ${item.price}` : item.price, item.mileage, item.year]
                  .filter(Boolean)
                  .join(' · ')}
              </InkText>
              {item.snippet ? <InkText size="sm" numberOfLines={3}>{item.snippet}</InkText> : null}
              {item.link ? (
                <InkButton variant="quiet" icon="external" onPress={() => void WebBrowser.openBrowserAsync(item.link!)}>
                  {t('webWatches.openListing')}
                </InkButton>
              ) : null}
            </InkCard>
          ))}

          <SendToChat kind="watch" id={watch.id} title={watch.title} size="md" />
          <InkButton variant="quiet" icon="trash" disabled={saving} onPress={() => void stop()}>
            {t('webWatches.stop')}
          </InkButton>
        </>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    scroll: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['4xl'] },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    change: { gap: Spacing.xs, paddingVertical: Spacing.xs },
  });
