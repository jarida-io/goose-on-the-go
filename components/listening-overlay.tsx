/**
 * ListeningOverlay — Full-screen dark overlay with pulsing rings,
 * Goose logo, waveform bars, suggested phrases, and cancel button.
 *
 * Triggered by mic FAB or "Ask Goose" bar.
 *
 * @example
 *   <ListeningOverlay visible={isListening} onCancel={() => setIsListening(false)} />
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Modal,
  Dimensions,
} from 'react-native';

import { GIcon } from '@/components/ui/g-icon';
import { Brand, JaridaPurple, AccentPurple, Grey } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SUGGESTED_PHRASES = [
  'Turn off the lights',
  'What\'s the weather like?',
  'Set a timer for 10 minutes',
  'Play my evening playlist',
];

export interface ListeningOverlayProps {
  /** Whether the overlay is visible */
  visible: boolean;
  /** Called when the user cancels listening */
  onCancel: () => void;
}

/** Pulsing ring animation */
function PulseRing({ delay, size }: { delay: number; size: number }) {
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 1.3,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 0.8,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.4,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, scaleAnim, opacityAnim]);

  return (
    <Animated.View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        },
      ]}
    />
  );
}

/** Waveform bars */
function WaveformBars() {
  const bars = Array.from({ length: 20 });
  return (
    <View style={styles.waveform}>
      {bars.map((_, i) => {
        const height = 8 + Math.random() * 24;
        return (
          <View
            key={i}
            style={[styles.waveBar, { height }]}
          />
        );
      })}
    </View>
  );
}

function ListeningOverlayInner({ visible, onCancel }: ListeningOverlayProps) {
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        {/* Pulsing rings */}
        <View style={styles.ringsContainer}>
          <PulseRing delay={0} size={200} />
          <PulseRing delay={400} size={260} />
          <PulseRing delay={800} size={320} />

          {/* Center Goose logo */}
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>G</Text>
          </View>
        </View>

        {/* Listening label */}
        <Text style={styles.listeningLabel}>Listening...</Text>

        {/* Waveform */}
        <WaveformBars />

        {/* Suggested phrases */}
        <View style={styles.suggestedSection}>
          <Text style={styles.suggestedTitle}>Try saying:</Text>
          {SUGGESTED_PHRASES.map((phrase) => (
            <Pressable key={phrase} style={styles.phraseChip}>
              <Text style={styles.phraseText}>{`"${phrase}"`}</Text>
            </Pressable>
          ))}
        </View>

        {/* Cancel button */}
        <Pressable style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

export const ListeningOverlay = React.memo(ListeningOverlayInner);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(28,28,28,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },

  /* Rings */
  ringsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 320,
    height: 320,
    marginBottom: Spacing.xl,
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: JaridaPurple[400],
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: AccentPurple,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  logoText: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
    color: Brand.white,
  },

  /* Label */
  listeningLabel: {
    fontFamily: FontFamily.heading,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Brand.white,
    marginBottom: Spacing.xl,
  },

  /* Waveform */
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 32,
    marginBottom: Spacing['3xl'],
  },
  waveBar: {
    width: 3,
    borderRadius: 1.5,
    backgroundColor: JaridaPurple[400],
    opacity: 0.8,
  },

  /* Suggested phrases */
  suggestedSection: {
    alignItems: 'center',
    marginBottom: Spacing['3xl'],
  },
  suggestedTitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Grey[400],
    marginBottom: Spacing.md,
  },
  phraseChip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    marginBottom: Spacing.sm,
  },
  phraseText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: 'rgba(255,255,255,0.7)',
  },

  /* Cancel */
  cancelBtn: {
    paddingHorizontal: Spacing['3xl'],
    paddingVertical: Spacing.md,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  cancelText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Brand.white,
  },
});
