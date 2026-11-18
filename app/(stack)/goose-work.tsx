/**
 * What Goose is working on: the jobs the heartbeat left itself, each waiting for its moment and
 * withdrawable, and every piece of work it made, with what its checker held against it.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { InkSpinner, InkText } from '@/components/ui/ink';

import { SentenceRow } from '@/components/goose/about-parts';
import { InsetGroup } from '@/components/goose/following';
import { RoundButton, ScreenScroll, SectionHead, useAgo } from '@/components/goose/hub-parts';
import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { Spacing } from '@/constants/spacing';
import { isUnavailable } from '@/models/content-state';
import { actKey, jobStateKey, type EngineJob } from '@/models/engine-log';
import { useConfirm } from '@/providers/confirm-provider';
import { useContentState } from '@/view-models/use-content-state';
import { useEngineWork } from '@/view-models/use-engine-work';
import { useHub } from '@/view-models/use-hub';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';

function openJob(job: EngineJob) {
  if (job.deliverableId) router.push({ pathname: '/(stack)/goose-deliverable', params: { id: job.deliverableId } });
  else if (job.anchorId) router.push({ pathname: '/(stack)/goose-anchor', params: { id: job.anchorId } });
}

export default function GooseWorkScreen() {
  const { t } = useTranslation();
  const ask = useConfirm();
  const ago = useAgo();
  const { hub } = useHub();
  const parts = { log: hub?.engine_log === true, intentions: hub?.intentions === true };
  const vm = useEngineWork(parts);
  const pull = usePullToRefresh(vm.actions.reload);
  const waiting = vm.waiting.data;
  const jobs = vm.jobs.data;
  const failed = (parts.log ? vm.jobs.failed : true) && (parts.intentions ? vm.waiting.failed : true);
  const state = useContentState({ loading: vm.loading, failed, hasContent: !vm.loading });

  return (
    <ScreenScroll pull={pull} gap={Spacing.xl}>
      {state === 'loading' ? <InkSpinner label={t('goose.work.loading')} /> : null}
      {isUnavailable(state) ? <ContentUnavailable state={state} reason={vm.jobs.error ?? vm.waiting.error} onRetry={vm.actions.reload} /> : null}

      {parts.intentions && state !== 'loading' ? (
        <View style={styles.section}>
          <SectionHead title={t('goose.work.waitingTitle')} subtitle={t('goose.work.waitingSubtitle')} size="small" />
          {waiting.length > 0 ? (
            <InsetGroup>
              {waiting.map((intention, i) => (
                <SentenceRow
                  key={intention.id}
                  first={i === 0}
                  text={`${t(actKey(intention.act))}: ${intention.text}`}
                  detail={[intention.when ? t('goose.work.when', { when: intention.when }) : null, intention.why ? t('goose.work.why', { why: intention.why }) : null].filter(Boolean).join('  ')}
                  detailLines={3}
                  trailing={<RoundButton icon="x" size={30} label={t('goose.work.withdraw')} onPress={() => void vm.actions.withdraw(intention, ask)} />}
                />
              ))}
            </InsetGroup>
          ) : (
            <InkText tone="secondary">{t('goose.work.waitingEmpty')}</InkText>
          )}
        </View>
      ) : null}

      {parts.log && state !== 'loading' ? (
        <View style={styles.section}>
          <SectionHead title={t('goose.work.logTitle')} subtitle={t('goose.work.logSubtitle')} size="small" />
          {jobs.length > 0 ? (
            <InsetGroup>
              {jobs.map((job, i) => (
                <SentenceRow
                  key={job.id}
                  first={i === 0}
                  text={job.subject || job.outcome || t(jobStateKey(job.state))}
                  detail={[
                    t(jobStateKey(job.state)),
                    ago(job.finishedAt ?? job.createdAt),
                    job.objections.length ? t('goose.work.objections', { count: job.objections.length }) : null,
                    job.outcome && job.outcome !== job.subject ? job.outcome : null,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                  detailLines={3}
                  label={job.deliverableId || job.anchorId ? `${job.subject}, ${t('goose.work.open')}` : undefined}
                  onPress={job.deliverableId || job.anchorId ? () => openJob(job) : undefined}
                />
              ))}
            </InsetGroup>
          ) : (
            <InkText tone="secondary">{t('goose.work.logEmpty')}</InkText>
          )}
        </View>
      ) : null}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.md },
});
