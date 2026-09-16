/**
 * ProfileHub — "You" tab with profile card, stats, and grouped settings.
 *
 * Charcoal top band with avatar, overlapping stats row,
 * iOS-style grouped settings sections linking to sub-screens.
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GIcon } from '@/components/ui/g-icon';
import { PROFILE_NAV, type NavItem, type NavGroup } from '@/constants/navigation';
import { Grey, JaridaPurple, Brand, Semantic } from '@/constants/colors';
import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';
import { Shadows } from '@/constants/shadows';
import type { IconName } from '@/constants/icons';

/** Stats data */
const STATS = [
  { label: 'Devices', value: '6' },
  { label: 'Rooms', value: '3' },
  { label: 'Routines', value: '4' },
  { label: 'Users', value: '2' },
];

/** Navigation row */
const NavRow = React.memo(function NavRow({
  item,
  onPress,
}: {
  item: NavItem;
  onPress: (route: string) => void;
}) {
  const handlePress = useCallback(() => onPress(item.route), [item.route, onPress]);

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={handlePress}
    >
      <View style={styles.rowLeft}>
        <GIcon name={item.icon} size={16} color="#8C4BFF" />
        <Text style={styles.rowLabel}>{item.label}</Text>
      </View>
      <GIcon name="chevron" size={16} color={Grey[400]} />
    </Pressable>
  );
});

/** SectionList sections from PROFILE_NAV */
const sections = PROFILE_NAV.map((g) => ({
  title: g.group,
  data: g.items,
}));

export default function ProfileHub() {
  const router = useRouter();

  const handleNav = useCallback(
    (route: string) => {
      router.push(route as any);
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: NavItem }) => <NavRow item={item} onPress={handleNav} />,
    [handleNav],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string } }) => (
      <Text style={styles.sectionHeader}>{section.title}</Text>
    ),
    [],
  );

  const keyExtractor = useCallback((item: NavItem) => item.id, []);

  const ListHeader = useCallback(
    () => (
      <>
        {/* Charcoal top band + profile card */}
        <View style={styles.profileCard}>
          <View style={styles.charcoalBand} />
          <View style={styles.profileContent}>
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarLargeText}>J</Text>
            </View>
            <Text style={styles.profileName}>Jerry Ochieng</Text>
            <Text style={styles.profileEmail}>jerryochieng178@gmail.com</Text>
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>Jarida Team</Text>
            </View>
          </View>

          {/* Overlapping stats row */}
          <View style={styles.statsRow}>
            {STATS.map((stat) => (
              <View key={stat.label} style={styles.statItem}>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </>
    ),
    [],
  );

  const ListFooter = useCallback(
    () => (
      <View style={styles.footerSection}>
        <Pressable style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
        <Text style={styles.versionText}>Goose on the Go v0.2.0</Text>
        {/* Bottom spacer for tab bar */}
        <View style={{ height: 100 }} />
      </View>
    ),
    [],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <SectionList
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Grey[50] },
  listContent: { paddingHorizontal: Spacing.lg },

  /* Profile card */
  profileCard: {
    backgroundColor: Brand.white,
    borderRadius: Radii.xl,
    overflow: 'hidden',
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Grey[200],
    ...Shadows.md,
  },
  charcoalBand: {
    height: 80,
    backgroundColor: Brand.charcoal,
  },
  profileContent: {
    alignItems: 'center',
    marginTop: -36,
    paddingBottom: Spacing.md,
  },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: JaridaPurple[500],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: Brand.white,
  },
  avatarLargeText: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
    color: Brand.white,
  },
  profileName: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Brand.charcoal,
    marginTop: Spacing.sm,
  },
  profileEmail: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[500],
    marginTop: 2,
  },
  proBadge: {
    backgroundColor: JaridaPurple[50],
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radii.pill,
    marginTop: Spacing.sm,
  },
  proBadgeText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: JaridaPurple[600],
  },

  /* Stats row */
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    backgroundColor: Grey[50],
    borderRadius: Radii.lg,
    paddingVertical: Spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Brand.charcoal,
  },
  statLabel: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Grey[500],
    marginTop: 2,
  },

  /* Section headers */
  sectionHeader: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Grey[500],
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },

  /* Nav rows */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginBottom: 1,
    backgroundColor: Brand.white,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Grey[200],
    marginTop: Spacing.xs,
  },
  rowPressed: {
    backgroundColor: JaridaPurple[50],
    borderColor: JaridaPurple[200],
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  rowLabel: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
    color: Brand.charcoal,
  },

  /* Footer */
  footerSection: {
    alignItems: 'center',
    marginTop: Spacing['3xl'],
  },
  signOutBtn: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing['3xl'],
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Semantic.danger,
  },
  signOutText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Semantic.danger,
  },
  versionText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Grey[400],
    marginTop: Spacing.lg,
  },
});
