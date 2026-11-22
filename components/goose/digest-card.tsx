/**
 * The day's digest as one card: what it is, its two-sentence opening, the interests it covers, and
 * Listen, which plays it on the phone in the Pond's voice and keeps playing when the member leaves.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { InkButton, InkCard, InkText } from '@/components/ui/ink';

import { GPressable } from '@/components/ui/g-pressable';
import { Spacing } from '@/constants/spacing';
import type { Digest } from '@/models/news';
import { selectionTick } from '@/services/haptics';
import type { Listen } from '@/view-models/use-news';
import { useAgo } from './hub-parts';

export function openDigest(id: string) {
  void selectionTick();
  router.push({ pathname: '/(stack)/goose-digest', params: { id } });
}

/** Listen; once playing, Pause or Resume beside Stop. */
export function ListenButton({ listen, disabled }: { listen: Listen; disabled?: boolean }) {
  const { t } = useTranslation();
  if (listen.state === 'playing' || listen.state === 'paused') {
    const playing = listen.state === 'playing';
    return (
      <View style={styles.listening}>
        <InkButton size="sm" variant="primary" icon={playing ? 'pause' : 'play'} onPress={playing ? listen.pause : listen.resume}>
          {playing ? t('goose.digest.pause') : t('goose.digest.resume')}
        </InkButton>
        <InkButton size="sm" variant="quiet" icon="stop" onPress={listen.stop}>
          {t('goose.digest.stop')}
        </InkButton>
      </View>
    );
  }
  return (
    <InkButton size="sm" variant="primary" icon="listen" loading={listen.state === 'loading'} disabled={disabled} onPress={listen.play}>
      {t('goose.digest.listen')}
    </InkButton>
  );
}

export function DigestCard({ digest, listen }: { digest: Digest; listen: Listen }) {
  const { t } = useTranslation();
  const ago = useAgo();
  const topics = digest.sections.map((s) => s.interest?.topic ?? s.heading).filter(Boolean);
  return (
    <InkCard>
      <GPressable onPress={() => openDigest(digest.id)} accessibilityRole="button" accessibilityLabel={digest.title || t('goose.digest.title')} style={styles.words}>
        <InkText size="sm" tone="secondary">
          {t('goose.digest.written', { when: ago(digest.writtenAt) ?? '' })}
        </InkText>
        <InkText size="lg" weight="bold">
          {digest.title || t('goose.digest.title')}
        </InkText>
        {digest.intro ? (
          <InkText size="md" tone="secondary" numberOfLines={3}>
            {digest.intro}
          </InkText>
        ) : null}
        {topics.length ? (
          <InkText size="sm" weight="semibold" numberOfLines={2}>
            {t('goose.digest.covers', { topics: topics.join(', ') })}
          </InkText>
        ) : null}
      </GPressable>
      <View style={styles.actions}>
        <ListenButton listen={listen} disabled={!digest.listen} />
        <InkButton size="sm" variant="quiet" onPress={() => openDigest(digest.id)}>
          {t('goose.digest.read')}
        </InkButton>
      </View>
    </InkCard>
  );
}

const styles = StyleSheet.create({
  words: { gap: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  listening: { flexDirection: 'row', gap: Spacing.sm },
});
