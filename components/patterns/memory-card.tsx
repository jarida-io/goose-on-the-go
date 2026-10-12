/**
 * MemoryCard — one memory: what it says, its segment, whether it is kept
 * forever, and when it was learned.
 *
 * "Kept" is read-only. It is the Pond's `permanent` tier, and the Pond has no
 * route that changes a saved memory's tier (see `models/memory.ts`).
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkBadge, InkButton, InkCard, InkText } from '@jarida/ink/native';

import { isKept, segmentLabel } from '@/models/memory';
import type { MemoryFragment } from '@/services/types';
import { relativeWhen } from '@/view-models/use-chat-history';
import { Spacing } from '@/constants/spacing';

export interface MemoryCardProps {
  memory: MemoryFragment;
  onEdit: (memory: MemoryFragment) => void;
  onDelete: (memory: MemoryFragment) => void;
}

export const MemoryCard = React.memo(function MemoryCard({ memory, onEdit, onDelete }: MemoryCardProps) {
  const { t } = useTranslation();
  const when = relativeWhen(memory.created_at, new Date(), undefined, t('sessions.yesterday'));

  return (
    <InkCard>
      <View style={styles.badges}>
        {memory.segment ? <InkBadge tone="brand">{segmentLabel(memory.segment)}</InkBadge> : null}
        {isKept(memory) ? <InkBadge tone="neutral">{t('memories.card.kept')}</InkBadge> : null}
      </View>
      <InkText>{memory.content}</InkText>
      <View style={styles.footer}>
        <InkText size="sm" tone="tertiary">{when}</InkText>
        <View style={styles.actions}>
          <InkButton variant="quiet" icon="edit" onPress={() => onEdit(memory)}>
            {t('memories.card.edit')}
          </InkButton>
          <InkButton variant="quiet" icon="trash" onPress={() => onDelete(memory)}>
            {t('memories.card.forget')}
          </InkButton>
        </View>
      </View>
    </InkCard>
  );
});

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  actions: { flexDirection: 'row', gap: Spacing.xs },
});
