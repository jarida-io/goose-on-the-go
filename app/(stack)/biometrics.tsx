/**
 * BiometricsScreen — Face Recognition + Voice Recognition setup
 * with enrollment flows.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';

import { GIcon } from '@/components/ui/g-icon';
import { GButton } from '@/components/ui/g-button';
import { GSwitch } from '@/components/ui/g-switch';
import { Grey, JaridaPurple, AccentPurple, Brand, Semantic } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';


type EnrollState = 'not_enrolled' | 'enrolling' | 'enrolled';

interface BiometricMethod {
  id: string;
  title: string;
  description: string;
  icon: string;
  state: EnrollState;
  enabled: boolean;
}

export default function BiometricsScreen() {
  const [methods, setMethods] = useState<BiometricMethod[]>([
    {
      id: 'face',
      title: 'Face Recognition',
      description: 'Identify household members by face using the Pond camera. Works locally — no cloud processing.',
      icon: 'face',
      state: 'enrolled',
      enabled: true,
    },
    {
      id: 'voice',
      title: 'Voice Recognition',
      description: 'Identify who is speaking to personalize responses and apply per-user permissions.',
      icon: 'mic',
      state: 'not_enrolled',
      enabled: false,
    },
  ]);

  const toggleMethod = (id: string) => {
    setMethods((prev) =>
      prev.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)),
    );
  };

  const startEnrollment = (id: string) => {
    setMethods((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, state: 'enrolling' } : m,
      ),
    );
    // Simulate enrollment completing after 2s
    setTimeout(() => {
      setMethods((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, state: 'enrolled', enabled: true } : m,
        ),
      );
    }, 2000);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Info banner */}
      <View style={styles.infoBanner}>
        <GIcon name="shield" size={18} color={JaridaPurple[600]} />
        <Text style={styles.infoText}>
          Biometric data is stored locally on your Pond device and never uploaded to the cloud.
        </Text>
      </View>

      {/* Biometric methods */}
      <Text style={styles.sectionLabel}>BIOMETRIC METHODS</Text>
      {methods.map((method) => (
        <View key={method.id} style={styles.methodCard}>
          <View style={styles.methodHeader}>
            <View style={{ marginRight: Spacing.md }}>
              <GIcon name={method.icon} size={28} color={AccentPurple} />
            </View>
            <View style={styles.methodInfo}>
              <Text style={styles.methodTitle}>{method.title}</Text>
              <Text style={styles.methodDesc}>{method.description}</Text>
            </View>
            <GSwitch
              value={method.enabled}
              onValueChange={() => toggleMethod(method.id)}
            />
          </View>

          {/* Enrollment status */}
          <View style={styles.enrollSection}>
            {method.state === 'enrolled' ? (
              <View style={styles.enrolledRow}>
                <View style={[styles.statusBadge, { backgroundColor: Semantic.successSoft }]}>
                  <Text style={[styles.statusText, { color: Semantic.success }]}>Enrolled</Text>
                </View>
                <Pressable style={styles.reEnrollBtn}>
                  <GIcon name="refresh" size={14} color={AccentPurple} />
                  <Text style={styles.reEnrollText}>Re-enroll</Text>
                </Pressable>
              </View>
            ) : method.state === 'enrolling' ? (
              <View style={styles.enrollingRow}>
                <View style={styles.progressBar}>
                  <View style={styles.progressFill} />
                </View>
                <Text style={styles.enrollingText}>Enrolling...</Text>
              </View>
            ) : (
              <GButton
                variant="secondary"
                size="sm"
                onPress={() => startEnrollment(method.id)}
              >
                Start Enrollment
              </GButton>
            )}
          </View>

          {/* Enrollment steps hint */}
          {method.state === 'not_enrolled' && (
            <View style={styles.stepsHint}>
              <Text style={styles.stepsTitle}>Setup requires:</Text>
              {method.id === 'face' ? (
                <>
                  <Text style={styles.stepItem}>{'\u2022'} Face the Pond camera</Text>
                  <Text style={styles.stepItem}>{'\u2022'} Turn head slowly left and right</Text>
                  <Text style={styles.stepItem}>{'\u2022'} Takes about 10 seconds</Text>
                </>
              ) : (
                <>
                  <Text style={styles.stepItem}>{'\u2022'} Read 3 sample phrases aloud</Text>
                  <Text style={styles.stepItem}>{'\u2022'} Speak in your normal voice</Text>
                  <Text style={styles.stepItem}>{'\u2022'} Takes about 30 seconds</Text>
                </>
              )}
            </View>
          )}
        </View>
      ))}

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

  /* Method card */
  methodCard: {
    backgroundColor: Brand.white,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Grey[200],
    marginBottom: Spacing.md,
  },
  methodHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  methodInfo: { flex: 1, marginRight: Spacing.sm },
  methodTitle: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Brand.charcoal,
  },
  methodDesc: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[500],
    lineHeight: FontSize.sm * 1.5,
    marginTop: 4,
  },

  /* Enrollment section */
  enrollSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Grey[100],
  },
  enrolledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radii.pill,
  },
  statusText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  reEnrollBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  reEnrollText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: AccentPurple,
  },

  /* Enrolling */
  enrollingRow: { gap: Spacing.sm },
  progressBar: {
    height: 6,
    backgroundColor: Grey[200],
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    width: '60%',
    height: '100%',
    backgroundColor: AccentPurple,
    borderRadius: 3,
  },
  enrollingText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: JaridaPurple[600],
    fontWeight: FontWeight.medium,
  },

  /* Steps hint */
  stepsHint: {
    marginTop: Spacing.md,
    backgroundColor: Grey[50],
    borderRadius: Radii.lg,
    padding: Spacing.md,
  },
  stepsTitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Grey[600],
    marginBottom: Spacing.xs,
  },
  stepItem: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[500],
    lineHeight: FontSize.sm * 1.7,
  },
});
