/**
 * AutomationCard — one sensor-triggered rule: what it listens for, when it
 * last fired, and a switch. No Run now: a rule fires on a matching reading,
 * and the Pond's `/rules` routes have no way to fire one by hand.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { InkBadge, InkCard, InkSwitch, InkText } from '@jarida/ink/native';

import { formatScheduleTime } from '@/models/schedule';
import { toggle } from '@/services/haptics';
import type { TranslationKey } from '@/services/i18n';
import type { Rule, TriggerCondition, TriggerSource } from '@/services/types';
import { Spacing } from '@/constants/spacing';

export interface AutomationCardProps {
  rule: Rule;
  onSetPaused: (rule: Rule, paused: boolean) => void;
}

/** Comparison symbols read the same in every language. */
function opSymbol(op: NonNullable<TriggerCondition['op']>): string {
  switch (op) {
    case 'gt':
      return '>';
    case 'gte':
      return '≥';
    case 'lt':
      return '<';
    case 'lte':
      return '≤';
    case 'eq':
      return '=';
  }
}

export function sourceKey(kind: TriggerSource['kind']): TranslationKey {
  switch (kind) {
    case 'sensor':
      return 'schedule.card.sourceSensor';
    case 'camera':
      return 'schedule.card.sourceCamera';
    case 'device':
      return 'schedule.card.sourceDevice';
  }
}

export const AutomationCard = React.memo(function AutomationCard({ rule, onSetPaused }: AutomationCardProps) {
  const { t } = useTranslation();
  const subject = rule.source.signal ?? rule.source.device_id ?? t(sourceKey(rule.source.kind));
  const { op, value } = rule.condition ?? {};
  const trigger =
    op && value != null
      ? t('schedule.card.whenCompared', { subject, op: opSymbol(op), value })
      : t('schedule.card.when', { subject });

  return (
    <InkCard style={rule.paused ? styles.paused : undefined}>
      <View style={styles.top}>
        <View style={styles.title}>
          <InkText weight="semibold">{rule.name}</InkText>
          <InkText size="sm" tone="secondary">
            {trigger} · {t('schedule.card.actions', { count: rule.actions.length })}
          </InkText>
        </View>
        <InkBadge tone="neutral">{t(sourceKey(rule.source.kind))}</InkBadge>
      </View>

      <View style={styles.status}>
        {rule.currently_running ? (
          <InkBadge tone="brand">{t('schedule.card.running')}</InkBadge>
        ) : (
          <InkText size="sm" tone="tertiary">
            {rule.last_fired
              ? t('schedule.card.lastFired', { when: formatScheduleTime(rule.last_fired) })
              : t('schedule.card.neverFired')}
          </InkText>
        )}
        <InkText size="sm" tone="tertiary">
          {t('schedule.card.cooldown', { seconds: rule.cooldown_secs })}
        </InkText>
      </View>

      <View style={styles.actions}>
        <InkSwitch
          label={rule.paused ? t('schedule.card.paused') : t('schedule.card.enabled')}
          checked={!rule.paused}
          onChange={(on) => {
            void toggle();
            onSetPaused(rule, !on);
          }}
        />
      </View>
    </InkCard>
  );
});

const styles = StyleSheet.create({
  paused: { opacity: 0.6 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  title: { flex: 1, gap: Spacing.xs },
  status: { marginTop: Spacing.sm, gap: Spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.md },
});
