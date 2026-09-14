/**
 * VoiceOrb — animated microphone button for voice mode.
 */

import React, { useEffect } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { GIcon } from '@/components/ui/g-icon';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { AccentPurple, Grey } from '@/constants/colors';

import type { VoiceState } from '@/models/voice';

interface VoiceOrbProps {
  state: VoiceState;
  onPress: () => void;
}

export function VoiceOrb({ state, onPress }: VoiceOrbProps) {
  const scale = useSharedValue(1);
  const ringScale = useSharedValue(0.9);
  const ringOpacity = useSharedValue(0);

  const isActive = state === 'recording' || state === 'thinking' || state === 'speaking';

  useEffect(() => {
    if (isActive) {
      ringScale.value = withRepeat(
        withTiming(1.7, { duration: 1600, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      );
      ringOpacity.value = withRepeat(
        withTiming(0, { duration: 1600, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      );
    } else {
      cancelAnimation(ringScale);
      cancelAnimation(ringOpacity);
      ringScale.value = 0.9;
      ringOpacity.value = 0;
    }
  }, [isActive, ringScale, ringOpacity]);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => { scale.value = withTiming(0.95, { duration: 100 }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: 150 }); }}
      style={styles.wrapper}
    >
      {isActive && <Animated.View style={[styles.ring, ringStyle]} />}
      <Animated.View style={[styles.orb, orbStyle]}>
        <GIcon name="mic" size={24} color="#fff" />
      </Animated.View>
      <Text style={styles.caption}>
        {state === 'recording' ? 'Listening\u2026' : state === 'thinking' ? 'Thinking\u2026' : state === 'speaking' ? 'Speaking\u2026' : 'Tap to speak'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  ring: {
    position: 'absolute',
    top: 14,
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: 'rgba(140,75,255,0.4)',
  },
  orb: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: AccentPurple,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: AccentPurple,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  icon: {
    fontSize: 24,
  },
  caption: {
    fontSize: 12,
    fontWeight: '500',
    color: Grey[600],
  },
});
