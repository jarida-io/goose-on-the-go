/**
 * AppManagementScreen — MCP app integration cards with API key management.
 *
 * Cards for each integrated service with toggle and API key input.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
} from 'react-native';

import { GSwitch } from '@/components/ui/g-switch';
import { GIcon } from '@/components/ui/g-icon';
import { Grey, AccentPurple, Brand, Semantic } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';

interface AppIntegration {
  id: string;
  name: string;
  icon: string;
  description: string;
  enabled: boolean;
  hasApiKey: boolean;
  category: string;
}

const APPS: AppIntegration[] = [
  { id: 'uber', name: 'Uber', icon: 'device', description: 'Ride requests and estimates', enabled: true, hasApiKey: true, category: 'Transport' },
  { id: 'glovo', name: 'Glovo', icon: 'package', description: 'Food and grocery delivery', enabled: true, hasApiKey: true, category: 'Delivery' },
  { id: 'spotify', name: 'Spotify', icon: 'music', description: 'Music playback and playlists', enabled: true, hasApiKey: true, category: 'Media' },
  { id: 'gcal', name: 'Google Calendar', icon: 'calendar', description: 'Events and scheduling', enabled: true, hasApiKey: false, category: 'Productivity' },
  { id: 'notion', name: 'Notion', icon: 'edit', description: 'Notes and task management', enabled: false, hasApiKey: false, category: 'Productivity' },
  { id: 'hue', name: 'Philips Hue', icon: 'light', description: 'Smart lighting control', enabled: true, hasApiKey: true, category: 'Smart Home' },
];

/** App card */
const AppCard = React.memo(function AppCard({
  app,
  onToggle,
}: {
  app: AppIntegration;
  onToggle: (id: string) => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState(app.hasApiKey ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : '');

  return (
    <View style={styles.appCard}>
      <View style={styles.appHeader}>
        <View style={{ marginRight: Spacing.md }}>
          <GIcon name={app.icon} size={24} color={AccentPurple} />
        </View>
        <View style={styles.appInfo}>
          <Text style={styles.appName}>{app.name}</Text>
          <Text style={styles.appDesc}>{app.description}</Text>
        </View>
        <GSwitch value={app.enabled} onValueChange={() => onToggle(app.id)} />
      </View>

      {/* API key row */}
      {app.enabled && (
        <View style={styles.apiKeyRow}>
          <Text style={styles.apiKeyLabel}>API Key</Text>
          <View style={styles.apiKeyInput}>
            <TextInput
              style={styles.apiKeyText}
              value={apiKey}
              onChangeText={setApiKey}
              secureTextEntry={!showKey}
              placeholder="Enter API key..."
              placeholderTextColor={Grey[400]}
            />
            <Pressable onPress={() => setShowKey(!showKey)}>
              <Text style={styles.showHideText}>{showKey ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Category badge */}
      <View style={styles.categoryRow}>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>{app.category}</Text>
        </View>
        {app.hasApiKey && app.enabled && (
          <View style={[styles.statusBadge, { backgroundColor: Semantic.successSoft }]}>
            <Text style={[styles.statusText, { color: Semantic.success }]}>Connected</Text>
          </View>
        )}
      </View>
    </View>
  );
});

export default function AppManagementScreen() {
  const [apps, setApps] = useState(APPS);

  const handleToggle = useCallback((id: string) => {
    setApps((prev) =>
      prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)),
    );
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.sectionLabel}>CONNECTED APPS</Text>
      {apps.map((app) => (
        <AppCard key={app.id} app={app} onToggle={handleToggle} />
      ))}
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

  /* App card */
  appCard: {
    backgroundColor: Brand.white,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Grey[200],
    marginBottom: Spacing.md,
  },
  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appInfo: { flex: 1 },
  appName: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Brand.charcoal,
  },
  appDesc: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[500],
    marginTop: 2,
  },

  /* API key */
  apiKeyRow: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Grey[100],
  },
  apiKeyLabel: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Grey[500],
    marginBottom: Spacing.xs,
  },
  apiKeyInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Grey[100],
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  apiKeyText: {
    flex: 1,
    fontFamily: FontFamily.mono,
    fontSize: FontSize.sm,
    color: Brand.charcoal,
  },
  showHideText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: AccentPurple,
  },

  /* Category */
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  categoryBadge: {
    backgroundColor: Grey[100],
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  categoryText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Grey[600],
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.pill,
  },
  statusText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
});
