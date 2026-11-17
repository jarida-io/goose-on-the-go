/**
 * The pairing lock: whether a new phone waits for the Pond's main member, who that is, and, for
 * the main member, the switch, the recovery PIN and the phones asking to pair. A notice that a
 * phone is asking opens here.
 */

import React, { useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkButton, InkSpinner } from '@/components/ui/ink';

import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { DigitsField } from '@/components/setup/claim-fields';
import { useAgo } from '@/components/goose/hub-parts';
import { SwitchRow } from '@/components/settings/setting-controls';
import { SettingsGroup, SettingsMessage, SettingsRow } from '@/components/settings/settings-list';
import { SettingsNotice, SettingsScroll } from '@/components/settings/settings-scroll';
import { useSettingsStyles, type SettingsColors, type SettingsMetrics, type SettingsType } from '@/components/settings/settings-theme';
import { Spacing } from '@/constants/spacing';
import { isUnavailable } from '@/models/content-state';
import { pinConfirmation, pinDigits, type PairingRequest } from '@/models/pairing-lock';
import { useConfirm } from '@/providers/confirm-provider';
import { confirm as confirmTick, selectionTick } from '@/services/haptics';
import { useContentState } from '@/view-models/use-content-state';
import { usePairingLock } from '@/view-models/use-pairing-lock';

function RequestRow({
  request,
  busy,
  disabled,
  onAccept,
  onDecline,
}: {
  request: PairingRequest;
  busy: boolean;
  disabled: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation();
  const ago = useAgo();
  const styles = useSettingsStyles(makeStyles);
  const asked = ago(request.createdAt);
  return (
    <SettingsRow
      label={request.deviceName || t('pairingLock.unnamedPhone')}
      description={asked ? t('pairingLock.asked', { when: asked }) : null}
    >
      <View style={styles.answers}>
        <InkButton variant="primary" size="sm" loading={busy} disabled={disabled} onPress={onAccept}>
          {t('pairingLock.accept')}
        </InkButton>
        <InkButton variant="quiet" size="sm" disabled={disabled} onPress={onDecline}>
          {t('pairingLock.decline')}
        </InkButton>
      </View>
    </SettingsRow>
  );
}

export default function PairingLockScreen() {
  const { t } = useTranslation();
  const ask = useConfirm();
  const styles = useSettingsStyles(makeStyles);
  const { data, loading, failed, unsupported, error, busy, pinError, actions } = usePairingLock();
  const { lock, ownerName, gap, requests } = data;
  const [pin, setPin] = useState('');
  // The PIN typed a second time: a slip in a field that hides what is typed is otherwise saved.
  const [again, setAgain] = useState('');
  const state = useContentState({ loading, failed, hasContent: lock !== null });
  const refresh = <RefreshControl refreshing={false} onRefresh={() => void actions.refresh()} />;

  if (unsupported) {
    return (
      <SettingsScroll refreshControl={refresh}>
        <SettingsMessage>{t('pairingLock.unsupported')}</SettingsMessage>
      </SettingsScroll>
    );
  }
  if (!lock) {
    return (
      <SettingsScroll refreshControl={refresh}>
        {state === 'loading' ? <InkSpinner label={t('pairingLock.loading')} /> : null}
        {isUnavailable(state) ? <ContentUnavailable state={state} reason={error} onRetry={actions.refresh} /> : null}
      </SettingsScroll>
    );
  }

  const confirmation = pinConfirmation(pin, again, lock.minPinDigits);

  const savePin = async () => {
    if (confirmation !== 'ready') return;
    void selectionTick();
    if (await actions.savePin(pin)) {
      void confirmTick();
      setPin('');
      setAgain('');
    }
  };

  const removePin = async () => {
    const yes = await ask({
      title: t('pairingLock.pinRemoveTitle'),
      message: t('pairingLock.pinRemoveBody'),
      confirmLabel: t('pairingLock.pinRemove'),
      destructive: true,
    });
    if (yes) await actions.removePin();
  };

  const owner = ownerName ?? (lock.ownerProfileId ? t('pairingLock.ownerUnnamed') : t('pairingLock.ownerNone'));
  const changing = busy !== null;

  return (
    <SettingsScroll typing={lock.canChange} refreshControl={refresh}>
      {gap ? (
        <SettingsNotice tone="warning">{gap === 'no_main_member' ? t('pairingLock.gapNoOwner') : t('pairingLock.gapNoPhoneOrPin')}</SettingsNotice>
      ) : null}

      <SettingsGroup footer={lock.canChange ? t('pairingLock.holdsWhile') : `${t('pairingLock.holdsWhile')} ${t('pairingLock.mainMemberOnly')}`}>
        {lock.canChange ? (
          <SwitchRow
            label={t('pairingLock.lockLabel')}
            description={t('pairingLock.lockHint')}
            value={lock.locked}
            disabled={busy === 'lock'}
            onChange={(next) => void actions.setLocked(next)}
          />
        ) : (
          <SettingsRow
            label={t('pairingLock.lockLabel')}
            description={t('pairingLock.lockHint')}
            value={lock.locked ? t('common.on') : t('common.off')}
          />
        )}
        <SettingsRow label={t('pairingLock.owner')} value={owner} />
      </SettingsGroup>

      {lock.canChange ? (
        <SettingsGroup title={t('pairingLock.requestsTitle')}>
          {requests.length === 0 ? <SettingsRow label={t('pairingLock.requestsNone')} /> : null}
          {requests.map((request) => (
            <RequestRow
              key={request.id}
              request={request}
              busy={busy === request.id}
              disabled={changing}
              onAccept={() => void actions.accept(request.id)}
              onDecline={() => void actions.decline(request.id)}
            />
          ))}
        </SettingsGroup>
      ) : null}

      {lock.canChange ? (
        <SettingsGroup title={t('pairingLock.pinTitle')} footer={t('pairingLock.pinFooter')}>
          <SettingsRow
            label={t('pairingLock.pinLabel')}
            value={lock.hasRecoveryPin ? t('pairingLock.pinSet') : t('pairingLock.pinNotSet')}
            error={pinError}
          >
            <View style={styles.pin}>
              <DigitsField
                label={lock.hasRecoveryPin ? t('pairingLock.pinChange') : t('pairingLock.pinNew')}
                value={pin}
                onChange={(typed) => setPin(pinDigits(typed))}
                placeholder={t('pairingLock.pinPlaceholder')}
                disabled={busy === 'pin'}
                secret
              />
              <DigitsField
                label={t('pairingLock.pinAgain')}
                value={again}
                onChange={(typed) => setAgain(pinDigits(typed))}
                placeholder={t('pairingLock.pinAgainPlaceholder')}
                disabled={busy === 'pin' || pin.length === 0}
                secret
                onSubmit={() => void savePin()}
              />
              {confirmation === 'mismatch' ? (
                <Text style={styles.failed} accessibilityLiveRegion="polite">
                  {t('pairingLock.pinMismatch')}
                </Text>
              ) : null}
              <View style={styles.answers}>
                <InkButton
                  variant="primary"
                  size="sm"
                  loading={busy === 'pin'}
                  disabled={changing || confirmation !== 'ready'}
                  onPress={() => void savePin()}
                >
                  {lock.hasRecoveryPin ? t('pairingLock.pinChange') : t('pairingLock.pinNew')}
                </InkButton>
              </View>
            </View>
          </SettingsRow>
          {lock.hasRecoveryPin ? (
            <SettingsRow label={t('pairingLock.pinRemove')} destructive disabled={changing} accessibilityRole="button" onPress={() => void removePin()} />
          ) : null}
        </SettingsGroup>
      ) : null}

      {error ? <Text style={styles.failed}>{error}</Text> : null}
    </SettingsScroll>
  );
}

const makeStyles = (c: SettingsColors, type: SettingsType, _m: SettingsMetrics) => ({
  answers: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: Spacing.sm },
  pin: { gap: Spacing.sm },
  failed: { ...type.note, color: c.danger },
});
