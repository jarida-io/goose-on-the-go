/**
 * About you: the short sheet Goose works from, under its headings, which the member pins, rewords,
 * removes and adds to, with the count against its hundred lines; below it, the things Goose won't
 * suggest, built from what the member waved off.
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkButton, InkInput, InkNotice, InkSelect, InkSheet, InkSpinner, InkText, InkTextArea } from '@/components/ui/ink';

import { ListSection, SentenceRow } from '@/components/goose/about-parts';
import { InsetGroup } from '@/components/goose/following';
import { RoundButton, ScreenScroll, SectionHead } from '@/components/goose/hub-parts';
import { Labelled } from '@/components/goose/labelled';
import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { DangerQuietButton } from '@/components/pond/danger-quiet-button';
import { Spacing } from '@/constants/spacing';
import { isUnavailable } from '@/models/content-state';
import { FACT_CATEGORIES, factCategoryKey, groupFacts, type FactCategory, type SheetFact } from '@/models/fact-sheet';
import { useConfirm } from '@/providers/confirm-provider';
import { useContentState } from '@/view-models/use-content-state';
import { useFactSheet, type UseFactSheet } from '@/view-models/use-fact-sheet';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';

/** Adding a line, or rewording, refiling and removing one. */
function LineSheet({ open, fact, vm, onClose }: { open: boolean; fact: SheetFact | null; vm: UseFactSheet; onClose: () => void }) {
  const { t } = useTranslation();
  const ask = useConfirm();
  const [words, setWords] = useState(fact?.fact ?? '');
  const [category, setCategory] = useState<FactCategory>(fact?.category ?? 'other');
  const [saving, setSaving] = useState(false);
  return (
    <InkSheet open={open} onClose={onClose} title={fact ? t('goose.facts.editTitle') : t('goose.facts.addTitle')} scroll>
      <View style={styles.sheet}>
        <Labelled label={t('goose.facts.line')}>
          <InkTextArea label={t('goose.facts.line')} value={words} onChange={setWords} placeholder={t('goose.facts.linePlaceholder')} rows={2} maxRows={4} />
        </Labelled>
        <InkSelect<FactCategory>
          label={t('goose.facts.categoryLabel')}
          value={category}
          options={FACT_CATEGORIES.map((c) => ({ value: c, label: t(factCategoryKey(c)) }))}
          onChange={setCategory}
        />
        <InkButton
          variant="primary"
          block
          loading={saving}
          disabled={!words.trim() || saving}
          onPress={async () => {
            setSaving(true);
            const done = fact ? await vm.actions.edit(fact, words, category) : await vm.actions.add(category, words);
            setSaving(false);
            if (done) onClose();
          }}
        >
          {t('goose.facts.save')}
        </InkButton>
        {fact ? (
          <DangerQuietButton
            icon="trash"
            disabled={saving}
            onPress={async () => {
              if (await vm.actions.remove(fact, ask)) onClose();
            }}
          >
            {t('goose.facts.remove')}
          </DangerQuietButton>
        ) : null}
      </View>
    </InkSheet>
  );
}

function DontList({ vm }: { vm: UseFactSheet }) {
  const { t } = useTranslation();
  const [words, setWords] = useState('');
  return (
    <View style={styles.section}>
      <SectionHead title={t('goose.dont.title')} subtitle={t('goose.dont.subtitle')} size="small" />
      {vm.rules.length > 0 ? (
        <InsetGroup>
          {vm.rules.map((rule, i) => (
            <SentenceRow
              key={rule.id}
              first={i === 0}
              icon={rule.strength === 'never' ? 'eye-off' : 'minus'}
              text={rule.rule}
              detail={[rule.strength === 'never' ? t('goose.dont.never') : t('goose.dont.avoid'), rule.said].filter(Boolean).join(', ')}
              trailing={<RoundButton icon="x" size={30} label={t('goose.dont.remove', { rule: rule.rule })} onPress={() => void vm.actions.removeRule(rule)} />}
            />
          ))}
        </InsetGroup>
      ) : vm.rulesLoading ? null : (
        <InkText tone="secondary">{t('goose.dont.empty')}</InkText>
      )}
      <View style={styles.addRow}>
        <View style={styles.fill}>
          <InkInput label={t('goose.dont.add')} value={words} onChange={setWords} placeholder={t('goose.dont.addPlaceholder')} />
        </View>
        <InkButton
          variant="quiet"
          icon="plus"
          disabled={!words.trim()}
          onPress={async () => {
            if (await vm.actions.addRule(words)) setWords('');
          }}
        >
          {t('goose.dont.add')}
        </InkButton>
      </View>
    </View>
  );
}

export default function GooseFactsScreen() {
  const { t } = useTranslation();
  const vm = useFactSheet();
  const pull = usePullToRefresh(vm.actions.reload);
  // The sheet is remounted for each line, so its fields start from that line.
  const [sheet, setSheet] = useState<{ fact: SheetFact | null; key: number } | null>(null);
  const { facts, limit } = vm.data;
  const groups = groupFacts(facts);
  const state = useContentState({ loading: vm.loading, failed: vm.failed, hasContent: !vm.loading && !vm.failed });

  return (
    <>
      <ScreenScroll pull={pull} gap={Spacing.xl}>
        <InkText tone="secondary">{t('goose.facts.lead')}</InkText>
        {state === 'loading' ? <InkSpinner label={t('goose.facts.loading')} /> : null}
        {isUnavailable(state) ? <ContentUnavailable state={state} reason={vm.error} onRetry={vm.actions.reload} /> : null}
        {state === 'ready' ? (
          <>
            <View style={styles.head}>
              <InkText weight="semibold">{t('goose.facts.count', { count: facts.length, limit })}</InkText>
              <View style={styles.buttons}>
                <InkButton variant="primary" icon="plus" disabled={facts.length >= limit} onPress={() => setSheet({ fact: null, key: Date.now() })}>
                  {t('goose.facts.add')}
                </InkButton>
                <InkButton variant="quiet" icon="refresh" onPress={() => void vm.actions.rebuild()}>
                  {t('goose.facts.rebuild')}
                </InkButton>
              </View>
            </View>
            {facts.length === 0 ? <InkNotice>{t('goose.facts.empty')}</InkNotice> : null}
            {groups.map((group) => (
              <ListSection key={group.category} title={t(factCategoryKey(group.category))}>
                <InsetGroup>
                  {group.facts.map((fact, i) => (
                    <SentenceRow
                      key={fact.id}
                      first={i === 0}
                      icon={fact.pinned ? 'pin' : undefined}
                      text={fact.fact}
                      detail={[fact.pinned ? t('goose.facts.pinned') : null, fact.sourceKind === 'you' ? t('goose.facts.yours') : null].filter(Boolean).join(', ') || null}
                      label={t('goose.facts.actions', { fact: fact.fact })}
                      onPress={() => setSheet({ fact, key: Date.now() })}
                      trailing={
                        <View style={styles.rowButtons}>
                          <RoundButton icon="pin" size={30} label={fact.pinned ? t('goose.facts.unpin') : t('goose.facts.pin')} onPress={() => void vm.actions.pin(fact, !fact.pinned)} />
                          <RoundButton icon="edit" size={30} label={t('goose.facts.edit')} onPress={() => setSheet({ fact, key: Date.now() })} />
                        </View>
                      }
                    />
                  ))}
                </InsetGroup>
              </ListSection>
            ))}
            <DontList vm={vm} />
          </>
        ) : null}
      </ScreenScroll>
      {sheet ? <LineSheet key={sheet.key} open fact={sheet.fact} vm={vm} onClose={() => setSheet(null)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  head: { gap: Spacing.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  section: { gap: Spacing.md },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  fill: { flex: 1 },
  rowButtons: { flexDirection: 'row', gap: Spacing.xs },
  sheet: { gap: Spacing.lg, paddingBottom: Spacing.lg },
});
