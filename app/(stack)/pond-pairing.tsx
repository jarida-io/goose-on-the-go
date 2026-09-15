/**
 * PondPairingScreen — 4-step wizard (Find -> WiFi -> Name -> Done).
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Animated,
} from 'react-native';

import { useRouter } from 'expo-router';
import { GIcon } from '@/components/ui/g-icon';
import { InkButton } from '@jarida/ink/native';
import { Grey, JaridaPurple, AccentPurple, Brand, Semantic } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';


type Step = 0 | 1 | 2 | 3;
const STEP_LABELS = ['Find Device', 'WiFi Setup', 'Name Device', 'Complete'];

/** Step indicator */
function StepIndicator({ current }: { current: Step }) {
  return (
    <View style={styles.stepRow}>
      {STEP_LABELS.map((label, i) => {
        const isActive = i === current;
        const isDone = i < current;
        return (
          <View key={label} style={styles.stepItem}>
            <View
              style={[
                styles.stepDot,
                isDone && styles.stepDotDone,
                isActive && styles.stepDotActive,
              ]}
            >
              {isDone ? (
                <GIcon name="check" size={14} color={Brand.white} />
              ) : (
                <Text style={[styles.stepNumber, isActive && styles.stepNumberActive]}>
                  {i + 1}
                </Text>
              )}
            </View>
            <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Step 0: Find Device */
function FindStep({ onNext }: { onNext: () => void }) {
  return (
    <View style={styles.stepContent}>
      <GIcon name="search" size={28} color={AccentPurple} />
      <Text style={styles.stepTitle}>Searching for Pond devices...</Text>
      <Text style={styles.stepDesc}>
        Make sure your Pond device is powered on and within Bluetooth range.
      </Text>
      <View style={styles.deviceFound}>
        <View style={styles.foundDot} />
        <Text style={styles.foundText}>Pond Hub v2 found</Text>
      </View>
      <InkButton variant="primary" onPress={onNext}>
        Connect
      </InkButton>
    </View>
  );
}

/** Step 1: WiFi Setup */
function WifiStep({ onNext }: { onNext: () => void }) {
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  return (
    <View style={styles.stepContent}>
      <GIcon name="wifi" size={28} color={AccentPurple} />
      <Text style={styles.stepTitle}>Connect to WiFi</Text>
      <Text style={styles.stepDesc}>
        Enter your home WiFi credentials so Pond can connect to the internet.
      </Text>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Network Name</Text>
        <TextInput
          style={styles.textInput}
          value={ssid}
          onChangeText={setSsid}
          placeholder="e.g., MyHomeWiFi"
          placeholderTextColor={Grey[400]}
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Password</Text>
        <TextInput
          style={styles.textInput}
          value={password}
          onChangeText={setPassword}
          placeholder="WiFi password"
          placeholderTextColor={Grey[400]}
          secureTextEntry
        />
      </View>
      <InkButton variant="primary" onPress={onNext}>
        Connect to WiFi
      </InkButton>
    </View>
  );
}

/** Step 2: Name Device */
function NameStep({ onNext }: { onNext: () => void }) {
  const [name, setName] = useState('');
  return (
    <View style={styles.stepContent}>
      <GIcon name="edit" size={28} color={AccentPurple} />
      <Text style={styles.stepTitle}>Name Your Device</Text>
      <Text style={styles.stepDesc}>
        Give your Pond device a friendly name so you can identify it later.
      </Text>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Device Name</Text>
        <TextInput
          style={styles.textInput}
          value={name}
          onChangeText={setName}
          placeholder="e.g., Living Room Pond"
          placeholderTextColor={Grey[400]}
        />
      </View>
      <InkButton variant="primary" onPress={onNext}>
        Save Name
      </InkButton>
    </View>
  );
}

/** Step 3: Complete */
function CompleteStep({ onDone }: { onDone: () => void }) {
  return (
    <View style={styles.stepContent}>
      <GIcon name="check" size={28} color={Semantic.success} />
      <Text style={styles.stepTitle}>All Set!</Text>
      <Text style={styles.stepDesc}>
        Your Pond device is connected and ready. Goose can now control your smart home devices.
      </Text>
      <InkButton variant="primary" onPress={onDone}>
        Go to Home
      </InkButton>
    </View>
  );
}

export default function PondPairingScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);

  const next = useCallback(() => {
    setStep((prev) => Math.min(prev + 1, 3) as Step);
  }, []);

  const done = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <View style={styles.container}>
      <StepIndicator current={step} />

      {step === 0 && <FindStep onNext={next} />}
      {step === 1 && <WifiStep onNext={next} />}
      {step === 2 && <NameStep onNext={next} />}
      {step === 3 && <CompleteStep onDone={done} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Grey[50],
    paddingHorizontal: Spacing.lg,
  },

  /* Step indicator */
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xl,
  },
  stepItem: { alignItems: 'center', flex: 1 },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Grey[200],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stepDotActive: { backgroundColor: AccentPurple },
  stepDotDone: { backgroundColor: Semantic.success },
  stepNumber: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Grey[500],
  },
  stepNumberActive: { color: Brand.white },
  stepLabel: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: Grey[500],
  },
  stepLabelActive: {
    color: JaridaPurple[600],
    fontWeight: FontWeight.semibold,
  },

  /* Step content */
  stepContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
  },
  stepTitle: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Brand.charcoal,
    textAlign: 'center',
  },
  stepDesc: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Grey[500],
    textAlign: 'center',
    lineHeight: FontSize.base * 1.5,
  },

  /* Device found */
  deviceFound: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Semantic.successSoft,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radii.pill,
  },
  foundDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Semantic.success,
  },
  foundText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Semantic.success,
  },

  /* Input groups */
  inputGroup: { width: '100%' },
  inputLabel: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Grey[700],
    marginBottom: Spacing.xs,
  },
  textInput: {
    backgroundColor: Brand.white,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Grey[200],
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Brand.charcoal,
  },
});
