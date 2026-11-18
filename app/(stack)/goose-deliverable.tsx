/**
 * One piece of finished work Goose made for a plan, read as the long-task report is: the document in
 * its sections, its facts at a glance, its sources, what the last refresh changed, and, when Goose
 * was not sure, what its checker still held against it. Opening it marks it read.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { InkButton, InkCard, InkEyebrow, InkNotice, InkSpinner, InkText, InkTitle } from '@/components/ui/ink';

import { ListSection } from '@/components/goose/about-parts';
import { FactRows, RejectSheet } from '@/components/goose/engine-parts';
import { ScreenScroll } from '@/components/goose/hub-parts';
import { SourcesChipRow, useSources } from '@/components/patterns/cited-sources';
import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { Markdown } from '@/components/patterns/markdown';
import { Spacing } from '@/constants/spacing';
import { deliverableKindKey, deliverableStateKey, isReadable } from '@/models/anchors';
import { isUnavailable } from '@/models/content-state';
import { reportSections } from '@/models/long-tasks';
import { routeId } from '@/models/me-read';
import { useContentState } from '@/view-models/use-content-state';
import { useDeliverable } from '@/view-models/use-deliverable';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';

export default function GooseDeliverableScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = routeId(params.id);
  const vm = useDeliverable(id);
  const pull = usePullToRefresh(vm.actions.reload);
  const [rejecting, setRejecting] = useState(false);
  const d = vm.data;
  const cited = useSources(d?.sources ?? []);
  const sections = useMemo(() => reportSections(d?.body ?? ''), [d?.body]);
  const state = useContentState({ loading: vm.loading, failed: vm.failed || !id, hasContent: d !== null });

  useEffect(() => {
    if (d) navigation.setOptions({ title: d.title });
  }, [d, navigation]);

  const notReady = d ? deliverableStateKey(d.state) : null;
  const making = d !== null && (d.job !== null || d.state === 'queued' || d.state === 'making');
  const canAct = d?.mine === true && d.state !== 'rejected' && d.state !== 'archived';

  return (
    <>
      <ScreenScroll pull={pull} gap={Spacing.xl}>
        {state === 'loading' ? <InkSpinner label={t('goose.deliverable.loading')} /> : null}
        {isUnavailable(state) ? <ContentUnavailable state={state} reason={vm.error} onRetry={vm.actions.reload} /> : null}
        {d ? (
          <>
            <View style={styles.head}>
              <InkEyebrow>{t(deliverableKindKey(d.kind))}</InkEyebrow>
              <InkTitle level={1}>{d.title}</InkTitle>
              {d.anchorTitle ? (
                <InkButton variant="quiet" icon="calendar" onPress={() => router.push({ pathname: '/(stack)/goose-anchor', params: { id: d.anchorId } })} style={styles.left}>
                  {t('goose.deliverable.forAnchor', { anchor: d.anchorTitle })}
                </InkButton>
              ) : null}
              {d.hook ? <InkText tone="secondary">{d.hook}</InkText> : null}
            </View>

            {making ? <InkSpinner label={d.state === 'queued' || d.state === 'making' ? t('goose.deliverable.making') : t('goose.deliverable.refreshing')} /> : null}
            {notReady && d.state !== 'queued' && d.state !== 'making' ? <InkNotice>{d.state === 'rejected' ? t('goose.deliverable.rejectedState') : t(notReady)}</InkNotice> : null}

            {d.state === 'unsure' ? (
              <InkCard>
                <InkNotice tone="warning">{t('goose.deliverable.unsureTitle')}</InkNotice>
                <InkText size="sm" tone="secondary">
                  {t('goose.deliverable.unsureBody')}
                </InkText>
                {d.objections.map((o, i) => (
                  <View key={`${o.kind}-${i}`} style={styles.objection}>
                    <InkText>{o.about}</InkText>
                    {o.fix ? (
                      <InkText size="sm" tone="secondary">
                        {t('goose.deliverable.fix', { fix: o.fix })}
                      </InkText>
                    ) : null}
                  </View>
                ))}
              </InkCard>
            ) : null}

            {d.changed ? (
              <ListSection title={t('goose.deliverable.changed')}>
                <InkText>{d.changed}</InkText>
                {d.version > 1 ? (
                  <InkText size="sm" tone="secondary">
                    {t('goose.deliverable.version', { count: d.version })}
                  </InkText>
                ) : null}
              </ListSection>
            ) : null}

            {d.facts.length > 0 ? (
              <ListSection title={t('goose.deliverable.facts')}>
                <FactRows facts={d.facts} />
              </ListSection>
            ) : null}

            {isReadable(d) || d.body.trim() ? (
              <View style={styles.body}>
                {sections.map((section, i) =>
                  // The sources are the row below, numbered like the chips in the text.
                  d.sources.length > 0 && section.title.trim().toLowerCase() === 'sources' ? null : <Markdown key={i} source={section.markdown} sources={cited.chips} />,
                )}
              </View>
            ) : null}

            {d.sources.length > 0 ? (
              <ListSection title={t('goose.deliverable.sources')}>
                <SourcesChipRow state={cited} />
              </ListSection>
            ) : null}

            <View style={styles.actions}>
              {canAct ? (
                <InkButton variant="quiet" icon="refresh" loading={vm.busy === 'refresh'} disabled={vm.busy !== null || making} onPress={() => void vm.actions.refresh()}>
                  {t('goose.deliverable.refresh')}
                </InkButton>
              ) : null}
              {d.body.trim() ? (
                <InkButton variant="quiet" icon="upload" disabled={vm.sharing} onPress={() => void vm.actions.share()}>
                  {vm.sharing ? t('goose.deliverable.sharing') : t('goose.deliverable.share')}
                </InkButton>
              ) : null}
              {canAct ? (
                <InkButton variant="quiet" icon="thumbs-down" disabled={vm.busy !== null} onPress={() => setRejecting(true)}>
                  {t('goose.deliverable.reject')}
                </InkButton>
              ) : null}
            </View>
            {vm.shareError ? <InkNotice tone="danger">{vm.shareError}</InkNotice> : null}
          </>
        ) : null}
      </ScreenScroll>
      {d && canAct ? <RejectSheet open={rejecting} busy={vm.busy === 'reject'} onClose={() => setRejecting(false)} onReject={vm.actions.reject} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  head: { gap: Spacing.xs },
  left: { alignSelf: 'flex-start' },
  body: { gap: Spacing.md },
  objection: { gap: 2, marginTop: Spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
});
