/**
 * One plan: what Goose knows about it, what it made, what it is doing now step by step, and what it
 * asks. Its owner confirms or waves off an offer, takes a wrong fact off, shares it and stops it; a
 * member it is shared with reads it and answers its questions.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { InkButton, InkCard, InkCheckbox, InkEyebrow, InkNotice, InkSheet, InkSpinner, InkText, InkTitle } from '@/components/ui/ink';

import { ListSection } from '@/components/goose/about-parts';
import { CandidateBlock, DeliverableRow, FactRows, JobSteps, QuestionBatchList, StopSheet } from '@/components/goose/engine-parts';
import { InsetGroup } from '@/components/goose/following';
import { ScreenScroll } from '@/components/goose/hub-parts';
import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { DangerQuietButton } from '@/components/pond/danger-quiet-button';
import { Spacing } from '@/constants/spacing';
import { anchorKindKey, type Anchor } from '@/models/anchors';
import { isUnavailable } from '@/models/content-state';
import { routeId } from '@/models/me-read';
import { useAnchor } from '@/view-models/use-anchors';
import { useContentState } from '@/view-models/use-content-state';
import { useHub } from '@/view-models/use-hub';
import { useMember } from '@/view-models/use-household';
import { useProfiles } from '@/view-models/use-profiles';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';
import { useQuestions } from '@/view-models/use-questions';

/** When and where, as a line: "12 Dec to 18 Dec, Diani". */
function useWhenWhere(): (anchor: Anchor) => string | null {
  const { t, i18n } = useTranslation();
  const day = (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
  return (anchor) => {
    const when = anchor.startsAt && anchor.endsAt ? t('goose.anchor.until', { from: day(anchor.startsAt), until: day(anchor.endsAt) }) : anchor.startsAt ? t('goose.anchor.from', { date: day(anchor.startsAt) }) : null;
    const line = [when, anchor.place].filter(Boolean).join(', ');
    return line || null;
  };
}

function ShareSheet({ open, anchor, busy, onClose, onSave }: { open: boolean; anchor: Anchor; busy: boolean; onClose: () => void; onSave: (ids: string[]) => Promise<boolean> }) {
  const { t } = useTranslation();
  const me = useMember();
  const { data } = useProfiles();
  const others = data.profiles.filter((p) => p.id !== me?.id);
  const [chosen, setChosen] = useState<string[]>(anchor.shares);
  return (
    <InkSheet open={open} onClose={onClose} title={t('goose.anchor.share')} description={t('goose.anchor.shareBody')} scroll>
      <View style={styles.sheet}>
        {others.length === 0 ? <InkText tone="secondary">{t('goose.anchor.shareNobody')}</InkText> : null}
        {others.map((p) => (
          <InkCheckbox
            key={p.id}
            checked={chosen.includes(p.id)}
            label={p.display_name}
            onChange={(on) => setChosen((all) => (on ? [...all, p.id] : all.filter((id) => id !== p.id)))}
          />
        ))}
        <InkButton
          variant="primary"
          block
          loading={busy}
          disabled={others.length === 0}
          onPress={async () => {
            if (await onSave(chosen)) onClose();
          }}
        >
          {t('goose.facts.save')}
        </InkButton>
      </View>
    </InkSheet>
  );
}

export default function GooseAnchorScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = routeId(params.id);
  const { hub } = useHub();
  const vm = useAnchor(id);
  const questions = useQuestions({ anchorId: id }, id !== '' && hub?.questions !== false);
  const pull = usePullToRefresh(async () => {
    await Promise.all([vm.actions.reload(), questions.actions.reload()]);
  });
  const whenWhere = useWhenWhere();
  const [stopping, setStopping] = useState(false);
  const [sharing, setSharing] = useState(false);
  const anchor = vm.data;
  const state = useContentState({ loading: vm.loading, failed: vm.failed || !id, hasContent: anchor !== null });

  useEffect(() => {
    if (anchor) navigation.setOptions({ title: anchor.title });
  }, [anchor, navigation]);

  const openDeliverable = (deliverableId: string) => router.push({ pathname: '/(stack)/goose-deliverable', params: { id: deliverableId } });
  const owner = anchor?.mine === true;
  const live = anchor?.state === 'active' || anchor?.state === 'candidate';
  const line = anchor ? whenWhere(anchor) : null;

  return (
    <>
      <ScreenScroll pull={pull} gap={Spacing.xl}>
        {state === 'loading' ? <InkSpinner label={t('goose.anchor.loading')} /> : null}
        {isUnavailable(state) ? <ContentUnavailable state={state} reason={vm.error} onRetry={vm.actions.reload} /> : null}
        {anchor ? (
          <>
            <View style={styles.head}>
              <InkEyebrow>{t(anchorKindKey(anchor.kind))}</InkEyebrow>
              <InkTitle level={1}>{anchor.title}</InkTitle>
              {line ? <InkText tone="secondary">{line}</InkText> : null}
              {anchor.state === 'stopped' ? <InkNotice>{t('goose.anchor.stoppedState')}</InkNotice> : null}
              {anchor.state === 'ended' ? <InkNotice>{t('goose.anchor.endedState')}</InkNotice> : null}
              {!owner ? <InkNotice>{anchor.sharedBy ? t('goose.anchor.readOnly', { name: anchor.sharedBy }) : t('goose.anchor.readOnlyNoName')}</InkNotice> : null}
            </View>

            {anchor.state === 'candidate' && owner ? (
              <InkCard raised>
                <InkText size="sm" weight="semibold" tone="secondary">
                  {t('goose.anchor.offeredTitle')}
                </InkText>
                <CandidateBlock
                  anchor={anchor}
                  busy={vm.busy === 'confirm' || vm.busy === 'dismiss'}
                  onYes={() => void vm.actions.confirm()}
                  onNo={async () => {
                    if (await vm.actions.dismiss()) router.back();
                  }}
                />
              </InkCard>
            ) : null}

            {anchor.job ? (
              <InkCard>
                <JobSteps job={anchor.job} />
              </InkCard>
            ) : null}

            {anchor.facts.length > 0 ? (
              <ListSection title={t('goose.anchor.facts')}>
                <FactRows facts={anchor.facts} onRemove={owner && live ? (fact) => void vm.actions.removeFact(fact) : undefined} />
              </ListSection>
            ) : null}

            <ListSection title={t('goose.anchor.made')}>
              {anchor.deliverables.length > 0 ? (
                <InsetGroup>
                  {anchor.deliverables.map((d, i) => (
                    <DeliverableRow key={d.id} deliverable={d} first={i === 0} onOpen={() => openDeliverable(d.id)} />
                  ))}
                </InsetGroup>
              ) : (
                <InkText tone="secondary">{t('goose.anchor.noneMade')}</InkText>
              )}
            </ListSection>

            {questions.batches.length > 0 ? (
              <ListSection title={t('goose.anchor.questions')}>
                <QuestionBatchList vm={questions} titles={false} />
              </ListSection>
            ) : null}

            {owner && live ? (
              <View style={styles.actions}>
                <InkButton variant="quiet" icon="users" onPress={() => setSharing(true)} style={styles.left}>
                  {t('goose.anchor.share')}
                </InkButton>
                {anchor.state === 'active' ? (
                  <DangerQuietButton icon="stop" onPress={() => setStopping(true)}>
                    {t('goose.anchor.stop')}
                  </DangerQuietButton>
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}
      </ScreenScroll>
      {anchor && owner ? (
        <>
          <StopSheet open={stopping} busy={vm.busy === 'stop'} onClose={() => setStopping(false)} onStop={vm.actions.stop} />
          {sharing ? <ShareSheet open anchor={anchor} busy={vm.busy === 'share'} onClose={() => setSharing(false)} onSave={vm.actions.share} /> : null}
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  head: { gap: Spacing.xs },
  actions: { gap: Spacing.sm, alignItems: 'flex-start' },
  left: { alignSelf: 'flex-start' },
  sheet: { gap: Spacing.lg, paddingBottom: Spacing.lg },
});
