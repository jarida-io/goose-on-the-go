/**
 * CreateScheduleSheet — a new schedule, once or on repeat, that runs a prompt.
 *
 * "Once" is a date and a time, sent as a pinned cron with `once: true` (see
 * `oneOffCron`); "On repeat" is a cron expression, written by hand for now.
 * Checks that would otherwise come back as a 400 run here first, so the
 * person hears what to fix before anything is sent.
 */

import React, { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  InkButton,
  InkDatePicker,
  InkFormField,
  InkInput,
  InkNotice,
  InkSegmented,
  InkSheet,
  InkText,
  InkTextArea,
  InkTimePicker,
} from '@jarida/ink/native';
import type { CivilDate, CivilTime } from '@jarida/ink';

import { GKeyboardView } from '@/components/ui/g-keyboard-view';
import { isSixFieldCron, oneOffCron } from '@/models/schedule';
import { confirm, reject } from '@/services/haptics';
import type { CreateScheduleRequest } from '@/services/types';
import { Spacing } from '@/constants/spacing';

type Timing = 'once' | 'repeat';

export interface CreateScheduleSheetProps {
  open: boolean;
  onClose: () => void;
  /** Resolves to why it was refused, or null once it exists. */
  onCreate: (req: Omit<CreateScheduleRequest, 'timezone'>) => Promise<string | null>;
}

function todayCivil(): CivilDate {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

export function CreateScheduleSheet({ open, onClose, onCreate }: CreateScheduleSheetProps) {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  const [name, setName] = useState('');
  const [timing, setTiming] = useState<Timing>('once');
  const [date, setDate] = useState<CivilDate | null>(null);
  const [time, setTime] = useState<CivilTime | null>(null);
  const [cron, setCron] = useState('');
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Only a created schedule clears the form. A stray tap on the backdrop
  // closes the sheet too, and it should not cost the draft.
  const reset = () => {
    setName('');
    setTiming('once');
    setDate(null);
    setTime(null);
    setCron('');
    setPrompt('');
    setError(null);
    setSubmitting(false);
  };

  /** The request, or the sentence that says what is missing. */
  const build = (): Omit<CreateScheduleRequest, 'timezone'> | string => {
    if (!name.trim()) return t('schedule.errors.nameRequired');
    if (!prompt.trim()) return t('schedule.errors.promptRequired');
    if (timing === 'once') {
      if (!date || !time) return t('schedule.errors.whenRequired');
      const at = new Date(date.year, date.month - 1, date.day, time.hour, time.minute);
      if (at.getTime() <= Date.now()) return t('schedule.errors.whenPast');
      return { name: name.trim(), cron: oneOffCron(date, time), prompt: prompt.trim(), once: true };
    }
    if (!isSixFieldCron(cron)) return t('schedule.errors.cronFields');
    return { name: name.trim(), cron: cron.trim(), prompt: prompt.trim(), once: false };
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
    if (refused) {
      setSubmitting(false);
      void reject();
      setError(refused);
      return;
    }
    void confirm();
    reset();
    onClose();
  };

  // Without `today` the calendar opens on its own default month, January 2026.
  const today = todayCivil();

  return (
    <InkSheet open={open} onClose={onClose} title={t('schedule.form.scheduleTitle')}>
      {/* `InkSheet` has no height limit of its own. The bound includes the
          keyboard's padding, so with the keyboard up the form scrolls in what
          is left rather than pushing the sheet off the top of the window. */}
      <GKeyboardView style={{ maxHeight: height * 0.7 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <InkFormField label={t('schedule.form.name')}>
            <InkInput
              label={t('schedule.form.name')}
              placeholder={t('schedule.form.schedulePlaceholder')}
              value={name}
              onChange={setName}
            />
          </InkFormField>

          <InkFormField label={t('schedule.form.timing')}>
            <InkSegmented
              label={t('schedule.form.timing')}
              value={timing}
              options={[
                { value: 'once', label: t('schedule.form.once') },
                { value: 'repeat', label: t('schedule.form.repeat') },
              ]}
              onChange={setTiming}
            />
          </InkFormField>

          {timing === 'once' ? (
            <>
              <InkFormField label={t('schedule.form.date')}>
                <InkDatePicker
                  label={t('schedule.form.date')}
                  placeholder={t('schedule.form.datePlaceholder')}
                  value={date}
                  onChange={setDate}
                  today={today}
                  min={today}
                />
              </InkFormField>
              <InkFormField label={t('schedule.form.time')}>
                <InkTimePicker label={t('schedule.form.time')} value={time} onChange={setTime} />
              </InkFormField>
            </>
          ) : (
            <>
              <InkFormField label={t('schedule.form.cron')}>
                <InkInput
                  label={t('schedule.form.cron')}
                  placeholder="0 0 9 * * 1-5"
                  value={cron}
                  onChange={setCron}
                />
              </InkFormField>
              <InkText size="sm" tone="tertiary">{t('schedule.form.cronHint')}</InkText>
            </>
          )}

          <InkFormField label={t('schedule.form.prompt')}>
            <InkTextArea
              label={t('schedule.form.prompt')}
              placeholder={t('schedule.form.promptPlaceholder')}
              value={prompt}
              onChange={setPrompt}
              rows={3}
              maxRows={6}
            />
          </InkFormField>

          {error ? <InkNotice tone="danger">{error}</InkNotice> : null}

          <InkButton variant="primary" block disabled={submitting} onPress={submit}>
            {t('schedule.form.create')}
          </InkButton>
        </ScrollView>
      </GKeyboardView>
    </InkSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingBottom: Spacing['2xl'] },
});
