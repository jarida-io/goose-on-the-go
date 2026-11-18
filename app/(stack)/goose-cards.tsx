/**
 * Every idea card the member has, new and saved, with refresh; where a pushed card's tap lands.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { InkText } from '@/components/ui/ink';

import { ScreenScroll } from '@/components/goose/hub-parts';
import { IdeaCardSetView } from '@/components/goose/idea-cards';
import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { Spacing } from '@/constants/spacing';
import { isUnavailable } from '@/models/content-state';
import { useContentState } from '@/view-models/use-content-state';
import { useHub } from '@/view-models/use-hub';
import { useIdeaCards } from '@/view-models/use-idea-cards';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';

export default function GooseCardsScreen() {
  const { t } = useTranslation();
  const { hub } = useHub();
  const cards = useIdeaCards(hub?.ideaCards === true);
  const pull = usePullToRefresh(cards.actions.reload);
  const state = useContentState({ loading: cards.loading, failed: cards.failed, hasContent: cards.cards.length > 0 });
  return (
    <ScreenScroll pull={pull} gap={Spacing.xl}>
      <InkText tone="secondary">{t('goose.ideaCards.subtitle')}</InkText>
      {isUnavailable(state) ? <ContentUnavailable state={state} reason={cards.error} onRetry={cards.actions.reload} /> : <IdeaCardSetView vm={cards} />}
    </ScreenScroll>
  );
}
