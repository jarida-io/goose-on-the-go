/**
 * GSlider — Tap-to-set range slider with label and value display.
 *
 * Uses a simple touch-based approach: the user taps a position on the
 * track and the value snaps to the nearest step. A thumb indicator
 * shows the current position.
 *
 * @example
 *   <GSlider
 *     label="Temperature"
 *     value={temp}
 *     onValueChange={setTemp}
 *     min={0}
 *     max={2}
 *     step={0.1}
 *   />
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Grey, AccentPurple, Brand } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Shadows } from '@/constants/shadows';
import { Spacing } from '@/constants/spacing';
import { Radii } from '@/constants/radii';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GSliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THUMB_SIZE = 20;
const TRACK_HEIGHT = 6;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GSlider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  label,
}: GSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackRef = useRef<View>(null);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  /** Convert a touch x-coordinate (relative to the track) to a clamped, stepped value */
  const xToValue = useCallback(
    (pageX: number, trackPageX: number): number => {
      const relativeX = Math.max(0, Math.min(pageX - trackPageX, trackWidth));
      const ratio = trackWidth > 0 ? relativeX / trackWidth : 0;
      const raw = min + ratio * (max - min);
      const stepped = Math.round(raw / step) * step;
      return Math.max(min, Math.min(max, parseFloat(stepped.toFixed(10))));
    },
    [trackWidth, min, max, step],
  );

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      trackRef.current?.measureInWindow((trackPageX) => {
        const newValue = xToValue(e.nativeEvent.pageX, trackPageX);
        onValueChange(newValue);
      });
    },
    [xToValue, onValueChange],
  );

  const fraction = max !== min ? (value - min) / (max - min) : 0;
  const clampedFraction = Math.max(0, Math.min(1, fraction));
  const fillWidth = trackWidth * clampedFraction;

  /** Display value — show up to 2 decimal places, trimming trailing zeros */
  const displayValue = Number.isInteger(step)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

  return (
    <View style={styles.wrapper}>
      {(label != null) && (
        <View style={styles.header}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.valueText}>{displayValue}</Text>
        </View>
      )}

      <Pressable
        ref={trackRef as React.Ref<View>}
        onLayout={handleLayout}
        onPress={handlePress}
        style={styles.trackContainer}
      >
        {/* Background track */}
        <View style={styles.track} />

        {/* Filled track */}
        <View style={[styles.fill, { width: fillWidth }]} />

        {/* Thumb */}
        <View
          style={[
            styles.thumb,
            { left: fillWidth - THUMB_SIZE / 2 },
          ]}
        />
      </Pressable>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  label: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Grey[700],
  },
  valueText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Grey[500],
  },

  trackContainer: {
    height: THUMB_SIZE + 8,
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: TRACK_HEIGHT,
    borderRadius: Radii.pill,
    backgroundColor: Grey[200],
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: TRACK_HEIGHT,
    borderRadius: Radii.pill,
    backgroundColor: AccentPurple,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: Brand.white,
    ...Shadows.sm,
  },
});
