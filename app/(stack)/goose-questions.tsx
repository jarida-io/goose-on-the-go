/**
 * Goose's questions: every open or waiting batch, or the one a notification named, or a plan's. A
 * batch is answered whole, with options or the member's own words under Other, or ended with Done.
 */

import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { InkEmptyState, InkSpinner, InkText } from '@/components/ui/ink';

import { QuestionBatchList } from '@/components/goose/engine-parts';
import { ScreenScroll } from '@/components/goose/hub-parts';
import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { Spacing } from '@/constants/spacing';
import { isUnavailable } from '@/models/content-state';
import { routeId } from '@/models/me-read';
import { useContentState } from '@/view-models/use-content-state';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';
import { useQuestions } from '@/view-models/use-questions';

export default function GooseQuestionsScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ batch?: string; anchor?: string }>();
  const batchId = routeId(params.batch) || null;
  const anchorId = routeId(params.anchor) || null;
  const questions = useQuestions({ batchId, anchorId });
  const pull = usePullToRefresh(questions.actions.reload);
  const state = useContentState({ loading: questions.loading, failed: questions.failed, hasContent: questions.batches.length > 0 });

  return (
    <ScreenScroll pull={pull} gap={Spacing.xl}>
      <InkText tone="secondary">{t('goose.questions.lead')}</InkText>
      {state === 'loading' ? <InkSpinner label={t('goose.questions.loading')} /> : null}
      {isUnavailable(state) ? <ContentUnavailable state={state} reason={questions.error} onRetry={questions.actions.reload} /> : null}
      {state === 'empty' ? <InkEmptyState icon="done" title={t('goose.questions.empty')} /> : null}
      <QuestionBatchList
        vm={questions}
        onOpenPlan={anchorId ? undefined : (id) => router.push({ pathname: '/(stack)/goose-anchor', params: { id } })}
        onOpenChat={(session, title) => router.push({ pathname: '/conversation', params: { session, title } })}
      />
    </ScreenScroll>
  );
}
