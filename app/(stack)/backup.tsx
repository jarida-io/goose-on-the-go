/**
 * BackupScreen — Backup status card, settings toggles, and history.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';

import { InkSwitch, InkButton } from '@jarida/ink/native';
import { GIcon } from '@/components/ui/g-icon';
import { Grey, JaridaPurple, Brand, Semantic } from '@/constants/colors';
import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';
import { Shadows } from '@/constants/shadows';

const BACKUP_HISTORY = [
  { date: 'Apr 26, 2026', size: '142 MB', status: 'complete' },
  { date: 'Apr 19, 2026', size: '138 MB', status: 'complete' },
  { date: 'Apr 12, 2026', size: '135 MB', status: 'complete' },
  { date: 'Apr 5, 2026', size: '131 MB', status: 'failed' },
];

export default function BackupScreen() {
  const [autoBackup, setAutoBackup] = useState(true);
  const [includeMedia, setIncludeMedia] = useState(true);
  const [includeMemories, setIncludeMemories] = useState(true);
  const [encryptBackup, setEncryptBackup] = useState(true);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Status card */}
      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <View style={styles.statusIconWrap}>
            <GIcon name="download" size={24} color={Semantic.success} />
          </View>
          <View style={styles.statusInfo}>
            <Text style={styles.statusTitle}>Last Backup</Text>
            <Text style={styles.statusDate}>Apr 26, 2026 at 3:00 AM</Text>
          </View>
        </View>
        <View style={styles.statusMeta}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Size</Text>
            <Text style={styles.metaValue}>142 MB</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Duration</Text>
            <Text style={styles.metaValue}>2m 14s</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Status</Text>
            <View style={[styles.statusBadge, { backgroundColor: Semantic.successSoft }]}>
              <Text style={[styles.statusBadgeText, { color: Semantic.success }]}>Complete</Text>
            </View>
          </View>
        </View>
        <InkButton variant="primary" icon={<GIcon name="download" size={16} color={Brand.white} />}>
          Backup Now
        </InkButton>
      </View>

      {/* Settings toggles */}
      <Text style={styles.sectionLabel}>BACKUP SETTINGS</Text>
      <View style={styles.settingsCard}>
        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingTitle}>Automatic Backup</Text>
            <Text style={styles.settingDesc}>Weekly at 3:00 AM</Text>
          </View>
          <InkSwitch checked={autoBackup} onChange={setAutoBackup} />
        </View>
        <View style={styles.divider} />
        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingTitle}>Include Media</Text>
            <Text style={styles.settingDesc}>Photos, videos, and analysis</Text>
          </View>
          <InkSwitch checked={includeMedia} onChange={setIncludeMedia} />
        </View>
        <View style={styles.divider} />
        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingTitle}>Include Memories</Text>
            <Text style={styles.settingDesc}>AI memories and preferences</Text>
          </View>
          <InkSwitch checked={includeMemories} onChange={setIncludeMemories} />
        </View>
        <View style={styles.divider} />
        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingTitle}>Encrypt Backup</Text>
            <Text style={styles.settingDesc}>AES-256 encryption</Text>
          </View>
          <InkSwitch checked={encryptBackup} onChange={setEncryptBackup} />
        </View>
      </View>

      {/* History */}
      <Text style={styles.sectionLabel}>BACKUP HISTORY</Text>
      {BACKUP_HISTORY.map((b, i) => {
        const isComplete = b.status === 'complete';
        return (
          <View key={i} style={styles.historyRow}>
            <View style={[styles.historyDot, { backgroundColor: isComplete ? Semantic.success : Semantic.danger }]} />
            <View style={styles.historyInfo}>
              <Text style={styles.historyDate}>{b.date}</Text>
              <Text style={styles.historySize}>{b.size}</Text>
            </View>
            <View style={[styles.historyBadge, { backgroundColor: isComplete ? Semantic.successSoft : Semantic.dangerSoft }]}>
              <Text style={[styles.historyBadgeText, { color: isComplete ? Semantic.success : Semantic.danger }]}>
                {b.status}
              </Text>
            </View>
          </View>
        );
      })}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Grey[50] },
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },

  /* Status card */
  statusCard: {
    backgroundColor: Brand.white,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Grey[200],
    marginBottom: Spacing.xl,
    ...Shadows.sm,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  statusIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Semantic.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  statusInfo: {},
  statusTitle: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Brand.charcoal,
  },
  statusDate: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[500],
    marginTop: 2,
  },
  statusMeta: {
    flexDirection: 'row',
    marginBottom: Spacing.lg,
    gap: Spacing.xl,
  },
  metaItem: {},
  metaLabel: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Grey[400],
  },
  metaValue: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Brand.charcoal,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.pill,
    marginTop: 2,
  },
  statusBadgeText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },

  /* Section label */
  sectionLabel: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Grey[500],
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
  },

  /* Settings card */
  settingsCard: {
    backgroundColor: Brand.white,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Grey[200],
    marginBottom: Spacing.xl,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  settingTitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
    color: Brand.charcoal,
  },
  settingDesc: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[500],
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Grey[100],
    marginVertical: Spacing.sm,
  },

  /* History */
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Brand.white,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Grey[200],
    marginBottom: Spacing.sm,
  },
  historyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.md,
  },
  historyInfo: { flex: 1 },
  historyDate: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Brand.charcoal,
  },
  historySize: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Grey[500],
    marginTop: 2,
  },
  historyBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  historyBadgeText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
});
