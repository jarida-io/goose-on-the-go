/**
 * GTextArea — Multi-line text input with label.
 *
 * Shares the same visual language as GInput (bordered / flat variants)
 * but renders a multiline TextInput with configurable line counts.
 *
 * @example
 *   <GTextArea
 *     label="Notes"
 *     variant="bordered"
 *     minLines={3}
 *     maxLines={8}
 *     value={notes}
 *     onChangeText={setNotes}
 *   />
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';

import { Brand, Grey, AccentPurple } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Radii } from '@/constants/radii';
import { Spacing } from '@/constants/spacing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GTextAreaVariant = 'bordered' | 'flat';

export interface GTextAreaProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  variant?: GTextAreaVariant;
  /** Minimum visible lines. Default 3 */
  minLines?: number;
  /** Maximum visible lines before scrolling. Default 6 */
  maxLines?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Approximate line height based on font size + padding */
const LINE_HEIGHT = 20;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GTextArea({
  label,
  placeholder,
  value,
  onChangeText,
  variant = 'bordered',
  minLines = 3,
  maxLines = 6,
}: GTextAreaProps) {
  const [focused, setFocused] = useState(false);

  const isBordered = variant === 'bordered';
  const minHeight = minLines * LINE_HEIGHT + Spacing.md * 2;
  const maxHeight = maxLines * LINE_HEIGHT + Spacing.md * 2;

  const containerStyle: ViewStyle = {
    backgroundColor: isBordered ? Brand.white : Grey[100],
    borderWidth: isBordered ? 1 : focused ? 1 : 0,
    borderColor: focused ? AccentPurple : isBordered ? Grey[300] : 'transparent',
    minHeight,
    maxHeight,
  };

  return (
    <View style={styles.wrapper}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.container, containerStyle]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Grey[400]}
          multiline
          textAlignVertical="top"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
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
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    fontFamily: FontFamily.body,
    color: Grey[600],
    marginBottom: Spacing.xs,
  },
  container: {
    borderRadius: Radii.md,
    padding: Spacing.md,
  },
  input: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Grey[900],
    padding: 0,
    textAlignVertical: 'top',
  },
});
