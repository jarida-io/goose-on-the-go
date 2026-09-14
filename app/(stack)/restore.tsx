/**
 * RestoreScreen — Backup selection, transfer progress, completion.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';

import { GIcon } from '@/components/ui/g-icon';
import { GButton } from '@/components/ui/g-button';
import { Grey, JaridaPurple, AccentPurple, Brand, Semantic } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';

type RestoreState = 'select' | 'progress' | 'complete';

interface BackupItem {
  id: string;
  date: string;
  size: string;
  devices: number;
  rooms: number;
}

const BACKUPS: BackupItem[] = [
  { id: '1', date: 'Apr 26, 2026', size: '142 MB', devices: 6, rooms: 4 },
  { id: '2', date: 'Apr 19, 2026', size: '138 MB', devices: 6, rooms: 4 },
  { id: '3', date: 'Apr 12, 2026', size: '135 MB', devices: 5, rooms: 3 },
];

export default function RestoreScreen() {
  const [state, setState] = useState<RestoreState>('select');
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const handleRestore = useCallback(() => {
    if (!selectedBackup) return;
    setState('progress');
    setProgress(0);

    // Simulate progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setState('complete');
          return 100;
        }
        return prev + 5;
      });
    }, 200);
  }, [selectedBackup]);

  const handleDone = useCallback(() => {
    setState('select');
    setSelectedBackup(null);
    setProgress(0);
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {state === 'select' && (
        <>
          {/* Info */}
          <View style={styles.infoBanner}>
            <GIcon name="refresh" size={18} color={JaridaPurple[600]} />
            <Text style={styles.infoText}>
              Restore your Pond device from a previous backup. This will replace current settings, memories, and device configurations.
            </Text>
          </View>

          {/* Backup selection */}
          <Text style={styles.sectionLabel}>SELECT A BACKUP</Text>
          {BACKUPS.map((b) => (
            <Pressable
              key={b.id}
              style={[styles.backupCard, selectedBackup === b.id && styles.backupCardSelected]}
              onPress={() => setSelectedBackup(b.id)}
            >
              <View style={styles.backupHeader}>
                <View style={styles.radioOuter}>
                  {selectedBackup === b.id && <View style={styles.radioInner} />}
                </View>
                <View style={styles.backupInfo}>
                  <Text style={styles.backupDate}>{b.date}</Text>
                  <Text style={styles.backupSize}>{b.size}</Text>
                </View>
              </View>
              <View style={styles.backupMeta}>
                <View style={styles.metaChip}>
                  <Text style={styles.metaText}>{b.devices} devices</Text>
                </View>
                <View style={styles.metaChip}>
                  <Text style={styles.metaText}>{b.rooms} rooms</Text>
                </View>
              </View>
            </Pressable>
          ))}

          <GButton
            variant="primary"
            size="lg"
            onPress={handleRestore}
            disabled={!selectedBackup}
          >
            Restore from Backup
          </GButton>
        </>
      )}

      {state === 'progress' && (
        <View style={styles.progressWrap}>
          <GIcon name="refresh" size={28} color={AccentPurple} />
          <Text style={styles.progressTitle}>Restoring...</Text>
          <Text style={styles.progressDesc}>
            Transferring data to your Pond device. Do not disconnect power.
          </Text>
          <View style={styles.progressBarWrap}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressPercent}>{progress}%</Text>
          <View style={styles.progressSteps}>
            <View style={styles.progressStepRow}>
              {progress > 20
                ? <GIcon name="check" size={12} color="#1F8A3C" />
                : <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: '#D9D9D9' }} />}
              <Text style={[styles.progressStep, progress > 20 && styles.progressStepDone]}>Settings</Text>
            </View>
            <View style={styles.progressStepRow}>
              {progress > 50
                ? <GIcon name="check" size={12} color="#1F8A3C" />
                : <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: '#D9D9D9' }} />}
              <Text style={[styles.progressStep, progress > 50 && styles.progressStepDone]}>Memories</Text>
            </View>
            <View style={styles.progressStepRow}>
              {progress > 75
                ? <GIcon name="check" size={12} color="#1F8A3C" />
                : <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: '#D9D9D9' }} />}
              <Text style={[styles.progressStep, progress > 75 && styles.progressStepDone]}>Devices</Text>
            </View>
            <View style={styles.progressStepRow}>
              {progress >= 100
                ? <GIcon name="check" size={12} color="#1F8A3C" />
                : <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: '#D9D9D9' }} />}
              <Text style={[styles.progressStep, progress >= 100 && styles.progressStepDone]}>Routines</Text>
            </View>
          </View>
        </View>
      )}

      {state === 'complete' && (
        <View style={styles.completeWrap}>
          <GIcon name="sparkle" size={28} color="#1F8A3C" />
          <Text style={styles.completeTitle}>Restore Complete!</Text>
          <Text style={styles.completeDesc}>
            Your Pond device has been restored successfully. All settings, memories, and device configurations are back.
          </Text>
          <GButton variant="primary" size="lg" onPress={handleDone}>
            Done
          </GButton>
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Grey[50] },
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },

  /* Info banner */
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: JaridaPurple[50],
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  infoText: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: JaridaPurple[700],
    lineHeight: FontSize.sm * 1.5,
  },

  sectionLabel: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Grey[500],
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
  },

  /* Backup cards */
  backupCard: {
    backgroundColor: Brand.white,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Grey[200],
    marginBottom: Spacing.md,
  },
  backupCardSelected: {
    borderColor: AccentPurple,
    borderWidth: 2,
    backgroundColor: JaridaPurple[50] + '40',
  },
  backupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Grey[300],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: AccentPurple,
  },
  backupInfo: { flex: 1 },
  backupDate: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Brand.charcoal,
  },
  backupSize: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.sm,
    color: Grey[500],
    marginTop: 2,
  },
  backupMeta: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  metaChip: {
    backgroundColor: Grey[100],
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  metaText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Grey[600],
  },

  /* Progress */
  progressWrap: {
    alignItems: 'center',
    paddingVertical: Spacing['5xl'],
    gap: Spacing.lg,
  },
  progressTitle: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Brand.charcoal,
  },
  progressDesc: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Grey[500],
    textAlign: 'center',
    lineHeight: FontSize.base * 1.5,
  },
  progressBarWrap: {
    width: '100%',
    height: 8,
    backgroundColor: Grey[200],
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: AccentPurple,
    borderRadius: 4,
  },
  progressPercent: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: AccentPurple,
  },
  progressSteps: { gap: Spacing.sm, alignSelf: 'flex-start', width: '100%' },
  progressStepRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  progressStep: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Grey[400],
  },
  progressStepDone: { color: Semantic.success },

  /* Complete */
  completeWrap: {
    alignItems: 'center',
    paddingVertical: Spacing['5xl'],
    gap: Spacing.lg,
  },
  completeTitle: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Semantic.success,
  },
  completeDesc: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Grey[500],
    textAlign: 'center',
    lineHeight: FontSize.base * 1.5,
  },
});
