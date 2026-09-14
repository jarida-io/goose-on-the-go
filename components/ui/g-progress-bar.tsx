/**
 * GProgressBar — Determinate progress indicator.
 *
 * Renders a horizontal bar that fills from 0 to 100%.
 * Fill width is animated with react-native-reanimated for smooth transitions.
 *
 * @example
 *   <GProgressBar value={65} color="secondary" label={<Text>65%</Text>} />
 */

import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Grey, AccentPurple, Semantic } from '@/constants/colors';

import { Radii } from '@/constants/radii';
import { Spacing } from '@/constants/spacing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GProgressBarColor = 'default' | 'secondary' | 'success';

export type GProgressBarSize = 'sm' | 'md';

export interface GProgressBarProps {
  /** Progress value from 0 to 100 */
  value: number;
  color?: GProgressBarColor;
  size?: GProgressBarSize;
  /** Optional label rendered above the bar */
  label?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Color map
// ---------------------------------------------------------------------------

const COLOR_MAP: Record<GProgressBarColor, string> = {
  default: Grey[700],
  secondary: AccentPurple,
  success: Semantic.success,
};

const SIZE_MAP: Record<GProgressBarSize, number> = {
  sm: 6,
  md: 10,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GProgressBar({
  value,
  color = 'default',
  size = 'md',
  label,
}: GProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const progress = useSharedValue(clamped);

  useEffect(() => {
    progress.value = withTiming(clamped, { duration: 300 });
  }, [clamped, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  const trackHeight = SIZE_MAP[size];
  const fillColor = COLOR_MAP[color];

  return (
    <View style={styles.wrapper}>
      {label && <View style={styles.labelContainer}>{label}</View>}
      <View style={[styles.track, { height: trackHeight }]}>
        <Animated.View
          style={[
            styles.fill,
            { height: trackHeight, backgroundColor: fillColor },
            fillStyle,
          ]}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  labelContainer: {
    marginBottom: Spacing.xs,
  },
  track: {
    width: '100%',
    backgroundColor: Grey[200],
    borderRadius: Radii.pill,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: Radii.pill,
  },
});
