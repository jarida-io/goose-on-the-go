/**
 * News, in full: today's digest with Listen, the lead story and the rest of the stories, the long
 * reads set apart as covers, and earlier digests. Only what the Pond wrote from the member's
 * interests; the member's own scheduled briefs stay under Agents and Schedule.
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { InkButton, InkEmptyState, InkSpinner, InkText } from '@/components/ui/ink';

import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { Spacing } from '@/constants/spacing';
import { isUnavailable } from '@/models/content-state';
import { splitStories } from '@/models/news';
import { selectionTick } from '@/services/haptics';
import { useContentState } from '@/view-models/use-content-state';
import { useInterests } from '@/view-models/use-interests';
import { useDigests, useListen, useNews, useStoryActions } from '@/view-models/use-news';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';
import { DigestCard, openDigest } from './digest-card';
import { GroupRow, InsetGroup } from './following';
import { RoundButton, ScreenScroll, SectionHead, useAgo } from './hub-parts';
import { CompactStory, HeroStory, LongReadShelf } from './news-cards';

export function HubNews() {
  const { t } = useTranslation();
  const news = useNews();
  const digests = useDigests();
  const interests = useInterests();
  const actions = useStoryActions();
  const ago = useAgo();
  const pull = usePullToRefresh(async () => {
    await Promise.all([news.reload(), digests.reload(), interests.reload()]);
  });
  const { data } = news;
  const listen = useListen(data.digest);
  const { news: stories, longReads } = splitStories(data.stories);
  const [hero, ...rest] = stories;
  const followed = useMemo(() => new Map(interests.data.map((i) => [i.id, i.news !== 'off'])), [interests.data]);
  const earlier = digests.data.filter((d) => d.id !== data.digest?.id);
  const hasContent = data.stories.length > 0 || !!data.digest;
  const state = useContentState({ loading: news.loading, failed: news.failed, hasContent });

  return (
    <ScreenScroll pull={pull}>
      <SectionHead
        fact={data.state === 'writing' ? t('goose.news.writingNow') : data.lastWrittenAt ? t('goose.news.updated', { when: ago(data.lastWrittenAt) }) : null}
        title={t('goose.news.title')}
        subtitle={t('goose.news.subtitle')}
        trailing={<RoundButton icon="sliders" label={t('goose.newsSettings.title')} onPress={() => router.push('/(stack)/goose-news-settings')} />}
      />

      {state === 'loading' ? <InkSpinner label={t('goose.news.loading')} /> : null}
      {isUnavailable(state) ? <ContentUnavailable state={state} reason={news.error} onRetry={news.reload} /> : null}

      {state === 'empty' || (!hasContent && data.blocked) ? (
        data.blocked === 'no_interests' ? (
          <InkEmptyState
            icon="news"
            title={t('goose.news.emptyInterestsTitle')}
            action={
              <InkButton variant="primary" icon="chat" onPress={() => router.push('/(stack)/goose-interview')}>
                {t('goose.invite.start')}
              </InkButton>
            }
          >
            <InkText tone="secondary">{t('goose.news.emptyInterestsBody')}</InkText>
          </InkEmptyState>
        ) : data.blocked === 'web_search' ? (
          <InkEmptyState
            icon="globe"
            title={t('goose.news.blockedSearchTitle')}
            action={
              <InkButton variant="primary" icon="globe" onPress={() => router.push('/(stack)/goose-connectors')}>
                {t('goose.news.blockedSearchAction')}
              </InkButton>
            }
          >
            <InkText tone="secondary">{t('goose.news.blockedSearchBody')}</InkText>
          </InkEmptyState>
        ) : (
          <InkEmptyState
            icon="news"
            title={data.state === 'writing' ? t('goose.news.writingFirst') : t('goose.news.emptyTitle')}
            action={
              data.state === 'writing' ? null : (
                <InkButton variant="primary" icon="refresh" onPress={() => void news.actions.refreshNews()}>
                  {t('goose.news.writeNow')}
                </InkButton>
              )
            }
          >
            <InkText tone="secondary">{t('goose.news.emptyBody')}</InkText>
          </InkEmptyState>
        )
      ) : null}

      {data.digest ? (
        <DigestCard digest={data.digest} listen={listen} />
      ) : null}

      {hero ? (
        <View style={styles.stories}>
          <HeroStory story={hero} actions={actions} followed={hero.interest ? (followed.get(hero.interest.id) ?? null) : null} />
          {rest.map((story) => (
            <CompactStory key={story.id} story={story} actions={actions} followed={story.interest ? (followed.get(story.interest.id) ?? null) : null} />
          ))}
        </View>
      ) : null}

      {longReads.length ? (
        <View style={styles.stories}>
          <SectionHead title={t('goose.news.longReads')} subtitle={t('goose.news.longReadsSubtitle')} size="small" />
          <LongReadShelf stories={longReads} />
        </View>
      ) : null}

      {earlier.length ? (
        <View style={styles.stories}>
          <SectionHead title={t('goose.news.earlierDigests')} size="small" />
          <InsetGroup>
            {earlier.map((d, i) => (
              <GroupRow key={d.id} first={i === 0} icon="file-text" label={d.title || t('goose.digest.title')} detail={ago(d.writtenAt)} onPress={() => openDigest(d.id)} />
            ))}
          </InsetGroup>
        </View>
      ) : null}

      {hasContent ? (
        <InkButton
          variant="quiet"
          icon="refresh"
          disabled={data.state === 'writing'}
          onPress={() => {
            void selectionTick();
            void news.actions.refreshNews();
          }}
          style={styles.again}
        >
          {data.state === 'writing' ? t('goose.news.writingNow') : t('goose.news.writeNow')}
        </InkButton>
      ) : null}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  stories: { gap: Spacing.md },
  again: { alignSelf: 'flex-start' },
});
