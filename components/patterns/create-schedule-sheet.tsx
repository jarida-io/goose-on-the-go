/**
 * CreateScheduleSheet — a new schedule, once or on repeat, that runs a prompt.
 *
 * "Once" is a date and a time, sent as a pinned cron with `once: true` (see
 * `oneOffCron`); "On repeat" is a cron expression, written by hand for now.
 * Checks that would otherwise come back as a 400 run here first, so the
 * person hears what to fix before anything is sent.
 */

import React, { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  InkButton,
  InkDatePicker,
  InkInput,
  InkNotice,
  InkSegmented,
  InkSheet,
  InkText,
  InkTextArea,
  InkTimePicker,
} from '@jarida/ink/native';
import type { CivilDate, CivilTime } from '@jarida/ink';

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
  const [name, setName] = useState('');
  const [timing, setTiming] = useState<Timing>('once');
  const [date, setDate] = useState<CivilDate | null>(null);
  const [time, setTime] = useState<CivilTime | null>(null);
  const [cron, setCron] = useState('');
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    setName('');
    setTiming('once');
    setDate(null);
    setTime(null);
    setCron('');
    setPrompt('');
    setError(null);
    onClose();
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
    setSubmitting(false);
    if (refused) {
      void reject();
      setError(refused);
      return;
    }
    void confirm();
    close();
  };

  return (
    <InkSheet open={open} onClose={close} title={t('schedule.form.scheduleTitle')}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <InkInput
          label={t('schedule.form.name')}
          placeholder={t('schedule.form.schedulePlaceholder')}
          value={name}
          onChange={setName}
        />

        <InkSegmented
          label={t('schedule.form.timing')}
          value={timing}
          options={[
            { value: 'once', label: t('schedule.form.once') },
            { value: 'repeat', label: t('schedule.form.repeat') },
          ]}
          onChange={setTiming}
        />

        {timing === 'once' ? (
          <>
            <InkDatePicker label={t('schedule.form.date')} value={date} onChange={setDate} min={todayCivil()} />
            <InkTimePicker label={t('schedule.form.time')} value={time} onChange={setTime} />
          </>
        ) : (
          <>
            <InkInput
              label={t('schedule.form.cron')}
              placeholder="0 0 9 * * 1-5"
              value={cron}
              onChange={setCron}
            />
            <InkText size="sm" tone="tertiary">{t('schedule.form.cronHint')}</InkText>
          </>
        )}

        <InkTextArea
          label={t('schedule.form.prompt')}
          placeholder={t('schedule.form.promptPlaceholder')}
          value={prompt}
          onChange={setPrompt}
          rows={3}
          maxRows={6}
        />

        {error ? <InkNotice tone="danger">{error}</InkNotice> : null}

        <InkButton variant="primary" block disabled={submitting} onPress={submit}>
          {t('schedule.form.create')}
        </InkButton>
      </ScrollView>
    </InkSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingBottom: Spacing['2xl'] },
});
