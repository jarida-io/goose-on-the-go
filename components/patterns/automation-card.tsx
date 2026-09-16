/**
 * AutomationCard — one sensor-triggered rule: source/condition summary,
 * running/last-fired status, pause switch, cooldown hint.
 *
 * No "run now" here — unlike /schedules, the backend's /rules API has no
 * run-now endpoint; rules only fire via the rules engine matching a real
 * sensor event.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GCard } from '@/components/ui/g-card';
import { GChip } from '@/components/ui/g-chip';
import { GSwitch } from '@/components/ui/g-switch';
import type { RuleView } from '@/models/rule';
import { formatRelativeTime } from '@/utils/format-time';
import { Grey, Brand } from '@/constants/colors';
import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export interface AutomationCardProps {
  rule: RuleView;
  onTogglePause: (id: string, paused: boolean) => void;
  onEdit?: (id: string) => void;
}

const OP_SYMBOLS: Record<string, string> = {
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  eq: '=',
};

const SOURCE_LABELS: Record<RuleView['source']['kind'], string> = {
  sensor: 'Sensor',
  camera: 'Camera',
  device: 'Device',
};

function summarizeRule(rule: RuleView): string {
  const subject = rule.source.signal ?? rule.source.device_id ?? rule.source.kind;
  let condText = '';
  if (rule.condition?.op && rule.condition.value != null) {
    condText = ` ${OP_SYMBOLS[rule.condition.op] ?? rule.condition.op} ${rule.condition.value}`;
  }
  const actionsText = rule.actions.length === 1 ? '1 action' : `${rule.actions.length} actions`;
  return `When ${subject}${condText} → ${actionsText}`;
}

export const AutomationCard = React.memo(function AutomationCard({
  rule,
  onTogglePause,
  onEdit,
}: AutomationCardProps) {
  return (
    <GCard style={[styles.card, rule.paused && styles.cardPaused]}>
      {/*
        Only this top block is wrapped in a Pressable — the switch below is a
        sibling, not a descendant, of it. See schedule-card.tsx for why: a
        switch nested inside the same Pressable let taps bubble up and also
        trigger "edit" on web, confirmed against a live paired backend.
      */}
      <Pressable onPress={() => onEdit?.(rule.id)}>
        <View style={styles.topRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.label} numberOfLines={1}>{rule.name}</Text>
            <Text style={styles.subtitle} numberOfLines={2}>{summarizeRule(rule)}</Text>
          </View>
          <GChip variant="secondary" startIcon="activity" size="sm">
            {SOURCE_LABELS[rule.source.kind]}
          </GChip>
        </View>

        <View style={styles.statusRow}>
          {rule.currently_running ? (
            <GChip variant="primary" startIcon="activity" size="sm">Running…</GChip>
          ) : (
            <Text style={styles.statusText}>
              {rule.last_fired ? `Last fired ${formatRelativeTime(rule.last_fired)}` : 'Never fired'}
            </Text>
          )}
          <Text style={styles.cooldownText}>Cooldown: {rule.cooldown_secs}s</Text>
        </View>
      </Pressable>

      <View style={styles.actionsRow}>
        <GSwitch
          value={!rule.paused}
          onValueChange={(nextEnabled) => onTogglePause(rule.id, !nextEnabled)}
        />
      </View>
    </GCard>
  );
});

const styles = StyleSheet.create({
  card: {
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  cardPaused: {
    opacity: 0.55,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleBlock: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  label: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Brand.charcoal,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[500],
    marginTop: 2,
  },
  statusRow: {
    marginTop: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Grey[500],
  },
  cooldownText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Grey[400],
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
});
