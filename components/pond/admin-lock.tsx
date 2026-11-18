// My Pond while it is not open: this phone's kept key, the administrator card's form, or why there is
// nothing to unlock. The tab and every screen under it draw the same one, so a lock looks the same anywhere.

import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkButton, InkEdge, InkEyebrow, InkNotice, InkSpinner, InkText, InkTitle, inkText, useInkTheme } from '@/components/ui/ink';

import { PasscodePad } from '@/components/setup/passcode-pad';
import { LabelledSwitch } from '@/components/patterns/labelled-switch';
import { IconTile, SettingsGroup } from '@/components/settings/settings-list';
import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import type { IconName } from '@/constants/icons';
import { Spacing } from '@/constants/spacing';
import { FontFamily } from '@/constants/typography';
import { ADMIN_IDLE_MINUTES, ADMIN_PASSWORD_LENGTH } from '@/models/pond-admin';
import { confirm, reject, tap } from '@/services/haptics';
import { useAdminGate, useAdminUnlock, type UseAdminUnlock } from '@/view-models/use-admin-gate';
import { usePairingLock } from '@/view-models/use-pairing-lock';

/** The commands that make a card and print it again, run on the Pond itself; commands, so not translated. */
// eslint-disable-next-line i18next/no-literal-string -- a command typed on the Pond, not copy
const ADMIN_CARD_COMMAND = 'bash scripts/giap.sh admin-card';
// eslint-disable-next-line i18next/no-literal-string -- a command typed on the Pond, not copy
const SHOW_CARD_COMMAND = 'giap.sh admin-card show';

function CardField({
  value,
  onChange,
  invalid,
  disabled,
  onSubmit,
}: {
  value: string;
  onChange: (next: string) => void;
  invalid: boolean;
  disabled: boolean;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const theme = useInkTheme();
  const [shown, setShown] = useState(false);
  return (
    <View
      style={[
        styles.frame,
        {
          minHeight: theme.touch.tapMin + theme.space[2],
          paddingLeft: theme.space[3],
          paddingRight: theme.space[1],
          borderWidth: theme.edge.borderWidth,
          borderColor: invalid ? theme.color.danger : theme.color.accentLine,
          borderRadius: theme.radius.md,
          backgroundColor: theme.color.surface,
        },
      ]}
    >
      <TextInput
        value={value}
        onChangeText={onChange}
        // Typed off the card, so the hint is the card's own shape.
        placeholder={t('myPond.lock.placeholder')}
        placeholderTextColor={theme.color.textTertiary}
        secureTextEntry={!shown}
        autoCapitalize="characters"
        autoCorrect={false}
        spellCheck={false}
        // The card is the proof; nothing asks the phone to keep a copy of it.
        autoComplete="off"
        textContentType="none"
        importantForAutofill="no"
        editable={!disabled}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        accessibilityLabel={t('myPond.lock.fieldLabel')}
        style={[inkText(theme, { size: 'md', weight: theme.weight.semibold }).style, styles.code, { paddingVertical: theme.space[2] }]}
      />
      <GPressable
        onPress={() => setShown((s) => !s)}
        accessibilityRole="button"
        accessibilityLabel={shown ? t('myPond.lock.hide') : t('myPond.lock.show')}
        style={styles.show}
      >
        <GIcon name={shown ? 'eye-off' : 'eye'} size={20} color={theme.color.textSecondary} />
      </GPressable>
    </View>
  );
}

/** The countdown, or why the last unlock did not work: one notice, under whichever way in is showing. */
function UnlockNotice({ vm }: { vm: UseAdminUnlock }) {
  const { t } = useTranslation();
  if (vm.coolingSecs > 0) return <InkNotice tone="warning">{t('myPond.lock.wait', { count: vm.coolingSecs })}</InkNotice>;
  return vm.error ? <InkNotice tone="danger">{vm.error}</InkNotice> : null;
}

/** A kept key: the phone's Face ID or fingerprint opens My Pond, with the card a tap away when there is one. */
function KeyCard({ vm, onUseCard }: { vm: UseAdminUnlock; onUseCard: (() => void) | null }) {
  const { t } = useTranslation();
  const theme = useInkTheme();

  const open = async () => {
    void tap();
    const ok = await vm.unlockWithKept();
    if (ok) void confirm();
  };

  return (
    <InkEdge radius={theme.radius.lg} contentStyle={[styles.card, { padding: theme.space[5] }]}>
      <View style={styles.heading}>
        <IconTile icon="face" tile="purple" size={44} />
        <View style={styles.headingText}>
          <InkTitle level={3}>{t('myPond.key.title')}</InkTitle>
          <InkText size="sm" weight="semibold" tone="secondary">
            {t('myPond.lock.locked')}
          </InkText>
        </View>
      </View>
      <InkText size="md" tone="secondary">
        {t('myPond.key.body')}
      </InkText>
      <UnlockNotice vm={vm} />
      <InkButton variant="primary" icon="face" block disabled={vm.unlocking || vm.coolingSecs > 0} onPress={() => void open()}>
        {vm.unlocking ? t('myPond.lock.unlocking') : t('myPond.key.unlock')}
      </InkButton>
      {onUseCard ? (
        <InkButton variant="quiet" icon="key" block disabled={vm.unlocking} onPress={onUseCard}>
          {t('myPond.key.useCard')}
        </InkButton>
      ) : null}
    </InkEdge>
  );
}

function CardForm({ vm }: { vm: UseAdminUnlock }) {
  const { t } = useTranslation();
  const theme = useInkTheme();

  const mistake =
    vm.problem === 'not_on_card' ? t('myPond.lock.notOnCard') : vm.problem === 'long' ? t('myPond.lock.tooLong') : null;
  const cooling = vm.coolingSecs > 0;
  const small = inkText(theme, { size: 'sm', color: theme.color.textSecondary }).style;

  const submit = async () => {
    void tap();
    const ok = await vm.unlock();
    void (ok ? confirm() : reject());
  };

  return (
    <InkEdge radius={theme.radius.lg} contentStyle={[styles.card, { padding: theme.space[5] }]}>
      <View style={styles.heading}>
        <IconTile icon="key" tile="purple" size={44} />
        <View style={styles.headingText}>
          <InkTitle level={3}>{t('myPond.lock.title')}</InkTitle>
          <InkText size="sm" weight="semibold" tone="secondary">
            {t('myPond.lock.locked')}
          </InkText>
        </View>
      </View>
      <InkText size="md" tone="secondary">
        {t('myPond.lock.intro')}
      </InkText>

      <View style={styles.field}>
        <InkEyebrow>{t('myPond.lock.cardTitle')}</InkEyebrow>
        <CardField
          value={vm.password}
          onChange={vm.setPassword}
          invalid={mistake !== null}
          disabled={vm.unlocking}
          onSubmit={() => void submit()}
        />
        <View style={styles.under} accessibilityLiveRegion="polite">
          <Text style={[small, styles.underHint, mistake ? { color: theme.color.dangerFg } : null]}>
            {mistake ?? t('myPond.lock.cardHint')}
          </Text>
          <Text style={[small, styles.count]}>
            {t('myPond.lock.typed', { typed: Math.min(vm.typed, ADMIN_PASSWORD_LENGTH), total: ADMIN_PASSWORD_LENGTH })}
          </Text>
        </View>
      </View>

      {vm.canKeep ? (
        <View style={styles.remember}>
          <LabelledSwitch label={t('myPond.key.remember')} checked={vm.remember} onChange={vm.setRemember} />
        </View>
      ) : vm.keysAwaitPond ? (
        <Text style={small}>{t('myPond.key.awaitsPond')}</Text>
      ) : null}

      <UnlockNotice vm={vm} />
      <InkButton
        variant="primary"
        icon="unlock"
        block
        disabled={vm.problem !== null || vm.unlocking || cooling}
        onPress={() => void submit()}
      >
        {vm.unlocking ? t('myPond.lock.unlocking') : t('myPond.lock.unlock')}
      </InkButton>
    </InkEdge>
  );
}

function PasscodeUnlockForm({ vm, minDigits }: { vm: UseAdminUnlock; minDigits: number }) {
  const { t } = useTranslation();
  const [digits, setDigits] = useState('');
  const cooling = vm.coolingSecs > 0;
  const submit = async (code: string) => {
    void tap();
    const ok = await vm.unlockWithPin(code);
    void (ok ? confirm() : reject());
    if (!ok) setDigits('');
  };
  return (
    <InkEdge state="rest" contentStyle={styles.card}>
      <PasscodePad
        title="Enter Passcode"
        subtitle="Use your Security passcode to manage this Pond"
        length={minDigits}
        value={digits}
        error={vm.error}
        busy={vm.unlocking || cooling}
        autoSubmit={false}
        submitLabel={vm.unlocking ? t('myPond.lock.unlocking') : t('myPond.lock.unlock')}
        onChange={setDigits}
        onSubmit={(code) => void submit(code)}
      />
      {vm.canKeep ? (
        <View style={styles.remember}>
          <LabelledSwitch label={t('myPond.key.remember')} checked={vm.remember} onChange={vm.setRemember} />
        </View>
      ) : null}
    </InkEdge>
  );
}

/** The way in: biometrics if kept, else Security passcode when set, else the card fallback. */
function LockForm() {
  const { t } = useTranslation();
  const theme = useInkTheme();
  const { gate } = useAdminGate();
  const vm = useAdminUnlock();
  const pairingLock = usePairingLock();
  const hasPasscode = pairingLock.data.lock?.hasRecoveryPin === true;
  const minPinDigits = pairingLock.data.lock?.minPinDigits ?? 6;
  const [cardChosen, setCardChosen] = useState(false);
  const noCard = gate.phase === 'no_card';
  const mono = inkText(theme, { role: 'mono', size: 'sm', color: theme.color.text }).style;
  const chip = { backgroundColor: theme.color.chrome, borderRadius: theme.radius.sm };

  let body: React.ReactNode;
  if (vm.kept && !cardChosen) {
    body = <KeyCard vm={vm} onUseCard={noCard && !hasPasscode ? null : () => setCardChosen(true)} />;
  } else if (hasPasscode) {
    body = <PasscodeUnlockForm vm={vm} minDigits={minPinDigits} />;
  } else if (noCard) {
    body = (
      <>
        <UnlockNotice vm={vm} />
        <SettingsGroup>
          <View style={styles.missing}>
            <InkText size="md">{t('myPond.lock.noCard')}</InkText>
            <InkText size="sm" tone="secondary">
              {t('myPond.lock.noCardHow')}
            </InkText>
            <Text selectable style={[mono, styles.command, chip]}>
              {ADMIN_CARD_COMMAND}
            </Text>
          </View>
        </SettingsGroup>
      </>
    );
  } else {
    body = <CardForm vm={vm} />;
  }

  return (
    <View style={styles.form}>
      {gate.restarting ? <InkNotice tone="neutral">{t('myPond.lock.restarting')}</InkNotice> : null}
      {body}
    </View>
  );
}

function NoteRow({ icon, children }: { icon: IconName; children: string }) {
  const theme = useInkTheme();
  return (
    <View style={[styles.note, { paddingHorizontal: theme.space[4], paddingVertical: theme.space[3] }]}>
      <GIcon name={icon} size={20} color={theme.color.textSecondary} />
      <InkText size="md" tone="secondary" style={styles.noteText}>
        {children}
      </InkText>
    </View>
  );
}

/** Everything My Pond shows while it is not open. `onRetry` reads the status again. */
export function AdminLockView({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  const theme = useInkTheme();
  const { gate } = useAdminGate();
  const mono = inkText(theme, { role: 'mono', size: 'sm', color: theme.color.text }).style;
  const chip = { backgroundColor: theme.color.chrome, borderRadius: theme.radius.sm };

  switch (gate.phase) {
    case 'checking':
    case 'unlocked':
      return (
        <View style={styles.centre}>
          <InkSpinner label={t('myPond.lock.checking')} />
        </View>
      );
    case 'unreachable':
      return (
        <View style={styles.form}>
          <InkNotice tone="neutral">{t('myPond.lock.unreachable')}</InkNotice>
          <InkButton variant="quiet" icon="refresh" onPress={onRetry}>
            {t('common.retry')}
          </InkButton>
        </View>
      );
    case 'unsupported':
      return <InkNotice tone="neutral">{t('myPond.lock.unsupported')}</InkNotice>;
    case 'members_only':
      return <InkNotice tone="neutral">{t('myPond.lock.membersOnly')}</InkNotice>;
    case 'no_card':
      // A Pond with no card still opens to a key it gave this phone. The form keeps its place in the
      // tree either way, so a refused key's reason stays on screen once the key is forgotten.
      return (
        <>
          <LockForm />
          {gate.kept ? (
            <SettingsGroup>
              <NoteRow icon="bell">{t('myPond.lock.tellsHousehold')}</NoteRow>
              <NoteRow icon="schedule">{t('myPond.lock.idle', { count: gate.status?.idle_minutes ?? ADMIN_IDLE_MINUTES })}</NoteRow>
            </SettingsGroup>
          ) : null}
        </>
      );
    case 'locked':
      return (
        <>
          <LockForm />
          <SettingsGroup>
            <NoteRow icon="bell">{t('myPond.lock.tellsHousehold')}</NoteRow>
            <NoteRow icon="schedule">{t('myPond.lock.idle', { count: gate.status?.idle_minutes ?? ADMIN_IDLE_MINUTES })}</NoteRow>
          </SettingsGroup>
          <Text style={inkText(theme, { size: 'sm', leading: 'loose', color: theme.color.textSecondary }).style}>
            {t('myPond.lock.lostCard')}{' '}
            <Text selectable style={[mono, chip]}>
              {` ${SHOW_CARD_COMMAND} `}
            </Text>{' '}
            {t('myPond.lock.lostCardAfter')}
          </Text>
        </>
      );
  }
}

const styles = StyleSheet.create({
  form: { gap: Spacing.md, marginBottom: Spacing.xl },
  card: { gap: Spacing.md },
  heading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  headingText: { flex: 1, gap: 2 },
  field: { gap: Spacing.sm },
  frame: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  // Copied off a printed card group by group, so every character keeps a fixed-width column.
  code: { flex: 1, minWidth: 0, fontFamily: FontFamily.mono, letterSpacing: 1.5 },
  show: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  under: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  underHint: { flex: 1 },
  count: { fontVariant: ['tabular-nums'] },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  noteText: { flex: 1 },
  centre: { alignItems: 'center', paddingVertical: Spacing['2xl'] },
  missing: { gap: Spacing.sm, padding: Spacing.lg },
  remember: { minHeight: 44, justifyContent: 'center' },
  command: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, overflow: 'hidden' },
});
