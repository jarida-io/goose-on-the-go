/**
 * Agent prompt templates: view, edit, save, and reset the agent's core instructions
 * (soul, heartbeat, scratchpad, and conversation presets).
 */

import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  InkButton,
  InkCard,
  InkChip,
  InkEmptyState,
  InkNotice,
  InkSpinner,
  InkText,
  InkTextArea,
  InkTitle,
  useInkTheme,
} from '@/components/ui/ink';

import { ContentUnavailable } from '@/components/patterns/content-unavailable';
import { PromptVisualBuilder } from '@/components/settings/prompt-visual-builder';
import { Spacing } from '@/constants/spacing';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { PRESET_DESCRIPTIONS, templateLabel } from '@/models/prompt-templates';
import { useConfirm } from '@/providers/confirm-provider';
import { usePromptTemplates } from '@/view-models/use-prompt-templates';
import { usePullToRefresh } from '@/view-models/use-pull-to-refresh';
import type { ThemeColors } from '@/constants/colors';

export default function SettingsPromptTemplatesScreen() {
  const { t } = useTranslation();
  const theme = useInkTheme();
  const styles = useThemedStyles(makeStyles);
  const confirm = useConfirm();

  const { data, loading, saving, resetting, error, failed, actions } = usePromptTemplates();
  const pull = usePullToRefresh(actions.refresh);
  const [editorMode, setEditorMode] = useState<'visual' | 'raw'>('visual');

  const active = data.activeTemplate;

  const handleReset = useCallback(async () => {
    if (!active) return;
    const name = templateLabel(active.name);
    const yes = await confirm({
      title: t('promptTemplates.resetConfirmTitle', { name }),
      message: t('promptTemplates.resetConfirmBody'),
      confirmLabel: t('promptTemplates.reset'),
      destructive: true,
    });
    if (yes) {
      void actions.reset();
    }
  }, [actions, active, confirm, t]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl {...pull} />}
    >
      <InkNotice tone="info">{t('promptTemplates.lead')}</InkNotice>

      {error ? <InkNotice tone="danger">{error}</InkNotice> : null}

      {failed && !data.templates.length ? (
        <ContentUnavailable
          state="failed"
          reason={error}
          onRetry={actions.refresh}
        />
      ) : null}

      {loading && !data.templates.length ? (
        <InkSpinner label={t('promptTemplates.saving')} />
      ) : null}

      {data.templates.length > 0 ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {data.templates.map((tpl) => (
              <InkChip
                key={tpl.name}
                selected={data.activeName === tpl.name}
                onPress={() => actions.select(tpl.name)}
              >
                {templateLabel(tpl.name)}
                {tpl.is_customized ? ' *' : ''}
              </InkChip>
            ))}
          </ScrollView>

          {active ? (
            <InkCard>
              <View style={styles.cardHeader}>
                <View style={styles.titleColumn}>
                  <InkTitle level={3}>{templateLabel(active.name)}</InkTitle>
                  <InkText tone="secondary">
                    {active.description || PRESET_DESCRIPTIONS[active.name] || ''}
                  </InkText>
                </View>
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: data.isCustomized
                        ? theme.color.accentSofter
                        : theme.color.chrome,
                    },
                  ]}
                >
                  <InkText
                    size="sm"
                    weight="semibold"
                    style={{
                      color: data.isCustomized
                        ? theme.color.accentLine
                        : theme.color.textTertiary,
                    }}
                  >
                    {data.isCustomized
                      ? t('promptTemplates.customized')
                      : t('promptTemplates.factory')}
                  </InkText>
                </View>
              </View>

              <View style={styles.modeRow}>
                <InkChip selected={editorMode === 'visual'} onPress={() => setEditorMode('visual')}>
                  Visual
                </InkChip>
                <InkChip selected={editorMode === 'raw'} onPress={() => setEditorMode('raw')}>
                  Raw
                </InkChip>
              </View>

              {editorMode === 'visual' ? (
                <PromptVisualBuilder content={data.content} onChange={actions.setContent} />
              ) : (
                <InkTextArea
                  value={data.content}
                  onChange={actions.setContent}
                  rows={14}
                  placeholder={templateLabel(active.name)}
                />
              )}

              <View style={styles.footer}>
                <InkButton
                  variant="quiet"
                  icon="restore"
                  loading={resetting}
                  disabled={resetting || !data.isCustomized}
                  onPress={handleReset}
                >
                  {t('promptTemplates.reset')}
                </InkButton>
                <InkButton
                  variant="primary"
                  icon="check"
                  loading={saving}
                  disabled={!data.isDirty || saving}
                  onPress={() => void actions.save()}
                >
                  {t('promptTemplates.save')}
                </InkButton>
              </View>
            </InkCard>
          ) : null}
        </>
      ) : null}

      {!loading && !failed && data.templates.length === 0 ? (
        <InkEmptyState icon="prompts" title={t('promptTemplates.emptyTitle')}>
          <InkText>{t('promptTemplates.emptyBody')}</InkText>
        </InkEmptyState>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    scroll: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['4xl'] },
    chipsRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.xs },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: Spacing.md,
      marginBottom: Spacing.sm,
    },
    titleColumn: { flex: 1, gap: Spacing.xs },
    badge: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
      borderRadius: 6,
      alignSelf: 'flex-start',
    },
    modeRow: {
      flexDirection: 'row',
      gap: Spacing.xs,
      marginBottom: Spacing.sm,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: Spacing.md,
    },
  });
