/**
 * ConsolidationCard — start a tidy-up of the memory store and watch it run.
 *
 * Each stage of the Pond's run moves the meter a quarter; the tally at the end
 * says how many changes were made and how many were turned down.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkButton, InkCard, InkMeter, InkNotice, InkText } from '@jarida/ink/native';

import { CONSOLIDATION_STAGES, type ConsolidationProgress } from '@/models/memory';
import i18n from '@/services/i18n';
import { Spacing } from '@/constants/spacing';

export interface ConsolidationCardProps {
  progress: ConsolidationProgress;
  available: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function ConsolidationCard({ progress, available, onStart, onStop }: ConsolidationCardProps) {
  const { t } = useTranslation();
  const running = progress.status === 'running';

  return (
    <InkCard>
      <View style={styles.body}>
        <InkText weight="semibold">{t('memories.consolidate.title')}</InkText>
        <InkText size="sm" tone="secondary">{t('memories.consolidate.body')}</InkText>

        {running ? (
          <>
            <InkMeter
              label={t('memories.consolidate.progressLabel')}
              value={(CONSOLIDATION_STAGES.indexOf(progress.stage) + 1) / (CONSOLIDATION_STAGES.length + 1)}
            />
            <InkText size="sm">{stageText(progress)}</InkText>
          </>
        ) : null}

        {progress.status === 'done' ? (
          <InkNotice tone="success">
            {t('memories.consolidate.done', { accepted: progress.accepted, rejected: progress.rejected })}
          </InkNotice>
        ) : null}
        {progress.status === 'stopped' ? <InkNotice tone="neutral">{t('memories.consolidate.stopped')}</InkNotice> : null}
        {progress.status === 'failed' ? (
          <InkNotice tone="danger">{progress.message ?? t('memories.consolidate.failed')}</InkNotice>
        ) : null}
        {available ? null : <InkText size="sm" tone="tertiary">{t('memories.consolidate.mock')}</InkText>}

        {running ? (
          <InkButton variant="quiet" onPress={onStop}>{t('memories.consolidate.stop')}</InkButton>
        ) : (
          <InkButton variant="primary" disabled={!available} onPress={onStart}>
            {t('memories.consolidate.start')}
          </InkButton>
        )}
      </View>
    </InkCard>
  );
}

type Running = Extract<ConsolidationProgress, { status: 'running' }>;

function stageText(progress: Running): string {
  switch (progress.stage) {
    case 'proposing':
      return progress.memoryCount > 0
        ? i18n.t('memories.consolidate.proposing', { count: progress.memoryCount })
        : i18n.t('memories.consolidate.starting');
    case 'challenging': return i18n.t('memories.consolidate.challenging', { count: progress.proposals });
    case 'judging': return i18n.t('memories.consolidate.judging');
    case 'applying':
      return i18n.t('memories.consolidate.applying', { applied: progress.applied, count: progress.accepted });
  }
}

const styles = StyleSheet.create({
  body: { gap: Spacing.sm },
});
