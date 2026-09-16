/**
 * CreateAutomationSheet — a new sensor-triggered rule, with one action.
 *
 * The Pond takes several actions per rule; one is what this form offers, which
 * covers "when X, do Y" and keeps the form one screen long. The checks the
 * Pond would answer with a 400 — no action, a condition with an operator but
 * no value — run here first.
 *
 * The form only exists while the sheet is open, so the device list it reads
 * is not polled behind a closed sheet, and closing it clears what was typed.
 */

import React, { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  InkButton,
  InkInput,
  InkNotice,
  InkRadioGroup,
  InkSegmented,
  InkSelect,
  InkSheet,
  InkTextArea,
} from '@jarida/ink/native';

import { sourceKey } from '@/components/patterns/automation-card';
import { confirm, reject } from '@/services/haptics';
import type { RuleRequest, TriggerAction, TriggerCondition, TriggerSource } from '@/services/types';
import { supports, useDevices } from '@/view-models/use-devices';
import { Spacing } from '@/constants/spacing';

type Op = NonNullable<TriggerCondition['op']>;

export interface CreateAutomationSheetProps {
  open: boolean;
  onClose: () => void;
  /** Resolves to why it was refused, or null once it exists. */
  onCreate: (req: RuleRequest) => Promise<string | null>;
}

export function CreateAutomationSheet({ open, onClose, onCreate }: CreateAutomationSheetProps) {
  const { t } = useTranslation();
  return (
    <InkSheet open={open} onClose={onClose} title={t('schedule.form.automationTitle')}>
      {open ? <AutomationForm onClose={onClose} onCreate={onCreate} /> : null}
    </InkSheet>
  );
}

const SOURCES: TriggerSource['kind'][] = ['sensor', 'camera', 'device'];

function AutomationForm({ onClose, onCreate }: Omit<CreateAutomationSheetProps, 'open'>) {
  const { t } = useTranslation();
  const { data } = useDevices();
  const switchable = data.devices.filter((d) => supports(d, 'power'));

  const [name, setName] = useState('');
  const [sourceKind, setSourceKind] = useState<TriggerSource['kind']>('sensor');
  // '' is "any": the Pond matches every device or signal when the field is left out.
  const [deviceId, setDeviceId] = useState('');
  const [signal, setSignal] = useState('');
  const [op, setOp] = useState<Op | ''>('');
  const [value, setValue] = useState('');
  const [cooldown, setCooldown] = useState('60');
  const [actionType, setActionType] = useState<TriggerAction['type']>('agent_prompt');
  const [prompt, setPrompt] = useState('');
  const [targetId, setTargetId] = useState('');
  const [turnOn, setTurnOn] = useState<'on' | 'off'>('on');
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyBody, setNotifyBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const action = (): TriggerAction | null => {
    switch (actionType) {
      case 'agent_prompt':
        return prompt.trim() ? { type: 'agent_prompt', prompt: prompt.trim() } : null;
      case 'device_power':
        return targetId ? { type: 'device_power', device_id: targetId, on: turnOn === 'on' } : null;
      case 'notify':
        return notifyTitle.trim() ? { type: 'notify', title: notifyTitle.trim(), body: notifyBody.trim() } : null;
    }
  };

  /** The request, or the sentence that says what is missing. */
  const build = (): RuleRequest | string => {
    if (!name.trim()) return t('schedule.errors.nameRequired');
    const reading = Number(value);
    if (op && (!value.trim() || !Number.isFinite(reading))) return t('schedule.errors.valueRequired');
    const wait = Number(cooldown);
    if (!/^\d+$/.test(cooldown.trim()) || !Number.isFinite(wait)) return t('schedule.errors.cooldownInvalid');
    const act = action();
    if (!act) return t('schedule.errors.actionIncomplete');
    return {
      name: name.trim(),
      source: {
        kind: sourceKind,
        ...(deviceId ? { device_id: deviceId } : {}),
        ...(signal.trim() ? { signal: signal.trim() } : {}),
      },
      ...(op ? { condition: { op, value: reading } } : {}),
      actions: [act],
      cooldown_secs: wait,
    };
  };

  const submit = async () => {
    const req = build();
    if (typeof req === 'string') {
      void reject();
      setError(req);
      return;
    }
    setError(null);
    setSubmitting(true);
    const refused = await onCreate(req);
    setSubmitting(false);
    if (refused) {
      void reject();
      setError(refused);
      return;
    }
    void confirm();
    onClose();
  };

  const devices = [
    { value: '', label: t('schedule.form.anyDevice') },
    ...data.devices.map((d) => ({ value: d.id, label: d.name })),
  ];

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <InkInput
        label={t('schedule.form.name')}
        placeholder={t('schedule.form.automationPlaceholder')}
        value={name}
        onChange={setName}
      />

      <InkSegmented
        label={t('schedule.form.source')}
        value={sourceKind}
        options={SOURCES.map((kind) => ({ value: kind, label: t(sourceKey(kind)) }))}
        onChange={setSourceKind}
      />

      <InkSelect label={t('schedule.form.device')} value={deviceId} options={devices} onChange={setDeviceId} />

      <InkInput
        label={t('schedule.form.signal')}
        placeholder={t('schedule.form.signalPlaceholder')}
        value={signal}
        onChange={setSignal}
      />

      <InkSelect<Op | ''>
        label={t('schedule.form.condition')}
        value={op}
        options={[
          { value: '', label: t('schedule.form.noCondition') },
          { value: 'gt', label: t('schedule.form.opGt') },
          { value: 'gte', label: t('schedule.form.opGte') },
          { value: 'lt', label: t('schedule.form.opLt') },
          { value: 'lte', label: t('schedule.form.opLte') },
          { value: 'eq', label: t('schedule.form.opEq') },
        ]}
        onChange={setOp}
      />
      {op ? <InkInput label={t('schedule.form.value')} type="number" value={value} onChange={setValue} /> : null}

      <InkInput label={t('schedule.form.cooldown')} type="number" value={cooldown} onChange={setCooldown} />

      <InkRadioGroup<TriggerAction['type']>
        label={t('schedule.form.action')}
        value={actionType}
        options={[
          { value: 'agent_prompt', label: t('schedule.form.actionPrompt') },
          { value: 'device_power', label: t('schedule.form.actionPower') },
          { value: 'notify', label: t('schedule.form.actionNotify') },
        ]}
        onChange={setActionType}
      />

      {actionType === 'agent_prompt' ? (
        <InkTextArea
          label={t('schedule.form.prompt')}
          placeholder={t('schedule.form.promptPlaceholder')}
          value={prompt}
          onChange={setPrompt}
          rows={3}
          maxRows={6}
        />
      ) : null}

      {actionType === 'device_power' ? (
        <>
          <InkSelect
            label={t('schedule.form.targetDevice')}
            value={targetId}
            options={[
              { value: '', label: t('schedule.form.chooseDevice'), disabled: true },
              ...switchable.map((d) => ({ value: d.id, label: d.name })),
            ]}
            onChange={setTargetId}
          />
          <InkSegmented
            label={t('schedule.form.targetDevice')}
            value={turnOn}
            options={[
              { value: 'on', label: t('schedule.form.turnOn') },
              { value: 'off', label: t('schedule.form.turnOff') },
            ]}
            onChange={setTurnOn}
          />
        </>
      ) : null}

      {actionType === 'notify' ? (
        <>
          <InkInput label={t('schedule.form.notifyTitle')} value={notifyTitle} onChange={setNotifyTitle} />
          <InkInput label={t('schedule.form.notifyBody')} value={notifyBody} onChange={setNotifyBody} />
        </>
      ) : null}

      {error ? <InkNotice tone="danger">{error}</InkNotice> : null}

      <InkButton variant="primary" block disabled={submitting} onPress={submit}>
        {t('schedule.form.create')}
      </InkButton>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingBottom: Spacing['2xl'] },
});
