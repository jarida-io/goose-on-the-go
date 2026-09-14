/**
 * GInput — Themed TextInput with label and icon support.
 *
 * Comes in two visual variants: bordered (outlined) and flat (filled).
 * Highlights with the brand purple on focus.
 *
 * @example
 *   <GInput
 *     label="Search"
 *     variant="bordered"
 *     startIcon="search"
 *     placeholder="Type here..."
 *     value={query}
 *     onChangeText={setQuery}
 *   />
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
  type TextInputProps,
} from 'react-native';

import { Brand, Grey, AccentPurple } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Radii } from '@/constants/radii';
import { Spacing } from '@/constants/spacing';
import { GIcon } from './g-icon';
import type { IconName } from '@/constants/icons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GInputVariant = 'bordered' | 'flat';

export interface GInputProps
  extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  label?: string;
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  variant?: GInputVariant;
  startIcon?: IconName;
  disabled?: boolean;
  style?: ViewStyle;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GInput({
  label,
  placeholder,
  value,
  onChangeText,
  variant = 'bordered',
  startIcon,
  disabled = false,
  style,
  ...rest
}: GInputProps) {
  const [focused, setFocused] = useState(false);

  const isBordered = variant === 'bordered';

  const inputContainerStyle: ViewStyle = {
    backgroundColor: isBordered ? Brand.white : Grey[100],
    borderWidth: isBordered ? 1 : focused ? 1 : 0,
    borderColor: focused ? AccentPurple : isBordered ? Grey[300] : 'transparent',
  };

  return (
    <View style={[styles.wrapper, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputContainer, inputContainerStyle]}>
        {startIcon && (
          <GIcon
            name={startIcon}
            size={16}
            color={focused ? AccentPurple : Grey[400]}
          />
        )}
        <TextInput
          style={[styles.input, startIcon && styles.inputWithIcon]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Grey[400]}
          editable={!disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
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
  inputContainer: {
    height: 40,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: '100%',
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Grey[900],
    padding: 0,
  },
  inputWithIcon: {
    marginLeft: Spacing.sm,
  },
});
