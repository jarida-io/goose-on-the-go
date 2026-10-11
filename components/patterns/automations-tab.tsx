/**
 * AutomationsTab — the sensor-triggered rules: list, create, pause and resume.
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkButton, InkEmptyState, InkNotice, InkSpinner, InkText } from '@jarida/ink/native';

import { AutomationCard } from '@/components/patterns/automation-card';
import { CreateAutomationSheet } from '@/components/patterns/create-automation-sheet';
import { useRules } from '@/view-models/use-rules';
import { Spacing } from '@/constants/spacing';

export function AutomationsTab() {
  const { t } = useTranslation();
  const { data, loading, error, failed, actions } = useRules();
  const [creating, setCreating] = useState(false);

  return (
    <View style={styles.body}>
      <View style={styles.header}>
        <InkButton variant="primary" icon="plus" onPress={() => setCreating(true)}>
          {t('schedule.list.newAutomation')}
        </InkButton>
      </View>

      {loading ? <InkSpinner label={t('schedule.list.loading')} /> : null}

      {/* A failed read with no sentence of its own still leaves the list unknown. */}
      {error || failed ? (
        <View style={styles.notice}>
          <InkNotice tone="danger">{error ?? t('schedule.list.rulesFailed')}</InkNotice>
          <InkButton variant="quiet" icon="refresh" onPress={actions.refresh}>
            {t('common.retry')}
          </InkButton>
        </View>
      ) : null}

      {!loading && !error && !failed && data.rules.length === 0 ? (
        <InkEmptyState icon="bolt" title={t('schedule.list.noRulesTitle')}>
          <InkText>{t('schedule.list.noRulesBody')}</InkText>
        </InkEmptyState>
      ) : null}

      {data.rules.length > 0 ? (
        <InkText size="sm" tone="tertiary">{t('schedule.list.rulesNote')}</InkText>
      ) : null}

      {data.rules.map((rule) => (
        <AutomationCard key={rule.id} rule={rule} onSetPaused={actions.setPaused} />
      ))}

      <CreateAutomationSheet open={creating} onClose={() => setCreating(false)} onCreate={actions.create} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.md },
  header: { flexDirection: 'row', justifyContent: 'flex-end' },
  notice: { gap: Spacing.sm },
});
