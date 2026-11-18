/**
 * The specialists: each knows one kind of plan, and the member switches each on or off. One Goose
 * offers says why; Budget, once on, leads to the ledger it keeps.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { InkButton, InkCard, InkNotice, InkSpinner, InkSwitch, InkText } from '@/components/ui/ink';

import { ScreenScroll } from '@/components/goose/hub-parts';
import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { Spacing } from '@/constants/spacing';
import { isUnavailable } from '@/models/content-state';
import { useContentState } from '@/view-models/use-content-state';
import { useHub } from '@/view-models/use-hub';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';
import { useSpecialists } from '@/view-models/use-specialists';

export default function GooseSpecialistsScreen() {
  const { t } = useTranslation();
  const { hub } = useHub();
  const vm = useSpecialists();
  const pull = usePullToRefresh(vm.actions.reload);
  const state = useContentState({ loading: vm.loading, failed: vm.failed, hasContent: vm.data.length > 0 });

  return (
    <ScreenScroll pull={pull} gap={Spacing.lg}>
      <InkText tone="secondary">{t('goose.specialists.lead')}</InkText>
      {state === 'loading' ? <InkSpinner label={t('goose.specialists.loading')} /> : null}
      {isUnavailable(state) ? <ContentUnavailable state={state} reason={vm.error} onRetry={vm.actions.reload} /> : null}
      {vm.data.map((s) => (
        <InkCard key={s.id} raised={s.state === 'offered'}>
          <InkSwitch checked={s.state === 'on'} label={s.title} disabled={vm.busy === s.id} onChange={(on) => void vm.actions.setOn(s, on)}>
            <View style={styles.words}>
              <InkText weight="semibold">{s.title}</InkText>
              {s.about ? (
                <InkText size="sm" tone="secondary">
                  {s.about}
                </InkText>
              ) : null}
            </View>
          </InkSwitch>
          {s.state === 'offered' ? <InkNotice tone="brand">{s.why ? t('goose.specialists.offeredWhy', { why: s.why }) : t('goose.specialists.offered')}</InkNotice> : null}
          {s.state === 'declined' ? (
            <InkText size="sm" tone="tertiary">
              {t('goose.specialists.declined')}
            </InkText>
          ) : null}
          {s.id === 'budget' && s.state === 'on' && hub?.ledger ? (
            <InkButton variant="quiet" icon="wallet" onPress={() => router.push('/(stack)/goose-ledger')} style={styles.left}>
              {t('goose.specialists.budgetLink')}
            </InkButton>
          ) : null}
        </InkCard>
      ))}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  words: { flex: 1, gap: 2 },
  left: { alignSelf: 'flex-start', marginTop: Spacing.sm },
});
