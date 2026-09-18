/**
 * AddUsersScreen — Household user cards with permissions and invite flow.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
} from 'react-native';

import { GIcon } from '@/components/ui/g-icon';
import { InkButton } from '@jarida/ink/native';
import { Grey, JaridaPurple, AccentPurple, Brand, Semantic } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';

interface HouseholdUser {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Member' | 'Guest';
  avatar: string;
  status: 'active' | 'pending';
}

const USERS: HouseholdUser[] = [
  { id: '1', name: 'Jerry Ochieng', email: 'jerry@jarida.ai', role: 'Owner', avatar: 'J', status: 'active' },
  { id: '2', name: 'Sam Kimani', email: 'sam@email.com', role: 'Admin', avatar: 'S', status: 'active' },
  { id: '3', name: 'Guest User', email: 'guest@email.com', role: 'Guest', avatar: 'G', status: 'pending' },
];

const ROLE_COLORS: Record<string, string> = {
  Owner: AccentPurple,
  Admin: Semantic.info,
  Member: Semantic.success,
  Guest: Grey[500],
};

const PERMISSIONS = ['Control devices', 'View cameras', 'Manage routines', 'Edit settings', 'Invite users'];

/** User card */
const UserCard = React.memo(function UserCard({ user }: { user: HouseholdUser }) {
  const roleColor = ROLE_COLORS[user.role];
  return (
    <View style={styles.userCard}>
      <View style={styles.userHeader}>
        <View style={[styles.avatar, { backgroundColor: roleColor }]}>
          <Text style={styles.avatarText}>{user.avatar}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user.name}</Text>
          <Text style={styles.userEmail}>{user.email}</Text>
        </View>
        <View style={styles.badges}>
          <View style={[styles.roleBadge, { backgroundColor: roleColor + '18' }]}>
            <Text style={[styles.roleBadgeText, { color: roleColor }]}>{user.role}</Text>
          </View>
          {user.status === 'pending' && (
            <View style={[styles.roleBadge, { backgroundColor: Semantic.warningSoft }]}>
              <Text style={[styles.roleBadgeText, { color: Semantic.warning }]}>Pending</Text>
            </View>
          )}
        </View>
      </View>

      {/* Permissions */}
      <View style={styles.permissionsRow}>
        {PERMISSIONS.slice(0, user.role === 'Owner' ? 5 : user.role === 'Admin' ? 4 : 2).map((p) => (
          <View key={p} style={styles.permBadge}>
            <Text style={styles.permText}>{p}</Text>
          </View>
        ))}
      </View>

      {/* Actions */}
      {user.role !== 'Owner' && (
        <View style={styles.actionsRow}>
          <Pressable style={styles.actionBtn}>
            <GIcon name="edit" size={14} color={Grey[500]} />
            <Text style={styles.actionText}>Edit</Text>
          </Pressable>
          <Pressable style={styles.actionBtn}>
            <GIcon name="trash" size={14} color={Semantic.danger} />
            <Text style={[styles.actionText, { color: Semantic.danger }]}>Remove</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
});

export default function AddUsersScreen() {
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState('');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.sectionLabel}>HOUSEHOLD MEMBERS</Text>
      {USERS.map((u) => (
        <UserCard key={u.id} user={u} />
      ))}

      {/* Invite section */}
      {showInvite ? (
        <View style={styles.inviteCard}>
          <Text style={styles.inviteTitle}>Invite New Member</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <TextInput
              style={styles.textInput}
              value={email}
              onChangeText={setEmail}
              placeholder="name@email.com"
              placeholderTextColor={Grey[400]}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          <View style={styles.inviteActions}>
            <InkButton variant="quiet" onPress={() => setShowInvite(false)}>
              Cancel
            </InkButton>
            <InkButton variant="primary" onPress={() => { setShowInvite(false); setEmail(''); }}>
              Send Invite
            </InkButton>
          </View>
        </View>
      ) : (
        <Pressable style={styles.addBtn} onPress={() => setShowInvite(true)}>
          <GIcon name="plus" size={16} color={AccentPurple} />
          <Text style={styles.addBtnText}>Invite Member</Text>
        </Pressable>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Grey[50] },
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },

  sectionLabel: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Grey[500],
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
  },

  /* User card */
  userCard: {
    backgroundColor: Brand.white,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Grey[200],
    marginBottom: Spacing.md,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  avatarText: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Brand.white,
  },
  userInfo: { flex: 1 },
  userName: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Brand.charcoal,
  },
  userEmail: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[500],
    marginTop: 2,
  },
  badges: { gap: 4 },
  roleBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.pill,
    alignSelf: 'flex-end',
  },
  roleBadgeText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },

  /* Permissions */
  permissionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Grey[100],
  },
  permBadge: {
    backgroundColor: Grey[100],
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  permText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Grey[600],
  },

  /* Actions */
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Grey[100],
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  actionText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: Grey[500],
  },

  /* Add button */
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    borderRadius: Radii.xl,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: JaridaPurple[200],
    backgroundColor: JaridaPurple[50],
  },
  addBtnText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: AccentPurple,
  },

  /* Invite card */
  inviteCard: {
    backgroundColor: Brand.white,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: JaridaPurple[200],
  },
  inviteTitle: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Brand.charcoal,
    marginBottom: Spacing.md,
  },
  inputGroup: { marginBottom: Spacing.md },
  inputLabel: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Grey[700],
    marginBottom: Spacing.xs,
  },
  textInput: {
    backgroundColor: Grey[50],
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Grey[200],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Brand.charcoal,
  },
  inviteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
  },
});
