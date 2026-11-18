/**
 * WebWatchesScreen — unified Web Watch & Notify Me: the pages Goose keeps checking for this member,
 * plus a Safari "Notify Me"-style sheet to add a new watch with URL, what to look for, and cadence.
 */

import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { InkButton, InkCard, InkChoice, InkEmptyState, InkInput, InkNotice, InkSheet, InkSpinner, InkText, InkTextArea } from '@/components/ui/ink';

import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import type { ThemeColors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { WebWatch } from '@/models/web-watches';
import { selectionTick } from '@/services/haptics';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';
import { useWebWatches } from '@/view-models/use-web-watches';

const CADENCE_OPTIONS = [
  { hours: 1, label: 'Hourly' },
  { hours: 6, label: 'Every 6h' },
  { hours: 24, label: 'Daily' },
  { hours: 168, label: 'Weekly' },
] as const;

export default function WebWatchesScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const { data, loading, error, actions } = useWebWatches();
  const pull = usePullToRefresh(actions.refresh);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [lookingFor, setLookingFor] = useState('');
  const [intervalHours, setIntervalHours] = useState<number>(24);
  const [saving, setSaving] = useState(false);

  const open = (watch: WebWatch) => {
    void selectionTick();
    router.push({ pathname: '/(stack)/web-watch', params: { id: watch.id } } as never);
  };

  const submit = async () => {
    const cleanUrl = url.trim();
    const cleanLook = lookingFor.trim();
    if (!cleanLook) return;
    setSaving(true);
    const created = await actions.create({
      ...(cleanUrl ? { url: cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}` } : {}),
      looking_for: cleanLook,
      interval_hours: intervalHours,
    });
    setSaving(false);
    if (created) {
      setUrl('');
      setLookingFor('');
      setIntervalHours(24);
      setAdding(false);
    }
  };

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl {...pull} />}
      >
        <InkText size="sm" tone="secondary">{t('webWatches.intro')}</InkText>
        <InkButton variant="primary" icon="bell" onPress={() => setAdding(true)} style={styles.addBtn}>
          Notify Me
        </InkButton>
        {loading && data.watches.length === 0 ? <InkSpinner label={t('webWatches.loading')} /> : null}
        {error ? <InkNotice tone="danger">{error}</InkNotice> : null}
        {!loading && !error && data.watches.length === 0 ? (
          <InkEmptyState icon="eye" title={t('webWatches.emptyTitle')}>
            <InkText>{t('webWatches.emptyBody')}</InkText>
          </InkEmptyState>
        ) : null}
        {data.watches.map((watch) => (
          <GPressable key={watch.id} onPress={() => open(watch)} accessibilityRole="button" accessibilityLabel={watch.title}>
            <InkCard>
              <InkText weight="semibold" numberOfLines={2}>{watch.title}</InkText>
              <InkText size="sm" tone="secondary">{t('webWatches.lookingFor', { what: watch.filtersWords || watch.lookingFor })}</InkText>
              <View style={styles.footer}>
                <InkText size="sm" tone="tertiary">
                  {watch.paused ? t('webWatches.paused') : t('webWatches.every', { count: watch.intervalHours })}
                </InkText>
                <InkText size="sm" tone={watch.matchingCount > 0 ? 'default' : 'tertiary'}>
                  {t('webWatches.matching', { count: watch.matchingCount, total: watch.itemsCount })}
                </InkText>
              </View>
              {watch.failures >= 3 ? <InkNotice tone="warning">{t('webWatches.failing')}</InkNotice> : null}
            </InkCard>
          </GPressable>
        ))}
      </ScrollView>

      <InkSheet open={adding} onClose={() => setAdding(false)} title="Notify Me" scroll>
        <View style={styles.sheet}>
          <View style={styles.hero}>
            <GIcon name="bell" size={28} />
            <InkText size="sm" tone="secondary">
              Goose can let you know when a website updates the content you are interested in.
            </InkText>
          </View>
          <InkInput
            label="Website URL (optional)"
            value={url}
            onChange={setUrl}
            placeholder="Leave blank to search the internet, or paste https://..."
          />
          <InkTextArea
            label="What should Goose look for?"
            value={lookingFor}
            onChange={setLookingFor}
            placeholder="Describe what you want or a change... (e.g. PS5 Pro in stock in Kenya, price drops)"
            rows={3}
            maxRows={5}
          />
          <InkText size="sm" weight="semibold">Check frequency</InkText>
          <View style={styles.chips}>
            {CADENCE_OPTIONS.map((opt) => (
              <InkChoice key={opt.hours} selected={intervalHours === opt.hours} onSelect={() => setIntervalHours(opt.hours)}>
                {opt.label}
              </InkChoice>
            ))}
          </View>
          <InkButton
            variant="primary"
            block
            loading={saving}
            disabled={!lookingFor.trim() || saving}
            onPress={() => void submit()}
          >
            Start Watching
          </InkButton>
        </View>
      </InkSheet>
    </>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    scroll: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['4xl'] },
    footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
    addBtn: { alignSelf: 'flex-start' },
    sheet: { gap: Spacing.md, paddingBottom: Spacing.xl },
    hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  });
