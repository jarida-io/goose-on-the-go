/**
 * CreateScheduleSheet — modal form to create a cron or one-off schedule.
 *
 * One-off schedules have no `fire_at` field on the create API — instead we
 * build a cron expression pinned to the chosen date/month (with `once: true`)
 * so the backend fires it exactly once at that instant, then self-deletes.
 *
 * The backend's cron parser requires 6 fields with SECONDS FIRST
 * (second minute hour day month weekday), confirmed against a live server —
 * a 5-field expression is rejected with 400 "invalid cron expression".
 */

import React, { useState } from 'react';
import { Modal, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GInput } from '@/components/ui/g-input';
import { GTextArea } from '@/components/ui/g-text-area';
import { GRadioGroup } from '@/components/ui/g-radio-group';
import { GButton } from '@/components/ui/g-button';
import type { CreateScheduleInput } from '@/models/schedule';
import { Brand, Grey, Semantic } from '@/constants/colors';
import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export interface CreateScheduleSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: CreateScheduleInput) => Promise<unknown>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const CRON_RE = /^\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+$/;

export function CreateScheduleSheet({ visible, onClose, onSubmit }: CreateScheduleSheetProps) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'once' | 'recurring'>('once');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [cron, setCron] = useState('');
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setMode('once');
    setDate('');
    setTime('');
    setCron('');
    setPrompt('');
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) return setError('Name is required.');
    if (!prompt.trim()) return setError('Prompt is required.');

    let cronExpr: string;
    let once: boolean;
    if (mode === 'once') {
      if (!DATE_RE.test(date)) return setError('Date must be in YYYY-MM-DD format.');
      if (!TIME_RE.test(time)) return setError('Time must be in HH:MM (24-hour) format.');
      const [, month, day] = date.match(/^\d{4}-(\d{2})-(\d{2})$/) ?? [];
      const [hour, minute] = time.split(':');
      cronExpr = `0 ${Number(minute)} ${Number(hour)} ${Number(day)} ${Number(month)} *`;
      once = true;
    } else {
      if (!CRON_RE.test(cron.trim())) return setError('Cron must have 6 space-separated fields (seconds first).');
      cronExpr = cron.trim();
      once = false;
    }

    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), cron: cronExpr, prompt: prompt.trim(), once });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create schedule.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={styles.modal}>
        <View style={styles.header}>
          <Text style={styles.title}>New Schedule</Text>
          <GButton variant="ghost" size="sm" onPress={handleClose}>Cancel</GButton>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <GInput label="Name" placeholder="Morning briefing" value={name} onChangeText={setName} />

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Timing</Text>
            <GRadioGroup
              orientation="horizontal"
              options={[
                { value: 'once', label: 'One-off' },
                { value: 'recurring', label: 'Recurring' },
              ]}
              value={mode}
              onValueChange={(v) => setMode(v as 'once' | 'recurring')}
            />
          </View>

          {mode === 'once' ? (
            <View style={styles.row}>
              <View style={styles.rowItem}>
                <GInput label="Date" placeholder="2026-09-20" value={date} onChangeText={setDate} />
              </View>
              <View style={styles.rowItem}>
                <GInput label="Time" placeholder="07:00" value={time} onChangeText={setTime} />
              </View>
            </View>
          ) : (
            <View style={styles.field}>
              <GInput
                label="Cron expression"
                placeholder="0 0 9 * * 1-5"
                value={cron}
                onChangeText={setCron}
                style={styles.mono}
              />
              <Text style={styles.hint}>6-field cron with seconds first (second minute hour day month weekday).</Text>
            </View>
          )}

          <View style={styles.field}>
            <GTextArea
              label="Prompt"
              placeholder="What should the agent do?"
              value={prompt}
              onChangeText={setPrompt}
              minLines={3}
              maxLines={6}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <GButton variant="primary" onPress={handleSubmit} loading={submitting}>
            Create Schedule
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
  mono: {},
  hint: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Grey[500],
  },
  error: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Semantic.danger,
  },
});
