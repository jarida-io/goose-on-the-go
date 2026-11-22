/**
 * Security & Pairing Lock: passcode-protected pairing lock, recovery passcode flow
 * (Enter Passcode -> Forgot Passcode -> Enter New Passcode -> Confirm New Passcode),
 * and pending phone pairing requests.
 */

import React, { useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkButton, InkInput, InkNotice, InkSheet, InkSpinner, InkText } from '@/components/ui/ink';
import { api } from '@/services/api-client';

import { PasscodePad } from '@/components/setup/passcode-pad';
import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { useAgo } from '@/components/goose/hub-parts';
import { SwitchRow } from '@/components/settings/setting-controls';
import { SettingsGroup, SettingsMessage, SettingsRow } from '@/components/settings/settings-list';
import { SettingsNotice, SettingsScroll } from '@/components/settings/settings-scroll';
import { useSettingsStyles, type SettingsColors, type SettingsMetrics, type SettingsType } from '@/components/settings/settings-theme';
import { Spacing } from '@/constants/spacing';
import { isUnavailable } from '@/models/content-state';
import { isRecoveryPin, type PairingRequest } from '@/models/pairing-lock';
import { useConfirm } from '@/providers/confirm-provider';
import { confirm as confirmTick } from '@/services/haptics';
import { useContentState } from '@/view-models/use-content-state';
import { usePairingLock } from '@/view-models/use-pairing-lock';

type PasscodeStep = 'enter_current' | 'enter_admin_card' | 'enter_new' | 'confirm_new';

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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [step, setStep] = useState<PasscodeStep>('enter_new');
  const [digits, setDigits] = useState('');
  const [draftPin, setDraftPin] = useState('');
  const [adminCard, setAdminCard] = useState('');
  const [recovering, setRecovering] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
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

  const openPasscodeFlow = () => {
    setDigits('');
    setDraftPin('');
    setAdminCard('');
    setLocalError(null);
    setStep(lock.hasRecoveryPin ? 'enter_current' : 'enter_new');
    setSheetOpen(true);
  };

  const handlePasscodeSubmit = async (code: string) => {
    if (!isRecoveryPin(code, lock.minPinDigits)) {
      setLocalError(`Enter at least ${lock.minPinDigits} digits.`);
      return;
    }
    setLocalError(null);
    if (step === 'enter_current') {
      setDigits('');
      setStep('enter_new');
      return;
    }
    if (step === 'enter_new') {
      setDraftPin(code);
      setDigits('');
      setStep('confirm_new');
      return;
    }
    if (code !== draftPin) {
      setLocalError(t('pairingLock.pinMismatch'));
      setDigits('');
      return;
    }
    if (adminCard.trim()) {
      setRecovering(true);
      try {
        await api.recoverPasscodeWithAdminCard(adminCard.trim(), code);
        void confirmTick();
        setSheetOpen(false);
        setDigits('');
        setDraftPin('');
        setAdminCard('');
        await actions.refresh();
      } catch {
        setLocalError('Admin card was rejected. Check your giap.sh admin card and try again.');
      } finally {
        setRecovering(false);
      }
      return;
    }
    if (await actions.savePin(code)) {
      void confirmTick();
      setSheetOpen(false);
      setDigits('');
      setDraftPin('');
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

  const stepTitle =
    step === 'enter_current'
      ? 'Enter Passcode'
      : step === 'enter_new'
        ? 'Enter New Passcode'
        : 'Confirm New Passcode';

  return (
    <>
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
          <SettingsGroup title="Passcode" footer={t('pairingLock.pinFooter')}>
            <SettingsRow
              label={lock.hasRecoveryPin ? 'Change Passcode' : 'Set Passcode'}
              value={lock.hasRecoveryPin ? t('pairingLock.pinSet') : t('pairingLock.pinNotSet')}
              error={pinError}
              accessory="next"
              disabled={changing}
              onPress={openPasscodeFlow}
            />
            {lock.hasRecoveryPin ? (
              <SettingsRow label={t('pairingLock.pinRemove')} destructive disabled={changing} accessibilityRole="button" onPress={() => void removePin()} />
            ) : null}
          </SettingsGroup>
        ) : null}

        {error ? <Text style={styles.failed}>{error}</Text> : null}
      </SettingsScroll>

      <InkSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Security Passcode" scroll>
        {step === 'enter_admin_card' ? (
          <View style={{ gap: Spacing.md, paddingBottom: Spacing.xl }}>
            <InkText size="sm" tone="secondary">
              Enter your giap.sh admin card to reset your forgotten passcode.
            </InkText>
            <InkInput
              label="Admin card"
              value={adminCard}
              onChange={(v) => {
                setLocalError(null);
                setAdminCard(v);
              }}
              placeholder="Paste or type your giap.sh admin card"
            />
            {localError ? <InkNotice tone="danger">{localError}</InkNotice> : null}
            <InkButton
              variant="primary"
              block
              disabled={!adminCard.trim()}
              onPress={() => {
                setLocalError(null);
                setStep('enter_new');
              }}
            >
              Continue
            </InkButton>
          </View>
        ) : (
          <PasscodePad
            title={stepTitle}
            subtitle={`Use at least ${lock.minPinDigits} digits for pairing & recovery`}
            length={lock.minPinDigits}
            value={digits}
            error={localError ?? pinError}
            busy={busy === 'pin' || recovering}
            forgotLabel={step === 'enter_current' ? 'Forgot Passcode?' : undefined}
            onForgot={() => {
              setDigits('');
              setLocalError(null);
              setStep('enter_admin_card');
            }}
            onChange={(next) => {
              setLocalError(null);
              setDigits(next);
            }}
            onSubmit={(code) => void handlePasscodeSubmit(code)}
          />
        )}
      </InkSheet>
    </>
  );
}

const makeStyles = (c: SettingsColors, type: SettingsType, _m: SettingsMetrics) => ({
  answers: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: Spacing.sm },
  failed: { ...type.note, color: c.danger },
});
