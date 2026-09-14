/**
 * PrivacyScreen — Expandable privacy sections, data rights, licence list.
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
import { Grey, AccentPurple, Brand, Semantic } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';

interface PrivacySection {
  id: string;
  title: string;
  icon: string;
  content: string;
}

const PRIVACY_SECTIONS: PrivacySection[] = [
  { id: 'data', title: 'Data Collection', icon: 'activity', content: 'Goose collects voice commands, device interactions, and usage patterns to improve your experience. All data is processed on-device via Pond when possible. Cloud processing is only used when explicitly enabled.' },
  { id: 'storage', title: 'Data Storage', icon: 'server', content: 'Your data is stored locally on your Pond device with AES-256 encryption. Cloud backups are encrypted end-to-end. We never sell or share your personal data with third parties.' },
  { id: 'sharing', title: 'Third-Party Sharing', icon: 'link', content: 'MCP integrations (Uber, Glovo, Spotify) only receive the minimum data needed to fulfill your requests. API keys are stored encrypted and never leave your device.' },
  { id: 'voice', title: 'Voice Data', icon: 'mic', content: 'Voice recordings are processed locally by default. Recordings are not stored after transcription unless you enable voice history. Wake word detection runs entirely on-device.' },
  { id: 'biometric', title: 'Biometric Data', icon: 'shield', content: 'Face and voice biometric templates are stored only on your Pond device. Biometric data is never uploaded to the cloud and cannot be reverse-engineered into images or audio.' },
];

const DATA_RIGHTS = [
  'Download all your data',
  'Delete all stored memories',
  'Revoke third-party access',
  'Opt out of analytics',
  'Export conversation history',
];

const LICENSES = [
  { name: 'React Native', license: 'MIT' },
  { name: 'Expo', license: 'MIT' },
  { name: 'Whisper', license: 'MIT' },
  { name: 'Piper TTS', license: 'MIT' },
  { name: 'llama.cpp', license: 'MIT' },
  { name: 'react-native-svg', license: 'MIT' },
];

/** Expandable section */
function ExpandableSection({ section }: { section: PrivacySection }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Pressable
      style={styles.section}
      onPress={() => setExpanded(!expanded)}
    >
      <View style={styles.sectionHeader}>
        <View style={{ marginRight: Spacing.md }}>
          <GIcon name={section.icon} size={16} color={AccentPurple} />
        </View>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <View style={expanded ? { transform: [{ rotate: '180deg' }] } : undefined}>
          <GIcon name="chevron" size={16} color="#B5B5B5" />
        </View>
      </View>
      {expanded && (
        <Text style={styles.sectionContent}>{section.content}</Text>
      )}
    </Pressable>
  );
}

export default function PrivacyScreen() {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Privacy sections */}
      <Text style={styles.label}>PRIVACY POLICY</Text>
      {PRIVACY_SECTIONS.map((s) => (
        <ExpandableSection key={s.id} section={s} />
      ))}

      {/* Data rights */}
      <Text style={styles.label}>YOUR DATA RIGHTS</Text>
      <View style={styles.rightsCard}>
        {DATA_RIGHTS.map((right, i) => (
          <Pressable key={i} style={styles.rightRow}>
            <Text style={styles.rightText}>{right}</Text>
            <GIcon name="chevron" size={16} color={Grey[400]} />
          </Pressable>
        ))}
      </View>

      {/* Licenses */}
      <Text style={styles.label}>OPEN SOURCE LICENSES</Text>
      <View style={styles.licensesCard}>
        {LICENSES.map((l, i) => (
          <View key={i} style={[styles.licenseRow, i < LICENSES.length - 1 && styles.licenseDivider]}>
            <Text style={styles.licenseName}>{l.name}</Text>
            <View style={styles.licenseBadge}>
              <Text style={styles.licenseText}>{l.license}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Grey[50] },
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },

  label: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Grey[500],
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },

  /* Expandable sections */
  section: {
    backgroundColor: Brand.white,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Grey[200],
    marginBottom: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontFamily: FontFamily.heading,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Brand.charcoal,
  },
  sectionContent: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[600],
    lineHeight: FontSize.sm * 1.6,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Grey[100],
  },

  /* Rights */
  rightsCard: {
    backgroundColor: Brand.white,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Grey[200],
    overflow: 'hidden',
  },
  rightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Grey[100],
  },
  rightText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Brand.charcoal,
  },

  /* Licenses */
  licensesCard: {
    backgroundColor: Brand.white,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Grey[200],
  },
  licenseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  licenseDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Grey[100],
    paddingBottom: Spacing.sm,
  },
  licenseName: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Brand.charcoal,
  },
  licenseBadge: {
    backgroundColor: Grey[100],
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  licenseText: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Grey[600],
  },
});
