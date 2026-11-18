/**
 * Find anything in My Goose, on the phone: the stories Goose wrote and the ones the member read,
 * their ideas and saved cards, and the screens themselves, so "about" or "notes" leads straight
 * there. Every word, in any order.
 */

import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { InkSearchField, InkText, useInkTheme } from '@/components/ui/ink';

import { GroupRow, InsetGroup } from '@/components/goose/following';
import { IdeaRow } from '@/components/goose/idea-card';
import { ScreenScroll, SectionHead } from '@/components/goose/hub-parts';
import { StoryRow } from '@/components/goose/news-cards';
import type { IconName } from '@/constants/icons';
import { Spacing } from '@/constants/spacing';
import { shownIdeas } from '@/models/ideas';
import type { Story } from '@/models/news';
import { useHub } from '@/view-models/use-hub';
import { useIdeas } from '@/view-models/use-ideas';
import { useNews, useNewsHistory } from '@/view-models/use-news';
import { useSavedItems } from '@/view-models/use-saved-items';

function matches(words: string[], ...fields: (string | null | undefined)[]): boolean {
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

export default function GooseSearchScreen() {
  const theme = useInkTheme();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const news = useNews();
  const history = useNewsHistory();
  const saved = useSavedItems();
  const { hub } = useHub();
  const ideas = useIdeas(Boolean(hub?.ideas));
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  // The screens of My Goose, found by their own names: only the ones this Pond serves.
  const places: { key: string; icon: IconName; label: string; href: Parameters<typeof router.push>[0]; shown: boolean }[] = [
    { key: 'about', icon: 'profile', label: t('goose.find.about'), href: '/(stack)/goose-about', shown: Boolean(hub?.about) },
    { key: 'interview', icon: 'chat', label: t('goose.you.interview'), href: '/(stack)/goose-member-interview', shown: Boolean(hub?.interview) },
    { key: 'notes', icon: 'file-text', label: t('goose.find.notes'), href: '/(stack)/goose-notes', shown: Boolean(hub?.about) },
    { key: 'activity', icon: 'activity', label: t('goose.find.activity'), href: '/(stack)/goose-activity', shown: Boolean(hub?.activity) },
    { key: 'instructions', icon: 'prompts', label: t('goose.you.instructions'), href: '/(stack)/settings-prompt-templates', shown: Boolean(hub?.about) },
    { key: 'screenshots', icon: 'photo', label: t('goose.you.screenshots'), href: '/(stack)/goose-screenshots', shown: Boolean(hub?.screenshots) },
    { key: 'news', icon: 'news', label: t('goose.find.news'), href: '/(stack)/goose-news', shown: Boolean(hub?.news) },
    { key: 'ideas', icon: 'light', label: t('goose.find.ideas'), href: '/(stack)/goose-cards', shown: Boolean(hub?.ideaCards) },
    { key: 'todos', icon: 'checklist', label: t('goose.find.todos'), href: '/(stack)/goose-todos', shown: Boolean(hub?.todos) },
    { key: 'prices', icon: 'tag', label: t('goose.find.prices'), href: '/(stack)/goose-cart', shown: Boolean(hub?.cart) },
    { key: 'watching', icon: 'eye', label: t('goose.find.watching'), href: '/(stack)/web-watches', shown: true },
    { key: 'interests', icon: 'sparkle', label: t('goose.find.interests'), href: '/(stack)/goose-interests', shown: Boolean(hub?.interests) },
    { key: 'saved', icon: 'archive', label: t('goose.find.saved'), href: '/(stack)/saved', shown: true },
    { key: 'connectors', icon: 'plug', label: t('goose.find.connectors'), href: '/(stack)/goose-connectors', shown: Boolean(hub?.connectors) },
  ];
  const foundPlaces = words.length ? places.filter((p) => p.shown && matches(words, p.label)) : [];
  const foundIdeas = words.length ? shownIdeas(ideas.data.ideas).filter((i) => matches(words, i.title, i.hook, i.pitch, i.kindLabel)) : [];

  const stories = useMemo(() => {
    const seen = new Map<string, Story>();
    for (const s of [...news.data.stories, ...history.data]) if (!seen.has(s.id)) seen.set(s.id, s);
    return [...seen.values()];
  }, [news.data.stories, history.data]);
  const foundStories = words.length ? stories.filter((s) => matches(words, s.headline, s.dek, s.interest?.topic, s.source.name)) : [];
  const foundSaved = words.length ? saved.data.items.filter((i) => matches(words, i.title, i.body, i.collection)) : [];

  return (
    <ScreenScroll gap={Spacing.xl}>
      <InkSearchField value={query} onChange={setQuery} label={t('goose.search.title')} placeholder={t('goose.search.placeholder')} />
      {words.length && foundStories.length + foundSaved.length + foundIdeas.length + foundPlaces.length === 0 ? (
        <InkText tone="secondary">{t('goose.search.none', { query: query.trim() })}</InkText>
      ) : null}
      {!words.length ? <InkText tone="secondary">{t('goose.search.hint')}</InkText> : null}
      {foundPlaces.length ? (
        <View style={styles.section}>
          <SectionHead title={t('goose.search.places')} size="small" />
          <InsetGroup>
            {foundPlaces.map((place, i) => (
              <GroupRow key={place.key} first={i === 0} icon={place.icon} label={place.label} onPress={() => router.push(place.href)} />
            ))}
          </InsetGroup>
        </View>
      ) : null}
      {foundIdeas.length ? (
        <View style={styles.section}>
          <SectionHead title={t('goose.search.ideas')} size="small" />
          <InsetGroup>
            {foundIdeas.map((idea, i) => (
              <IdeaRow key={idea.id} idea={idea} first={i === 0} onOpen={() => router.push({ pathname: '/(stack)/goose-idea', params: { id: idea.id } })} />
            ))}
          </InsetGroup>
        </View>
      ) : null}
      {foundStories.length ? (
        <View style={styles.section}>
          <SectionHead title={t('goose.search.stories')} size="small" />
          <View>
            {foundStories.map((s, i) => (
              <View key={s.id} style={i > 0 ? [styles.divided, { borderTopColor: theme.color.line }] : null}>
                <StoryRow story={s} />
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {foundSaved.length ? (
        <View style={styles.section}>
          <SectionHead title={t('goose.search.saved')} size="small" />
          <InsetGroup>
            {foundSaved.map((item, i) => (
              <GroupRow
                key={item.id}
                first={i === 0}
                icon="archive"
                label={item.title}
                detail={item.collection}
                onPress={() => router.push({ pathname: '/(stack)/saved-item', params: { id: item.id } })}
              />
            ))}
          </InsetGroup>
        </View>
      ) : null}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  divided: { borderTopWidth: StyleSheet.hairlineWidth },
});
