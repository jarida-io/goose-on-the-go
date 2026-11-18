/**
 * The Budget ledger: a month at a time, what the member spent as the Budget specialist read it from
 * their receipts, the totals by category for each currency, and each entry to correct or delete.
 * Amounts stay the Pond's decimal strings; nothing here adds them up.
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { InkButton, InkCard, InkInput, InkNotice, InkSelect, InkSheet, InkSpinner, InkText } from '@/components/ui/ink';

import { ListSection, SentenceRow } from '@/components/goose/about-parts';
import { InsetGroup } from '@/components/goose/following';
import { RoundButton, ScreenScroll } from '@/components/goose/hub-parts';
import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { DangerQuietButton } from '@/components/pond/danger-quiet-button';
import { Spacing } from '@/constants/spacing';
import { isUnavailable } from '@/models/content-state';
import { ledgerCategoryKey, LEDGER_CATEGORIES, moneyText, type LedgerCategory, type LedgerEntry } from '@/models/specialists';
import { useConfirm } from '@/providers/confirm-provider';
import { useContentState } from '@/view-models/use-content-state';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';
import { useLedger, useSpecialists, type UseLedger } from '@/view-models/use-specialists';

function EntrySheet({ entry, vm, onClose }: { entry: LedgerEntry; vm: UseLedger; onClose: () => void }) {
  const { t } = useTranslation();
  const ask = useConfirm();
  const [payee, setPayee] = useState(entry.payee);
  const [amount, setAmount] = useState(entry.amount);
  const [category, setCategory] = useState<LedgerCategory>(entry.category);
  const [note, setNote] = useState(entry.note ?? '');
  const [saving, setSaving] = useState(false);
  return (
    <InkSheet open onClose={onClose} title={t('goose.ledger.editTitle')} scroll>
      <View style={styles.sheet}>
        <InkInput label={t('goose.ledger.payee')} value={payee} onChange={setPayee} />
        <InkInput label={`${t('goose.ledger.amount')} (${entry.currency})`} value={amount} onChange={setAmount} type="number" placeholder={t('goose.ledger.amountHint')} />
        <InkSelect<LedgerCategory>
          label={t('goose.ledger.categoryLabel')}
          value={category}
          options={LEDGER_CATEGORIES.map((c) => ({ value: c, label: t(ledgerCategoryKey(c)) }))}
          onChange={setCategory}
        />
        <InkInput label={t('goose.ledger.note')} value={note} onChange={setNote} />
        <InkButton
          variant="primary"
          block
          loading={saving}
          disabled={saving}
          onPress={async () => {
            setSaving(true);
            const done = await vm.actions.edit(entry, { payee, amount, category, note });
            setSaving(false);
            if (done) onClose();
          }}
        >
          {t('goose.ledger.save')}
        </InkButton>
        <DangerQuietButton
          icon="trash"
          disabled={saving}
          onPress={async () => {
            if (await vm.actions.remove(entry, ask)) onClose();
          }}
        >
          {t('goose.ledger.delete')}
        </DangerQuietButton>
      </View>
    </InkSheet>
  );
}

export default function GooseLedgerScreen() {
  const { t, i18n } = useTranslation();
  const specialists = useSpecialists();
  const on = specialists.budgetOn;
  const vm = useLedger(on);
  const pull = usePullToRefresh(async () => {
    await Promise.all([specialists.actions.reload(), on ? vm.actions.reload() : undefined]);
  });
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const budget = specialists.data.find((s) => s.id === 'budget') ?? null;
  const state = useContentState({ loading: vm.loading, failed: vm.failed, hasContent: !vm.loading && !vm.failed });
  const [y, m] = vm.month.split('-').map(Number);
  const monthName = y && m ? new Date(y, m - 1, 1).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' }) : vm.month;
  const day = (iso: string) => {
    const [yy, mm, dd] = iso.split('-').map(Number);
    return yy && mm && dd ? new Date(yy, mm - 1, dd).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }) : iso;
  };

  return (
    <>
      <ScreenScroll pull={pull} gap={Spacing.xl}>
        <InkText tone="secondary">{t('goose.ledger.lead')}</InkText>
        {specialists.loading ? <InkSpinner label={t('goose.ledger.loading')} /> : null}
        {!specialists.loading && !on ? (
          <InkCard>
            <InkNotice>{t('goose.ledger.off')}</InkNotice>
            {budget ? (
              <InkButton variant="primary" icon="wallet" onPress={() => void specialists.actions.setOn(budget, true)} style={styles.left}>
                {t('goose.ledger.turnOn')}
              </InkButton>
            ) : (
              <InkButton variant="quiet" onPress={() => router.push('/(stack)/goose-specialists')} style={styles.left}>
                {t('goose.you.specialists')}
              </InkButton>
            )}
          </InkCard>
        ) : null}
        {on ? (
          <>
            <View style={styles.month}>
              <RoundButton icon="chevron-left" label={t('goose.ledger.previous')} onPress={() => vm.actions.step(-1)} />
              <InkText size="lg" weight="semibold" style={styles.monthName}>
                {vm.isThisMonth ? `${monthName}, ${t('goose.ledger.thisMonth')}` : monthName}
              </InkText>
              <RoundButton icon="chevron-right" label={t('goose.ledger.next')} onPress={() => vm.actions.step(1)} />
            </View>
            {state === 'loading' ? <InkSpinner label={t('goose.ledger.loading')} /> : null}
            {isUnavailable(state) ? <ContentUnavailable state={state} reason={vm.error} onRetry={vm.actions.reload} /> : null}
            {state === 'ready' && vm.data.entries.length === 0 ? <InkText tone="secondary">{t('goose.ledger.empty')}</InkText> : null}

            {vm.data.totals.length > 0 ? (
              <ListSection title={t('goose.ledger.totals')}>
                {vm.data.totals.map((total) => (
                  <InkCard key={total.currency}>
                    <InkText size="xl" weight="bold">
                      {moneyText(total.total, total.currency, i18n.language)}
                    </InkText>
                    {total.byCategory.map((c) => (
                      <View key={c.category} style={styles.total}>
                        <InkText tone="secondary">{t(ledgerCategoryKey(c.category))}</InkText>
                        <InkText numeric>{moneyText(c.total, '', i18n.language)}</InkText>
                      </View>
                    ))}
                  </InkCard>
                ))}
              </ListSection>
            ) : null}

            {vm.data.entries.length > 0 ? (
              <ListSection title={t('goose.ledger.entries')}>
                <InsetGroup>
                  {vm.data.entries.map((entry, i) => (
                    <SentenceRow
                      key={entry.id}
                      first={i === 0}
                      text={`${entry.payee || t('goose.ledger.noPayee')}, ${moneyText(entry.amount, entry.currency, i18n.language)}`}
                      detail={[day(entry.occurredOn), t(ledgerCategoryKey(entry.category)), entry.note].filter(Boolean).join(', ')}
                      label={t('goose.ledger.edit')}
                      onPress={() => setEditing(entry)}
                    />
                  ))}
                </InsetGroup>
              </ListSection>
            ) : null}
          </>
        ) : null}
      </ScreenScroll>
      {editing ? <EntrySheet key={editing.id} entry={editing} vm={vm} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  left: { alignSelf: 'flex-start', marginTop: Spacing.sm },
  month: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  monthName: { flex: 1, textAlign: 'center' },
  total: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md, marginTop: Spacing.xs },
  sheet: { gap: Spacing.lg, paddingBottom: Spacing.lg },
});
