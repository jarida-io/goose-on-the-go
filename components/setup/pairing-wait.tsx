/**
 * What a phone shows while a locked Pond's main member decides: that it is waiting, how the
 * wait ended when it ends, and the way in for the main member's own new phone, with the PIN.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkButton, InkNotice, InkSpinner, InkText } from '@/components/ui/ink';

import { Spacing } from '@/constants/spacing';
import type { HeldPairing } from '@/models/pairing-lock';
import { usePairingWait, type PairingWaitDeps } from '@/view-models/use-pairing-wait';
import { PasscodePad } from './passcode-pad';

export function PairingWait({
  held,
  onAgain,
  onCancel,
  ...deps
}: PairingWaitDeps & {
  held: HeldPairing;
  /** Ask again, after the request ended without a pairing. */
  onAgain: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const wait = usePairingWait(held, deps);
  const { phase, refusal, recovery } = wait.data;

  if (phase !== 'waiting') {
    return (
      <View style={styles.panel} accessibilityLiveRegion="polite">
        <InkNotice tone={phase === 'declined' ? 'danger' : 'warning'}>
          {phase === 'declined' ? t('pairingLock.wait.declined') : phase === 'gone' ? t('pairingLock.wait.gone') : (refusal ?? t('pairing.failed'))}
        </InkNotice>
        <View style={styles.row}>
          <InkButton variant="primary" onPress={onAgain}>
            {t('pairingLock.wait.again')}
          </InkButton>
          <InkButton variant="quiet" onPress={onCancel}>
            {t('common.cancel')}
          </InkButton>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <View accessibilityLiveRegion="polite">
        <InkSpinner label={t('pairingLock.wait.waiting')} />
      </View>
      <InkText tone="secondary">{t('pairingLock.wait.body')}</InkText>
      {recovery.open ? (
        <>
          <PasscodePad
            title={t('pairingLock.wait.pinLabel')}
            subtitle={t('pairingLock.pinPlaceholder')}
            length={6}
            value={recovery.pin}
            error={recovery.error}
            busy={recovery.checking}
            autoSubmit={false}
            submitLabel={t('pairingLock.wait.usePin')}
            onChange={wait.actions.setPin}
            onSubmit={wait.actions.submitPin}
          />
          {recovery.coolingSecs > 0 ? <InkNotice tone="warning">{t('pairingLock.wait.cooling', { count: recovery.coolingSecs })}</InkNotice> : null}
          <View style={styles.row}>
            <InkButton variant="quiet" disabled={recovery.checking} onPress={wait.actions.closeRecovery}>
              {t('pairingLock.wait.keepWaiting')}
            </InkButton>
          </View>
        </>
      ) : (
        <View style={styles.row}>
          <InkButton variant="quiet" icon="key" onPress={wait.actions.openRecovery}>
            {t('pairingLock.wait.mainMember')}
          </InkButton>
          <InkButton variant="quiet" onPress={onCancel}>
            {t('common.cancel')}
          </InkButton>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: Spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
});
