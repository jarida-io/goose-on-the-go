// Reset Pond (issue #161): wipes the Pond for a new owner. Owner-only by way of My Pond's own
// gate -- reaching this screen at all already took the admin card or this phone's kept key.

import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { InkButton, InkEdge, InkFormField, InkInput, InkNotice, InkSpinner, InkText, InkTitle, useInkTheme } from '@jarida/ink/native';

import { AdminLockView } from '@/components/pond/admin-lock';
import { IconTile, SettingsGroup } from '@/components/settings/settings-list';
import { SettingsNotice, SettingsScroll } from '@/components/settings/settings-scroll';
import { useSettingsStyles, type SettingsColors, type SettingsType } from '@/components/settings/settings-theme';
import { Spacing } from '@/constants/spacing';
import type { TranslationKey } from '@/services/i18n';
import { confirm, reject, tap } from '@/services/haptics';
import type { FactoryResetStep } from '@/services/types';
import { usePondReset } from '@/view-models/use-pond-reset';
import { usePondSettings } from '@/view-models/use-pond-settings';

type Step = 'warning' | 'name' | 'lock' | 'resetting' | 'done';

/** What `warningBody` lists, as its own keys so nothing here assembles a translation key at runtime. */
const ERASED_KEYS = [
  'myPond.reset.erases.voices',
  'myPond.reset.erases.memories',
  'myPond.reset.erases.routines',
  'myPond.reset.erases.devices',
  'myPond.reset.erases.wifi',
  'myPond.reset.erases.keys',
] as const;

/** Each step's label, as its own key for the same reason `ERASED_KEYS` is. */
const STEP_LABEL_KEYS: Record<FactoryResetStep, TranslationKey> = {
  exporting: 'myPond.reset.steps.exporting',
  pausing: 'myPond.reset.steps.pausing',
  notifying_household: 'myPond.reset.steps.notifying_household',
  revoking_devices: 'myPond.reset.steps.revoking_devices',
  erasing_data: 'myPond.reset.steps.erasing_data',
  speaking_goodbye: 'myPond.reset.steps.speaking_goodbye',
  reopening_onboarding: 'myPond.reset.steps.reopening_onboarding',
  forgetting_wifi: 'myPond.reset.steps.forgetting_wifi',
};

function WarningStep({
  pondName,
  exporting,
  exportError,
  onExport,
  onContinue,
}: {
  pondName: string;
  exporting: boolean;
  exportError: string | null;
  onExport: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const theme = useInkTheme();
  const styles = useSettingsStyles(makeStyles);
  return (
    <InkEdge radius={theme.radius.lg} contentStyle={styles.card}>
      <View style={styles.heading}>
        <IconTile icon="warn" tile="red" size={44} />
        <View style={styles.headingText}>
          <InkTitle level={3}>{t('myPond.reset.warningTitle')}</InkTitle>
          <InkText size="sm" weight="semibold" tone="secondary">
            {pondName}
          </InkText>
        </View>
      </View>
      <InkText size="md" tone="secondary">
        {t('myPond.reset.warningBody')}
      </InkText>
      <View style={styles.list}>
        {ERASED_KEYS.map((key) => (
          <Text key={key} style={styles.listItem}>
            {t(key)}
          </Text>
        ))}
      </View>
      {exportError ? <InkNotice tone="danger">{exportError}</InkNotice> : null}
      <InkButton variant="quiet" icon="upload" disabled={exporting} onPress={onExport}>
        {exporting ? t('myPond.reset.exporting') : t('myPond.reset.exportRoutines')}
      </InkButton>
      <InkNotice tone="danger">{t('myPond.reset.cannotUndo')}</InkNotice>
      <InkButton variant="danger" icon="trash" block onPress={onContinue}>
        {t('myPond.reset.continue')}
      </InkButton>
    </InkEdge>
  );
}

function NameStep({
  pondName,
  typed,
  onTyped,
  onConfirm,
}: {
  pondName: string;
  typed: string;
  onTyped: (next: string) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const theme = useInkTheme();
  const styles = useSettingsStyles(makeStyles);
  const matches = pondName.trim() !== '' && typed === pondName;
  const mismatch = typed.length > 0 && !matches;
  return (
    <InkEdge radius={theme.radius.lg} contentStyle={styles.card}>
      <InkTitle level={3}>{t('myPond.reset.typeNameTitle')}</InkTitle>
      <InkFormField label={t('myPond.reset.typeNameLabel', { name: pondName })} hint={mismatch ? t('myPond.reset.nameMismatch') : undefined}>
        <InkInput
          label={t('myPond.reset.typeNameLabel', { name: pondName })}
          value={typed}
          onChange={onTyped}
          placeholder={t('myPond.reset.typeNamePlaceholder')}
        />
      </InkFormField>
      <InkButton variant="danger" icon="trash" block disabled={!matches} onPress={onConfirm}>
        {t('myPond.reset.eraseEverything')}
      </InkButton>
    </InkEdge>
  );
}

function LockStep({
  usesKeptKey,
  confirming,
  onConfirm,
}: {
  usesKeptKey: boolean;
  confirming: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const theme = useInkTheme();
  const styles = useSettingsStyles(makeStyles);
  return (
    <InkEdge radius={theme.radius.lg} contentStyle={styles.card}>
      <InkTitle level={3}>{t('myPond.reset.confirmLockTitle')}</InkTitle>
      <InkText size="md" tone="secondary">
        {t('myPond.reset.confirmLockBody')}
      </InkText>
      <InkButton variant="danger" icon={usesKeptKey ? 'face' : 'key'} block disabled={confirming} onPress={onConfirm}>
        {confirming ? t('myPond.lock.unlocking') : usesKeptKey ? t('myPond.reset.confirmLockButton') : t('myPond.reset.confirmPassword')}
      </InkButton>
    </InkEdge>
  );
}

export default function PondResetScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const styles = useSettingsStyles(makeStyles);
  const { gate, exporting, exportError, resetError, resetStep, resetStepsCompleted, resetTotalSteps, actions } = usePondReset();
  const { settings } = usePondSettings();
  const pondName = settings?.home_name ?? '';

  const [step, setStep] = useState<Step>('warning');
  const [typed, setTyped] = useState('');
  const [confirmingLock, setConfirmingLock] = useState(false);

  if (gate.phase !== 'unlocked' && gate.phase !== 'checking') {
    return (
      <SettingsScroll typing>
        <AdminLockView onRetry={() => void actions.refresh()} />
      </SettingsScroll>
    );
  }

  const exportRoutines = async () => {
    void tap();
    if (await actions.exportRoutines()) void confirm();
  };

  const goToLock = async () => {
    void tap();
    if (!gate.kept) {
      setStep('resetting');
      if (await actions.reset(typed)) {
        void confirm();
        setStep('done');
      } else {
        void reject();
        setStep('name');
      }
      return;
    }
    setStep('lock');
  };

  const confirmLock = async () => {
    setConfirmingLock(true);
    try {
      const ok = await actions.confirmWithKeptKey();
      if (!ok) return;
      setStep('resetting');
      if (await actions.reset(typed)) {
        void confirm();
        setStep('done');
      } else {
        void reject();
        setStep('name');
      }
    } finally {
      setConfirmingLock(false);
    }
  };

  return (
    <SettingsScroll>
      {resetError ? <SettingsNotice tone="danger">{resetError}</SettingsNotice> : null}

      {step === 'warning' ? (
        <WarningStep pondName={pondName} exporting={exporting} exportError={exportError} onExport={() => void exportRoutines()} onContinue={() => setStep('name')} />
      ) : null}

      {step === 'name' ? (
        <NameStep pondName={pondName} typed={typed} onTyped={setTyped} onConfirm={() => void goToLock()} />
      ) : null}

      {step === 'lock' ? <LockStep usesKeptKey={gate.kept} confirming={confirmingLock} onConfirm={() => void confirmLock()} /> : null}

      {step === 'resetting' ? (
        <View style={styles.centre}>
          <InkSpinner label={t(resetStep ? STEP_LABEL_KEYS[resetStep] : 'myPond.reset.resetting')} />
          {resetStepsCompleted > 0 ? (
            <InkText size="sm" tone="secondary">
              {t('myPond.reset.stepProgress', { completed: resetStepsCompleted, total: resetTotalSteps })}
            </InkText>
          ) : null}
        </View>
      ) : null}

      {step === 'done' ? (
        <SettingsGroup>
          <View style={styles.done}>
            <IconTile icon="check" tile="green" size={56} />
            <InkTitle level={2}>{t('myPond.reset.successTitle')}</InkTitle>
            <InkText size="md" tone="secondary">
              {t('myPond.reset.successBody')}
            </InkText>
            <InkButton variant="primary" block onPress={() => router.back()}>
              {t('myPond.reset.back')}
            </InkButton>
          </View>
        </SettingsGroup>
      ) : null}
    </SettingsScroll>
  );
}

const makeStyles = (c: SettingsColors, type: SettingsType) => ({
  card: { gap: Spacing.md, padding: Spacing.lg },
  heading: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: Spacing.md },
  headingText: { flex: 1, gap: 2 },
  list: { gap: Spacing.xs, paddingLeft: Spacing.sm },
  listItem: { ...type.value, color: c.text },
  centre: { alignItems: 'center' as const, paddingVertical: Spacing['2xl'], gap: Spacing.sm },
  done: { alignItems: 'center' as const, gap: Spacing.md, padding: Spacing.xl },
});
