/**
 * WebWatchGuidedSheet — step-by-step guided setup for a Web Watch from the chat drawer.
 *
 * Walks the user through three focused questions:
 * 1. Where should Goose look? (Search the internet vs. a specific webpage URL)
 * 2. What should Goose look for? (Quick prompts + free-text description)
 * 3. How often should Goose check? (Cadence + confirmation summary)
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GIcon } from '@/components/ui/g-icon';
import {
  InkButton,
  InkChoice,
  InkEyebrow,
  InkInput,
  InkNotice,
  InkSheet,
  InkText,
  InkTextArea,
  useInkTheme,
} from '@/components/ui/ink';
import { Spacing } from '@/constants/spacing';
import type { WebWatch } from '@/models/web-watches';
import { api } from '@/services/api-client';

const CADENCE_OPTIONS = [
  { hours: 1, label: 'Hourly' },
  { hours: 6, label: 'Every 6h' },
  { hours: 24, label: 'Daily' },
  { hours: 168, label: 'Weekly' },
] as const;

const PROMPT_PRESETS = [
  'Price drop',
  'Back in stock',
  'New listings',
  'News & updates',
] as const;

type TargetMode = 'search' | 'url';

export interface WebWatchGuidedSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (watch: WebWatch) => void;
}

export function WebWatchGuidedSheet({ open, onClose, onCreated }: WebWatchGuidedSheetProps) {
  const theme = useInkTheme();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<TargetMode>('search');
  const [url, setUrl] = useState('');
  const [lookingFor, setLookingFor] = useState('');
  const [intervalHours, setIntervalHours] = useState<number>(24);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep(1);
    setMode('search');
    setUrl('');
    setLookingFor('');
    setIntervalHours(24);
    setSaving(false);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    if (saving) return;
    reset();
    onClose();
  }, [onClose, reset, saving]);

  const applyPreset = useCallback((preset: string) => {
    setLookingFor((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return `${preset}: `;
      if (trimmed.toLowerCase().includes(preset.toLowerCase())) return prev;
      return `${trimmed}, ${preset.toLowerCase()}`;
    });
  }, []);

  const step1Valid = mode === 'search' || url.trim().length > 0;
  const step2Valid = lookingFor.trim().length > 0;

  const submit = useCallback(async () => {
    if (!step2Valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const cleanUrl = mode === 'url' ? url.trim() : '';
      const created = await api.createWebWatch({
        url: cleanUrl || undefined,
        looking_for: lookingFor.trim(),
        interval_hours: intervalHours,
      });
      reset();
      onClose();
      onCreated?.(created);
    } catch {
      setError('Could not start watching right now. Please try again.');
      setSaving(false);
    }
  }, [intervalHours, lookingFor, mode, onClose, onCreated, reset, saving, step2Valid, url]);

  const cadenceLabel = CADENCE_OPTIONS.find((o) => o.hours === intervalHours)?.label ?? `Every ${intervalHours}h`;

  return (
    <InkSheet open={open} onClose={handleClose} title="Set up Web Watch" scroll>
      <View style={styles.sheet}>
        <View style={styles.progress}>
          {[1, 2, 3].map((n) => (
            <View
              key={n}
              style={[
                styles.stepDot,
                { backgroundColor: n <= step ? theme.color.accent : theme.color.lineStrong },
              ]}
            />
          ))}
          <InkText size="xs" tone="tertiary" style={styles.stepCount}>
            Step {step} of 3
          </InkText>
        </View>

        {step === 1 ? (
          <View style={styles.section}>
            <View style={styles.questionHead}>
              <GIcon name="globe" size={20} color={theme.color.accentLine} />
              <InkText size="md" weight="semibold">
                Where should Goose look?
              </InkText>
            </View>
            <InkText size="sm" tone="secondary">
              Goose can search across the web for what you want, or watch a specific page for changes.
            </InkText>
            <View style={styles.chips}>
              <InkChoice selected={mode === 'search'} onSelect={() => setMode('search')}>
                Search the internet
              </InkChoice>
              <InkChoice selected={mode === 'url'} onSelect={() => setMode('url')}>
                Specific webpage
              </InkChoice>
            </View>
            {mode === 'url' ? (
              <InkInput
                label="Webpage URL"
                value={url}
                onChange={setUrl}
                placeholder="https://example.com/page"
              />
            ) : null}
            <View style={styles.actions}>
              <InkButton variant="primary" block disabled={!step1Valid} onPress={() => setStep(2)}>
                Next
              </InkButton>
            </View>
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.section}>
            <View style={styles.questionHead}>
              <GIcon name="eye" size={20} color={theme.color.accentLine} />
              <InkText size="md" weight="semibold">
                What should Goose look for?
              </InkText>
            </View>
            <InkText size="sm" tone="secondary">
              Describe the item, price target, or update that should trigger a notification.
            </InkText>
            <View style={styles.chips}>
              {PROMPT_PRESETS.map((preset) => (
                <InkChoice
                  key={preset}
                  selected={lookingFor.toLowerCase().includes(preset.toLowerCase())}
                  onSelect={() => applyPreset(preset)}
                >
                  {preset}
                </InkChoice>
              ))}
            </View>
            <InkTextArea
              label="What to watch for"
              value={lookingFor}
              onChange={setLookingFor}
              placeholder={
                mode === 'url'
                  ? 'e.g. Price drops below $500 or back in stock'
                  : 'e.g. PS5 Pro in stock in Kenya under KES 100k'
              }
              rows={3}
              maxRows={5}
            />
            <View style={styles.rowActions}>
              <InkButton onPress={() => setStep(1)} style={styles.halfBtn}>
                Back
              </InkButton>
              <InkButton
                variant="primary"
                disabled={!step2Valid}
                onPress={() => setStep(3)}
                style={styles.halfBtn}
              >
                Next
              </InkButton>
            </View>
          </View>
        ) : null}

        {step === 3 ? (
          <View style={styles.section}>
            <View style={styles.questionHead}>
              <GIcon name="schedule" size={20} color={theme.color.accentLine} />
              <InkText size="md" weight="semibold">
                How often should Goose check?
              </InkText>
            </View>
            <InkText size="sm" tone="secondary">
              Pick how frequently your Pond checks for matches or changes.
            </InkText>
            <View style={styles.chips}>
              {CADENCE_OPTIONS.map((opt) => (
                <InkChoice
                  key={opt.hours}
                  selected={intervalHours === opt.hours}
                  onSelect={() => setIntervalHours(opt.hours)}
                >
                  {opt.label}
                </InkChoice>
              ))}
            </View>
            <View
              style={[
                styles.summary,
                {
                  backgroundColor: theme.color.surface,
                  borderColor: theme.color.line,
                  borderRadius: theme.radius.lg,
                  borderWidth: theme.edge.hairlineWidth,
                },
              ]}
            >
              <InkEyebrow>SUMMARY</InkEyebrow>
              <InkText size="sm">
                <InkText size="sm" weight="semibold">Where: </InkText>
                {mode === 'url' ? url.trim() : 'Internet search'}
              </InkText>
              <InkText size="sm">
                <InkText size="sm" weight="semibold">Looking for: </InkText>
                {lookingFor.trim()}
              </InkText>
              <InkText size="sm">
                <InkText size="sm" weight="semibold">Check: </InkText>
                {cadenceLabel}
              </InkText>
            </View>
            {error ? <InkNotice tone="danger">{error}</InkNotice> : null}
            <View style={styles.rowActions}>
              <InkButton
                disabled={saving}
                onPress={() => setStep(2)}
                style={styles.halfBtn}
              >
                Back
              </InkButton>
              <InkButton
                variant="primary"
                loading={saving}
                disabled={saving}
                onPress={() => void submit()}
                style={styles.halfBtn}
              >
                Start Watching
              </InkButton>
            </View>
          </View>
        ) : null}
      </View>
    </InkSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: Spacing.md, paddingBottom: Spacing.xl },
  progress: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  stepDot: { height: 4, flex: 1, borderRadius: 2 },
  stepCount: { marginLeft: Spacing.xs },
  section: { gap: Spacing.md },
  questionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  summary: { padding: Spacing.md, gap: Spacing.xs },
  actions: { marginTop: Spacing.xs },
  rowActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  halfBtn: { flex: 1 },
});
