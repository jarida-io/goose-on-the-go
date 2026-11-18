/**
 * Plans and things you follow: what Goose offered and waits on a yes for, what the member follows,
 * and what others shared with them. Each opens its plan; Add starts a new one.
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { InkButton, InkCard, InkChoice, InkEmptyState, InkInput, InkSheet, InkSpinner, InkText, InkTextArea } from '@/components/ui/ink';

import { ListSection } from '@/components/goose/about-parts';
import { CandidateBlock } from '@/components/goose/engine-parts';
import { GroupRow, InsetGroup } from '@/components/goose/following';
import { ScreenScroll } from '@/components/goose/hub-parts';
import { Labelled } from '@/components/goose/labelled';
import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { Spacing } from '@/constants/spacing';
import { ADDABLE_KINDS, anchorKindKey, candidates, followed, isReadable, type Anchor } from '@/models/anchors';
import { isUnavailable } from '@/models/content-state';
import { useAnchors } from '@/view-models/use-anchors';
import { useContentState } from '@/view-models/use-content-state';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';

function open(anchor: Pick<Anchor, 'id'>) {
  router.push({ pathname: '/(stack)/goose-anchor', params: { id: anchor.id } });
}

/** What a plan's row says under its title: what is ready, what Goose is doing, what it asks. */
function useDetail(): (anchor: Anchor) => string {
  const { t } = useTranslation();
  return (anchor) => {
    const ready = anchor.deliverables.filter(isReadable).length;
    const parts = [
      anchor.sharedBy ? t('goose.plans.by', { name: anchor.sharedBy }) : t(anchorKindKey(anchor.kind)),
      ready ? t('goose.plans.ready', { count: ready }) : null,
      anchor.job ? t('goose.plans.working') : null,
      anchor.openQuestions ? t('goose.plans.questions', { count: anchor.openQuestions }) : null,
    ];
    return parts.filter(Boolean).join(', ');
  };
}

function AddSheet({ open: shown, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (kind: (typeof ADDABLE_KINDS)[number], title: string, place: string, notes: string) => Promise<boolean> }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<(typeof ADDABLE_KINDS)[number]>('trip');
  const [title, setTitle] = useState('');
  const [place, setPlace] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <InkSheet open={shown} onClose={onClose} title={t('goose.plans.addTitle')} scroll>
      <View style={styles.sheet}>
        <Labelled label={t('goose.plans.addKind')}>
          <View style={styles.chips}>
            {ADDABLE_KINDS.map((k) => (
              <InkChoice key={k} selected={kind === k} onSelect={() => setKind(k)}>
                {t(anchorKindKey(k))}
              </InkChoice>
            ))}
          </View>
        </Labelled>
        <InkInput label={t('goose.plans.addWhat')} value={title} onChange={setTitle} placeholder={t('goose.plans.addWhatPlaceholder')} />
        <InkInput label={t('goose.plans.addPlace')} value={place} onChange={setPlace} placeholder={t('goose.plans.addPlacePlaceholder')} />
        <Labelled label={t('goose.plans.addNotes')}>
          <InkTextArea label={t('goose.plans.addNotes')} value={notes} onChange={setNotes} placeholder={t('goose.plans.addNotesPlaceholder')} rows={2} maxRows={4} />
        </Labelled>
        <InkButton
          variant="primary"
          block
          loading={saving}
          disabled={!title.trim() || saving}
          onPress={async () => {
            setSaving(true);
            const done = await onAdd(kind, title, place, notes);
            setSaving(false);
            if (done) {
              setTitle('');
              setPlace('');
              setNotes('');
              onClose();
            }
          }}
        >
          {t('goose.plans.addSave')}
        </InkButton>
      </View>
    </InkSheet>
  );
}

export default function GoosePlansScreen() {
  const { t } = useTranslation();
  const plans = useAnchors();
  const pull = usePullToRefresh(plans.actions.reload);
  const detail = useDetail();
  const { add } = useLocalSearchParams<{ add?: string }>();
  const [adding, setAdding] = useState(add === '1');
  const offered = candidates(plans.data);
  const mine = followed(plans.data.filter((a) => a.mine));
  const shared = followed(plans.data.filter((a) => !a.mine));
  const state = useContentState({ loading: plans.loading, failed: plans.failed, hasContent: plans.data.length > 0 });

  return (
    <>
      <ScreenScroll pull={pull} gap={Spacing.xl}>
        <InkText tone="secondary">{t('goose.plans.subtitle')}</InkText>
        <InkButton variant="primary" icon="plus" onPress={() => setAdding(true)} style={styles.left}>
          {t('goose.plans.add')}
        </InkButton>
        {state === 'loading' ? <InkSpinner label={t('goose.anchor.loading')} /> : null}
        {isUnavailable(state) ? <ContentUnavailable state={state} reason={plans.error} onRetry={plans.actions.reload} /> : null}
        {state === 'empty' ? (
          <InkEmptyState icon="calendar" title={t('goose.plans.title')}>
            <InkText tone="secondary">{t('goose.plans.empty')}</InkText>
          </InkEmptyState>
        ) : null}

        {offered.length > 0 ? (
          <ListSection title={t('goose.plans.offered')}>
            {offered.map((anchor) => (
              <InkCard key={anchor.id} raised>
                <CandidateBlock
                  anchor={anchor}
                  busy={plans.busy === anchor.id}
                  onYes={() => void plans.actions.confirm(anchor)}
                  onNo={() => void plans.actions.dismiss(anchor)}
                  onOpen={() => open(anchor)}
                />
              </InkCard>
            ))}
          </ListSection>
        ) : null}

        {mine.length > 0 ? (
          <ListSection title={t('goose.plans.following')}>
            <InsetGroup>
              {mine.map((anchor, i) => (
                <GroupRow key={anchor.id} first={i === 0} icon={anchor.job ? 'sparkle' : 'calendar'} label={anchor.title} detail={detail(anchor)} onPress={() => open(anchor)} />
              ))}
            </InsetGroup>
          </ListSection>
        ) : null}

        {shared.length > 0 ? (
          <ListSection title={t('goose.plans.sharedWithYou')}>
            <InsetGroup>
              {shared.map((anchor, i) => (
                <GroupRow key={anchor.id} first={i === 0} icon="users" label={anchor.title} detail={detail(anchor)} onPress={() => open(anchor)} />
              ))}
            </InsetGroup>
          </ListSection>
        ) : null}
      </ScreenScroll>
      <AddSheet
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={async (kind, title, place, notes) => {
          const made = await plans.actions.add({ kind, title, ...(place.trim() ? { place: place.trim() } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}) });
          if (made) open(made);
          return made !== null;
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  left: { alignSelf: 'flex-start' },
  sheet: { gap: Spacing.lg, paddingBottom: Spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
});
