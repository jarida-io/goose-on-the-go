/**
 * CreateAutomationSheet — modal form to create a sensor-triggered rule.
 * v1 supports exactly one action per rule from this UI (backend supports more).
 */

import React, { useState } from 'react';
import { Modal, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GInput } from '@/components/ui/g-input';
import { GTextArea } from '@/components/ui/g-text-area';
import { GRadioGroup } from '@/components/ui/g-radio-group';
import { GSelect } from '@/components/ui/g-select';
import { GButton } from '@/components/ui/g-button';
import { useDevices } from '@/view-models/use-devices';
import type { RuleInput } from '@/models/rule';
import type { TriggerAction, TriggerSource } from '@/models/trigger';
import { Brand, Grey, Semantic } from '@/constants/colors';
import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export interface CreateAutomationSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: RuleInput) => Promise<unknown>;
}

const SOURCE_KIND_OPTIONS = [
  { key: 'sensor', label: 'Sensor' },
  { key: 'camera', label: 'Camera' },
  { key: 'device', label: 'Device' },
];

const OP_OPTIONS = [
  { key: 'gt', label: 'greater than (>)' },
  { key: 'gte', label: 'at least (≥)' },
  { key: 'lt', label: 'less than (<)' },
  { key: 'lte', label: 'at most (≤)' },
  { key: 'eq', label: 'equal to (=)' },
];

export function CreateAutomationSheet({ visible, onClose, onSubmit }: CreateAutomationSheetProps) {
  const { devices } = useDevices();
  const deviceOptions = devices.map((d) => ({ key: d.id, label: d.name }));

  const [name, setName] = useState('');
  const [sourceKind, setSourceKind] = useState<TriggerSource['kind']>('sensor');
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [signal, setSignal] = useState('');
  const [op, setOp] = useState<string | undefined>(undefined);
  const [value, setValue] = useState('');
  const [cooldownSecs, setCooldownSecs] = useState('60');
  const [actionType, setActionType] = useState<TriggerAction['type']>('agent_prompt');
  const [actionPrompt, setActionPrompt] = useState('');
  const [actionDeviceId, setActionDeviceId] = useState<string | undefined>(undefined);
  const [actionOn, setActionOn] = useState<'on' | 'off'>('on');
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyBody, setNotifyBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setSourceKind('sensor');
    setDeviceId(undefined);
    setSignal('');
    setOp(undefined);
    setValue('');
    setCooldownSecs('60');
    setActionType('agent_prompt');
    setActionPrompt('');
    setActionDeviceId(undefined);
    setActionOn('on');
    setNotifyTitle('');
    setNotifyBody('');
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const buildAction = (): TriggerAction | null => {
    if (actionType === 'agent_prompt') {
      if (!actionPrompt.trim()) return null;
      return { type: 'agent_prompt', prompt: actionPrompt.trim() };
    }
    if (actionType === 'device_power') {
      if (!actionDeviceId) return null;
      return { type: 'device_power', device_id: actionDeviceId, on: actionOn === 'on' };
    }
    if (!notifyTitle.trim()) return null;
    return { type: 'notify', title: notifyTitle.trim(), body: notifyBody.trim() };
  };

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) return setError('Name is required.');

    const action = buildAction();
    if (!action) return setError('The action is missing required fields.');

    const cooldown = Number(cooldownSecs);
    if (!Number.isFinite(cooldown) || cooldown < 0) return setError('Cooldown must be a non-negative number.');

    const source: TriggerSource = { kind: sourceKind, device_id: deviceId, signal: signal.trim() || undefined };
    const condition =
      op && value.trim() ? { op: op as NonNullable<RuleInput['condition']>['op'], value: Number(value) } : undefined;

    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), source, condition, actions: [action], cooldown_secs: cooldown });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create automation.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={styles.modal}>
        <View style={styles.header}>
          <Text style={styles.title}>New Automation</Text>
          <GButton variant="ghost" size="sm" onPress={handleClose}>Cancel</GButton>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <GInput label="Name" placeholder="Notify on high temp" value={name} onChangeText={setName} />

          <GSelect
            label="Signal type"
            options={SOURCE_KIND_OPTIONS}
            selectedKey={sourceKind}
            onSelectionChange={(k) => setSourceKind(k as TriggerSource['kind'])}
          />

          <GSelect
            label="Device"
            options={deviceOptions}
            selectedKey={deviceId}
            onSelectionChange={setDeviceId}
            placeholder="Choose a device..."
          />

          <GInput label="Signal (optional)" placeholder="temperature" value={signal} onChangeText={setSignal} />

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <GSelect
                label="Condition"
                options={OP_OPTIONS}
                selectedKey={op}
                onSelectionChange={setOp}
                placeholder="No condition"
              />
            </View>
            <View style={styles.rowItem}>
              <GInput
                label="Value"
                placeholder="80"
                value={value}
                onChangeText={setValue}
                keyboardType="numeric"
              />
            </View>
          </View>

          <GInput
            label="Cooldown (seconds)"
            placeholder="60"
            value={cooldownSecs}
            onChangeText={setCooldownSecs}
            keyboardType="numeric"
          />

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Action</Text>
            <GRadioGroup
              orientation="horizontal"
              options={[
                { value: 'agent_prompt', label: 'Run prompt' },
                { value: 'device_power', label: 'Set device power' },
                { value: 'notify', label: 'Notify' },
              ]}
              value={actionType}
              onValueChange={(v) => setActionType(v as TriggerAction['type'])}
            />
          </View>

          {actionType === 'agent_prompt' && (
            <GTextArea
              label="Prompt"
              placeholder="What should the agent do?"
              value={actionPrompt}
              onChangeText={setActionPrompt}
              minLines={3}
              maxLines={6}
            />
          )}

          {actionType === 'device_power' && (
            <>
              <GSelect
                label="Target device"
                options={deviceOptions}
                selectedKey={actionDeviceId}
                onSelectionChange={setActionDeviceId}
                placeholder="Choose a device..."
              />
              <GRadioGroup
                orientation="horizontal"
                options={[{ value: 'on', label: 'Turn on' }, { value: 'off', label: 'Turn off' }]}
                value={actionOn}
                onValueChange={(v) => setActionOn(v as 'on' | 'off')}
              />
            </>
          )}

          {actionType === 'notify' && (
            <>
              <GInput label="Title" placeholder="Heads up" value={notifyTitle} onChangeText={setNotifyTitle} />
              <GInput label="Body" placeholder="Details..." value={notifyBody} onChangeText={setNotifyBody} />
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <GButton variant="primary" onPress={handleSubmit} loading={submitting}>
            Create Automation
          </GButton>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: Brand.white },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Grey[200],
  },
  title: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Brand.charcoal,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  field: { gap: Spacing.sm },
  fieldLabel: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Grey[600],
  },
  row: { flexDirection: 'row', gap: Spacing.md },
  rowItem: { flex: 1 },
  error: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Semantic.danger,
  },
});
