/**
 * GButton — Primary action button with haptic feedback.
 *
 * Supports five visual variants, three sizes, optional leading/trailing
 * icons, and a loading state. Fires a light haptic impact on press (iOS).
 *
 * @example
 *   <GButton variant="primary" startIcon="plus" onPress={handleAdd}>
 *     Add Item
 *   </GButton>
 */

import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from 'react-native';

import { Grey, JaridaPurple, AccentPurple, Semantic, Brand } from '@/constants/colors';

import { FontFamily, FontSize, FontWeight } from '@/constants/typography';
import { Radii } from '@/constants/radii';
import { Spacing } from '@/constants/spacing';
import { useHaptics } from '@/hooks/use-haptics';
import { GIcon } from './g-icon';
import type { IconName } from '@/constants/icons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'bordered';

export type GButtonSize = 'sm' | 'md' | 'lg';

export interface GButtonProps {
  variant?: GButtonVariant;
  size?: GButtonSize;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  startIcon?: IconName;
  endIcon?: IconName;
  children: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}

// ---------------------------------------------------------------------------
// Variant style maps
// ---------------------------------------------------------------------------

interface VariantStyle {
  bg: string;
  text: string;
  border?: string;
}

const VARIANT_STYLES: Record<GButtonVariant, VariantStyle> = {
  primary: { bg: AccentPurple, text: Brand.white },
  secondary: { bg: JaridaPurple[50], text: JaridaPurple[700] },
  ghost: { bg: 'transparent', text: Grey[700] },
  danger: { bg: Semantic.danger, text: Brand.white },
  bordered: { bg: 'transparent', text: Grey[700], border: Grey[300] },
};

interface SizeStyle {
  height: number;
  paddingHorizontal: number;
  fontSize: number;
  iconSize: number;
}

const SIZE_STYLES: Record<GButtonSize, SizeStyle> = {
  sm: {
    height: 32,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.xs,
    iconSize: 14,
  },
  md: {
    height: 40,
    paddingHorizontal: Spacing.lg,
    fontSize: FontSize.base,
    iconSize: 16,
  },
  lg: {
    height: 48,
    paddingHorizontal: Spacing.xl,
    fontSize: FontSize.md,
    iconSize: 18,
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GButton({
  variant = 'primary',
  size = 'md',
  onPress,
  disabled = false,
  loading = false,
  startIcon,
  endIcon,
  children,
  style,
  testID,
}: GButtonProps) {
  const haptics = useHaptics();

  const handlePress = useCallback(() => {
    if (disabled || loading) return;
    haptics.light();
    onPress?.();
  }, [disabled, loading, haptics, onPress]);

  const v = VARIANT_STYLES[variant];
  const s = SIZE_STYLES[size];

  const containerStyle: ViewStyle = {
    height: s.height,
    paddingHorizontal: s.paddingHorizontal,
    backgroundColor: v.bg,
    borderRadius: Radii.md,
    borderWidth: v.border ? 1 : 0,
    borderColor: v.border ?? 'transparent',
  };

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        containerStyle,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.text} />
      ) : (
        <>
          {startIcon && (
            <GIcon
              name={startIcon}
              size={s.iconSize}
              color={v.text}
            />
          )}
          <Text
            style={[
              styles.label,
              {
                fontSize: s.fontSize,
                color: v.text,
                marginLeft: startIcon ? Spacing.sm : 0,
                marginRight: endIcon ? Spacing.sm : 0,
              },
            ]}
          >
            {children}
          </Text>
          {endIcon && (
            <GIcon
              name={endIcon}
              size={s.iconSize}
              color={v.text}
            />
          )}
        </>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: FontFamily.body,
    fontWeight: FontWeight.semibold,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.5,
  },
});
