/**
 * MemorySheet — a new memory, or new words for one the Pond already holds.
 *
 * A new memory takes a segment and whether to keep it forever; the Pond sets
 * importance and decay from those. Editing offers the words only, because
 * `PUT /memories/{id}` changes nothing else (see `models/memory.ts`).
 */

import React, { useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkButton, InkChip, InkFormField, InkNotice, InkSheet, InkSwitch, InkText, InkTextArea } from '@jarida/ink/native';

import { GKeyboardView } from '@/components/ui/g-keyboard-view';
import { MEMORY_SEGMENTS, segmentLabel } from '@/models/memory';
import { confirm, reject } from '@/services/haptics';
import type { MemoryFragment, MemorySegment, SaveMemoryRequest } from '@/services/types';
import { Spacing } from '@/constants/spacing';

export interface MemorySheetProps {
  open: boolean;
  /** The memory being reworded, or null for a new one. */
  editing: MemoryFragment | null;
  onClose: () => void;
  /** Each resolves to why the Pond refused it, or null once it is saved. */
  onSave: (req: SaveMemoryRequest) => Promise<string | null>;
  onReword: (memory: MemoryFragment, content: string) => Promise<string | null>;
}

export function MemorySheet({ open, editing, onClose, onSave, onReword }: MemorySheetProps) {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  // Mounted afresh for each opening (the screen keys it), so this starts from
  // the memory being edited, or blank.
  const [content, setContent] = useState(editing?.content ?? '');
  const [segment, setSegment] = useState<MemorySegment | null>(null);
  const [keep, setKeep] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const words = content.trim();
    if (!words) {
      void reject();
      setError(t('memories.errors.contentRequired'));
      return;
    }
    setError(null);
    setSubmitting(true);
    const refused = editing
      ? await onReword(editing, words)
      : await onSave({ content: words, segment: segment ?? undefined, tier: keep ? 'permanent' : undefined });
    setSubmitting(false);
    if (refused) {
      void reject();
      setError(refused);
      return;
    }
    void confirm();
    onClose();
  };

  return (
    <InkSheet open={open} onClose={onClose} title={editing ? t('memories.form.editTitle') : t('memories.form.newTitle')}>
      <GKeyboardView style={{ maxHeight: height * 0.7 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <InkFormField label={t('memories.form.content')}>
            <InkTextArea
              label={t('memories.form.content')}
              placeholder={t('memories.form.contentPlaceholder')}
              value={content}
              onChange={setContent}
              rows={3}
              maxRows={6}
            />
          </InkFormField>

          {editing ? null : (
            <>
              <InkFormField label={t('memories.form.segment')}>
                <View style={styles.chips}>
                  {MEMORY_SEGMENTS.map((s) => (
                    <InkChip key={s} selected={segment === s} onPress={() => setSegment(segment === s ? null : s)}>
                      {segmentLabel(s)}
                    </InkChip>
                  ))}
                </View>
              </InkFormField>
              <InkText size="sm" tone="tertiary">{t('memories.form.segmentHint')}</InkText>

              <InkSwitch label={t('memories.form.keep')} checked={keep} onChange={setKeep} />
              <InkText size="sm" tone="tertiary">{t('memories.form.keepHint')}</InkText>
            </>
          )}

          {error ? <InkNotice tone="danger">{error}</InkNotice> : null}

          <InkButton variant="primary" block disabled={submitting} onPress={submit}>
            {t('memories.form.save')}
          </InkButton>
        </ScrollView>
      </GKeyboardView>
    </InkSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingBottom: Spacing['2xl'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
});
