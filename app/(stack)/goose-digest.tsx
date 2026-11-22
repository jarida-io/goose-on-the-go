/**
 * The digest, to read or hear: its opening, then a section per interest with its pictures, its
 * words and the references they came from. Listen plays it on the phone in the Pond's voice; Play
 * on the speaker has the Pond read it in the room.
 */

import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { InkButton, InkSpinner, InkText, inkText, useInkTheme } from '@/components/ui/ink';

import { ListenButton } from '@/components/goose/digest-card';
import { HubPicture } from '@/components/goose/hub-picture';
import { ScreenScroll, useAgo } from '@/components/goose/hub-parts';
import { openInterest } from '@/components/goose/news-cards';
import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { Markdown } from '@/components/patterns/markdown';
import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { SendToChat } from '@/components/goose/send-to-chat';
import { Spacing } from '@/constants/spacing';
import { isUnavailable } from '@/models/content-state';
import { useContentState } from '@/view-models/use-content-state';
import { useDigest, useListen, useSpeakDigest } from '@/view-models/use-news';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';

export default function GooseDigestScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const theme = useInkTheme();
  const { t } = useTranslation();
  const ago = useAgo();
  const digest = useDigest(id);
  const speaker = useSpeakDigest();
  const pull = usePullToRefresh(digest.reload);
  const d = digest.data;
  const listen = useListen(d);
  const state = useContentState({ loading: digest.loading, failed: digest.failed, hasContent: !!d });
  const title = inkText(theme, { role: 'display', size: '3xl', weight: 700, tracking: 'title', leading: 'tight', color: theme.color.text }).style;
  const heading = inkText(theme, { role: 'display', size: 'xl', weight: 700, tracking: 'tight', leading: 'snug', color: theme.color.text }).style;

  return (
    <ScreenScroll pull={pull} gap={Spacing['3xl']}>
      {state === 'loading' ? <InkSpinner label={t('goose.digest.loading')} /> : null}
      {isUnavailable(state) ? <ContentUnavailable state={state} reason={digest.error} onRetry={digest.reload} /> : null}
      {d ? (
        <>
          <View style={styles.top}>
            <InkText size="sm" weight="semibold" tone="secondary">
              {t('goose.digest.written', { when: ago(d.writtenAt) ?? '' })}
            </InkText>
            <Text style={title} accessibilityRole="header">
              {d.title || t('goose.digest.title')}
            </Text>
            {d.intro ? <InkText size="lg">{d.intro}</InkText> : null}
            <View style={styles.actions}>
              <ListenButton listen={listen} disabled={!d.listen} />
              <InkButton size="sm" variant="quiet" icon="speaker" loading={speaker.asking} onPress={() => void speaker.speak(d.id)}>
                {t('goose.digest.onSpeaker')}
              </InkButton>
              <SendToChat kind="digest" id={d.id} title={d.title || t('goose.digest.title')} />
            </View>
          </View>
          {d.sections.map((section, i) => (
            <View key={i} style={styles.section}>
              {section.interest ? (
                <GPressable onPress={() => section.interest?.id && openInterest(section.interest.id)} accessibilityRole="link" accessibilityLabel={section.interest.topic}>
                  <InkText size="sm" weight="bold" style={{ color: theme.color.accentLine }}>
                    {section.interest.topic}
                  </InkText>
                </GPressable>
              ) : null}
              {section.heading ? (
                <Text style={heading} accessibilityRole="header">
                  {section.heading}
                </Text>
              ) : null}
              {section.pictures.map((p) => (
                <View key={p.path} style={styles.figure}>
                  <HubPicture path={p.path} label={p.caption || section.heading} style={[styles.picture, { borderRadius: theme.radius.lg }]} icon="photo" />
                  {p.caption ? (
                    <InkText size="xs" tone="secondary">
                      {p.caption}
                    </InkText>
                  ) : null}
                </View>
              ))}
              <Markdown source={section.body} size="lg" />
              {section.references.length ? (
                <View style={styles.refs}>
                  {section.references.map((r, n) => (
                    <GPressable key={r.url} onPress={() => void Linking.openURL(r.url)} accessibilityRole="link" accessibilityLabel={t('goose.story.openSource', { site: r.site })} style={styles.ref}>
                      <InkText size="sm" weight="bold" style={{ color: theme.color.accentLine }}>
                        {n + 1}
                      </InkText>
                      <InkText size="sm" numberOfLines={1} style={{ flex: 1 }}>
                        {r.title}
                      </InkText>
                      <GIcon name="external" size={13} color={theme.color.textTertiary} />
                    </GPressable>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </>
      ) : null}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  top: { gap: Spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
  section: { gap: Spacing.md },
  figure: { gap: 6 },
  picture: { width: '100%', aspectRatio: 16 / 9 },
  refs: { gap: 6 },
  ref: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
