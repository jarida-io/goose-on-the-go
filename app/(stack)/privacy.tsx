/**
 * PrivacyScreen: a summary of what happens to a household's data, on this phone, on the Pond and
 * beyond the home; the choices a household has; and the full privacy policy, terms of use and
 * open-source licenses. The structure is `constants/privacy.ts`, and `docs/PRIVACY-SCREEN.md`
 * keeps the evidence for each statement. The one live line is the town web search sends, which
 * the Pond reports while Nearby places is on.
 */

import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InkTitle } from '@/components/ui/ink';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

import { GIcon } from '@/components/ui/g-icon';
import { AccentIcon } from '@/components/ui/accent-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { Grey } from '@/constants/colors';
import { FontSize, face } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';
import { DATA_RIGHTS, PRIVACY_DOCUMENTS, PRIVACY_GROUPS, type PrivacySection } from '@/constants/privacy';
import { componentCount } from '@/models/open-source';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/colors';
import { usePrivacy } from '@/view-models/use-privacy';

/** Expandable section. `extra` is a live sentence after the fixed copy. */
function ExpandableSection({ section, extra }: { section: PrivacySection; extra?: string | null }) {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <GPressable
      feedback="lift"
      style={styles.section}
      onPress={() => setExpanded(!expanded)}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
    >
      <View style={styles.sectionHeader}>
        <View style={{ marginRight: Spacing.md }}>
          <AccentIcon name={section.icon} size={16} />
        </View>
        <Text style={styles.sectionTitle}>{t(section.titleKey)}</Text>
        <View style={expanded ? { transform: [{ rotate: '180deg' }] } : undefined}>
          <GIcon name="chevron" size={16} color={Grey[400]} />
        </View>
      </View>
      {expanded && (
        <View style={styles.sectionContent}>
          {/* The copy keeps its paragraphs apart with a blank line; each is its own block. */}
          {[...t(section.bodyKey).split('\n\n'), ...(extra ? [extra] : [])].map((paragraph, i) => (
            <Text key={i} style={[styles.sectionText, i > 0 && styles.paragraphGap]}>
              {paragraph}
            </Text>
          ))}
        </View>
      )}
    </GPressable>
  );
}

export default function PrivacyScreen() {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  const { data } = usePrivacy();
  const router = useRouter();
  const townLine = data.nearbyTown ? t('webSearch.townSentence', { town: data.nearbyTown }) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.intro}>{t('privacy.intro')}</Text>

      {/* What happens to the data, where it is handled: this phone, the Pond, beyond the home. */}
      {PRIVACY_GROUPS.map((g) => (
        <View key={g.id} style={styles.group}>
          <InkTitle level={3}>{t(g.headingKey)}</InkTitle>
          {g.sections.map((s) => (
            <ExpandableSection key={s.id} section={s} extra={s.id === 'network' ? townLine : null} />
          ))}
        </View>
      ))}

      {/* Choices. Statements, not buttons: these rows used to be Pressables with a chevron and no
          handler, offering five rights of which none worked. Each now names where it is done. */}
      <View style={styles.group}>
        <InkTitle level={3}>{t('privacy.rightsHeading')}</InkTitle>
        <View style={styles.card}>
          {DATA_RIGHTS.map((r, i) => (
            <View key={r.key} style={[styles.rightRow, i < DATA_RIGHTS.length - 1 && styles.divider]}>
              <View style={styles.rightIcon}>
                <AccentIcon name={r.icon} size={16} />
              </View>
              <Text style={styles.rightText}>{t(r.key)}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* The full documents. The summary above is what a household needs at a glance; these are
          what the stores and the law ask for, in full, and every open-source licence. */}
      <View style={styles.group}>
        <InkTitle level={3}>{t('privacy.documentsHeading')}</InkTitle>
        <View style={styles.card}>
          {PRIVACY_DOCUMENTS.map((d, i) => (
            <GPressable
              key={d.id}
              feedback="lift"
              style={[styles.documentRow, i < PRIVACY_DOCUMENTS.length - 1 && styles.divider]}
              onPress={() => router.push(d.route)}
              accessibilityRole="link"
            >
              <View style={{ marginRight: Spacing.md }}>
                <AccentIcon name={d.icon} size={16} />
              </View>
              <View style={styles.documentText}>
                <Text style={styles.licenseName}>{t(d.titleKey)}</Text>
                <Text style={styles.documentHint}>{t(d.hintKey, { count: componentCount() })}</Text>
              </View>
              <GIcon name="chevron-right" size={16} color={Grey[400]} />
            </GPressable>
          ))}
        </View>
      </View>

      <View style={{ height: Spacing['2xl'] }} />
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
    intro: {
      ...face('body', 'regular'),
      fontSize: FontSize.sm,
      color: c.textSecondary,
      lineHeight: FontSize.sm * 1.6,
    },
    group: { marginTop: Spacing.lg },

    /* Expandable sections */
    section: {
      backgroundColor: c.card,
      borderRadius: Radii.xl,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: Spacing.sm,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    sectionTitle: {
      flex: 1,
      ...face('display', 'semibold'),
      fontSize: FontSize.base,
      color: c.text,
    },
    sectionContent: {
      marginTop: Spacing.md,
      paddingTop: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    sectionText: {
      ...face('body', 'regular'),
      fontSize: FontSize.sm,
      color: c.textSecondary,
      lineHeight: FontSize.sm * 1.6,
    },
    paragraphGap: { marginTop: Spacing.sm },

    /* Cards of rows: choices and documents */
    card: {
      backgroundColor: c.card,
      borderRadius: Radii.xl,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.xs,
      borderWidth: 1,
      borderColor: c.border,
    },
    divider: {
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    rightRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: Spacing.md,
    },
    rightIcon: { marginRight: Spacing.md, marginTop: 2 },
    rightText: {
      flex: 1,
      ...face('body', 'regular'),
      fontSize: FontSize.sm,
      color: c.text,
      lineHeight: FontSize.sm * 1.6,
    },
    documentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.md,
    },
    documentText: { flex: 1 },
    documentHint: {
      ...face('body', 'regular'),
      fontSize: FontSize.sm,
      color: c.textSecondary,
      marginTop: 2,
    },
    licenseName: {
      ...face('body', 'regular'),
      fontSize: FontSize.base,
      color: c.text,
    },
  });
