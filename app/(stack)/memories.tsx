/**
 * MemoriesScreen — what the Pond has learned about the household: read, add,
 * reword and forget, filter by segment, and tidy the store on request.
 *
 * The filter chips are the Pond's segments and "Kept" is its permanent tier;
 * `models/memory.ts` says why those, and not fields of the app's own.
 */

import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkButton, InkChip, InkEmptyState, InkNotice, InkSpinner, InkText } from '@jarida/ink/native';

import { ConsolidationCard } from '@/components/patterns/consolidation-card';
import { MemoryCard } from '@/components/patterns/memory-card';
import { MemorySheet } from '@/components/patterns/memory-sheet';
import { segmentLabel, segmentsIn } from '@/models/memory';
import type { MemoryFragment, MemorySegment } from '@/services/types';
import { useConsolidation } from '@/view-models/use-consolidation';
import { useMemories } from '@/view-models/use-memories';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

export default function MemoriesScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const { data, loading, error, failed, actions } = useMemories();
  const consolidation = useConsolidation(actions.refresh);
  const [filter, setFilter] = useState<MemorySegment | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<MemoryFragment | null>(null);
  // A new key per opening gives the sheet a fresh form each time.
  const [sheetKey, setSheetKey] = useState(0);

  const segments = segmentsIn(data.memories);
  // A filter whose last memory went is dropped rather than left showing nothing.
  const active = filter && segments.includes(filter) ? filter : null;
  const shown = active ? data.memories.filter((m) => m.segment === active) : data.memories;

  const openSheet = useCallback((memory: MemoryFragment | null) => {
    setEditing(memory);
    setSheetKey((k) => k + 1);
    setSheetOpen(true);
  }, []);

  const { remove } = actions;
  const confirmDelete = useCallback(
    (memory: MemoryFragment) => {
      Alert.alert(t('memories.forgetTitle'), t('memories.forgetBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('memories.card.forget'), style: 'destructive', onPress: () => void remove(memory) },
      ]);
    },
    [t, remove],
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <ConsolidationCard
        progress={consolidation.progress}
        available={consolidation.available}
        onStart={consolidation.actions.start}
        onStop={consolidation.actions.stop}
      />

      <View style={styles.header}>
        <InkButton variant="primary" icon="plus" onPress={() => openSheet(null)}>
          {t('memories.list.add')}
        </InkButton>
      </View>

      {segments.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <InkChip selected={active === null} onPress={() => setFilter(null)}>
            {t('memories.list.all')}
          </InkChip>
          {segments.map((s) => (
            <InkChip key={s} selected={active === s} onPress={() => setFilter(s)}>
              {segmentLabel(s)}
            </InkChip>
          ))}
        </ScrollView>
      ) : null}

      {loading ? <InkSpinner label={t('memories.list.loading')} /> : null}

      {/* A failed read with no sentence of its own still leaves the list unknown. */}
      {error || failed ? (
        <View style={styles.notice}>
          <InkNotice tone="danger">{error ?? t('memories.list.failed')}</InkNotice>
          <InkButton variant="quiet" icon="refresh" onPress={actions.refresh}>
            {t('common.retry')}
          </InkButton>
        </View>
      ) : null}

      {!loading && !error && !failed && data.memories.length === 0 ? (
        <InkEmptyState icon="sparkle" title={t('memories.list.emptyTitle')}>
          <InkText>{t('memories.list.emptyBody')}</InkText>
        </InkEmptyState>
      ) : null}

      {shown.map((memory) => (
        <MemoryCard key={memory.id} memory={memory} onEdit={openSheet} onDelete={confirmDelete} />
      ))}

      <MemorySheet
        key={sheetKey}
        open={sheetOpen}
        editing={editing}
        onClose={() => setSheetOpen(false)}
        onSave={actions.save}
        onReword={actions.reword}
      />
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    scroll: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['4xl'] },
    header: { flexDirection: 'row', justifyContent: 'flex-end' },
    chips: { gap: Spacing.sm },
    notice: { gap: Spacing.sm },
  });
