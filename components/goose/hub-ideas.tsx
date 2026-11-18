/**
 * Ideas: what Goose researched for the member, newest first, the ones it is working on at the top.
 * Each says why it is for them and what it read, and offers Goose's part or the member's steps.
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { InkButton, InkEmptyState, InkSpinner, InkText } from '@/components/ui/ink';

import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { isUnavailable } from '@/models/content-state';
import { shownIdeas } from '@/models/ideas';
import { useContentState } from '@/view-models/use-content-state';
import { useHub } from '@/view-models/use-hub';
import { useIdeas } from '@/view-models/use-ideas';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';
import { ScreenScroll, SectionHead } from './hub-parts';
import { InsetGroup } from './following';
import { IdeaRow } from './idea-card';

export function HubIdeas() {
  const { t } = useTranslation();
  const router = useRouter();
  const ideas = useIdeas();
  // A Pond that makes plans instead writes no new ideas, so asking it to think again would do nothing.
  const engine = useHub().hub?.anchors === true;
  const pull = usePullToRefresh(ideas.reload);
  const shown = shownIdeas(ideas.data.ideas);
  const thinking = ideas.data.state === 'thinking';
  const state = useContentState({ loading: ideas.loading, failed: ideas.failed, hasContent: shown.length > 0 });
  return (
    <ScreenScroll pull={pull}>
      <SectionHead title={t('goose.ideas.title')} subtitle={t('goose.ideas.screenSubtitle')} fact={thinking ? t('goose.ideas.thinking') : null} />
      {state === 'loading' ? <InkSpinner label={t('goose.ideas.loading')} /> : null}
      {isUnavailable(state) ? <ContentUnavailable state={state} reason={ideas.error} onRetry={ideas.reload} /> : null}
      {state === 'empty' ? (
        <InkEmptyState
          icon="light"
          title={thinking ? t('goose.ideas.thinking') : t('goose.ideas.emptyTitle')}
          action={
            thinking ? null : engine ? (
              <InkButton variant="primary" icon="calendar" onPress={() => router.push('/(stack)/goose-plans')}>
                {t('goose.ideas.seePlans')}
              </InkButton>
            ) : (
              <InkButton variant="primary" icon="sparkle" onPress={() => void ideas.actions.thinkAgain()}>
                {t('goose.ideas.thinkAgain')}
              </InkButton>
            )
          }
        >
          <InkText tone="secondary">{engine ? t('goose.ideas.emptyEngine') : t('goose.ideas.emptyBody')}</InkText>
        </InkEmptyState>
      ) : null}
      {shown.length ? (
        <InsetGroup>
          {shown.map((idea, i) => (
            <IdeaRow key={idea.id} idea={idea} first={i === 0} onOpen={() => router.push({ pathname: '/(stack)/goose-idea', params: { id: idea.id } })} />
          ))}
        </InsetGroup>
      ) : null}
      {shown.length && !thinking && !engine ? (
        <InkButton variant="quiet" icon="sparkle" onPress={() => void ideas.actions.thinkAgain()} style={styles.left}>
          {t('goose.ideas.thinkAgain')}
        </InkButton>
      ) : null}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({ left: { alignSelf: 'flex-start' } });
