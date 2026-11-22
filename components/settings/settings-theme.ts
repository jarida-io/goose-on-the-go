/**
 * Ink's palette, type and metrics for every Settings screen, so a setting looks the same wherever
 * Ink draws its own controls. Text comes from `inkText`, which names the weight's own font file:
 * on Android a `fontWeight` on a custom family draws the regular face, so labels read thin.
 */

import { useMemo } from 'react';
import { StyleSheet, type TextStyle } from 'react-native';
import { inkText, useInkTheme } from '@/components/ui/ink';

import { useTheme } from '@/providers/theme-provider';

export interface SettingsColors {
  page: string;
  group: string;
  line: string;
  edge: string;
  ink: string;
  pressed: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentSoft: string;
  /** A filled badge in the accent, and the mark or letter drawn on it (dark on Teal and Coral). */
  accentFill: string;
  onAccentFill: string;
  danger: string;
  success: string;
}

export interface SettingsType {
  /** A row's name. */
  label: TextStyle;
  /** What a row does, under its name. */
  description: TextStyle;
  /** What a row is set to, on the right: the reading, sentence case against the label. */
  value: TextStyle;
  /** A section's name: Ink's mono eyebrow. */
  eyebrow: TextStyle;
  /** A paragraph on the page itself, such as a section footer. */
  prose: TextStyle;
  /** Why a change waits, under a row. */
  note: TextStyle;
  /** Typed text and other body copy at row size. */
  body: TextStyle;
  /** Grades, sizes and other figures. */
  mono: TextStyle;
  /** A heading inside the page, such as a stage's line. */
  heading: TextStyle;
}

export interface SettingsMetrics {
  rowV: number;
  rowH: number;
  tapMin: number;
  gap: number;
  radius: { sm: number; md: number; lg: number; pill: number };
  border: number;
  hairline: number;
}

export function useSettingsColors(): SettingsColors {
  const { color } = useInkTheme();
  const { isDark } = useTheme();
  return useMemo(
    () => ({
      page: color.bg,
      group: color.surface,
      line: color.line,
      edge: color.edge,
      ink: color.ink,
      pressed: color.pressed,
      text: color.text,
      textSecondary: color.textSecondary,
      textTertiary: color.textTertiary,
      accent: isDark ? color.accentLine : color.accent,
      accentSoft: color.brandSoft,
      accentFill: color.accent,
      onAccentFill: color.textOnAccent,
      danger: color.dangerFg,
      success: color.successFg,
    }),
    [color, isDark],
  );
}

export function useSettingsType(): SettingsType {
  const theme = useInkTheme();
  return useMemo(() => {
    const t = (spec: Parameters<typeof inkText>[1]) => inkText(theme, spec).style;
    return {
      label: t({ size: 'md', weight: theme.weight.semibold, leading: 'snug' }),
      description: t({ size: 'sm', color: theme.color.textSecondary }),
      value: t({ size: 'sm', weight: theme.weight.semibold, color: theme.color.textSecondary }),
      eyebrow: t({ role: 'mono', size: 'xs', weight: theme.weight.bold, tracking: 'eyebrow', uppercase: true, color: theme.color.textTertiary }),
      prose: t({ size: 'sm', color: theme.color.textSecondary }),
      note: t({ size: 'sm', color: theme.color.textTertiary }),
      body: t({ size: 'md' }),
      mono: t({ role: 'mono', size: 'sm', weight: theme.weight.bold, tracking: 'wide', color: theme.color.textTertiary }),
      heading: t({ role: 'display', size: 'base', weight: theme.weight.semibold, tracking: 'snug', leading: 'snug' }),
    };
  }, [theme]);
}

export function useSettingsMetrics(): SettingsMetrics {
  const theme = useInkTheme();
  return useMemo(
    () => ({
      rowV: theme.space[3],
      rowH: theme.space[4],
      tapMin: theme.touch.tapMin,
      gap: theme.space[3],
      radius: { sm: theme.radius.sm, md: theme.radius.md, lg: theme.radius.lg, pill: theme.radius.pill },
      border: theme.edge.borderWidth,
      hairline: theme.edge.hairlineWidth,
    }),
    [theme],
  );
}

type Factory<T> = (c: SettingsColors, type: SettingsType, m: SettingsMetrics) => T;

/** `useThemedStyles` for Settings: one sheet per palette, built outside render. */
export function useSettingsStyles<T extends StyleSheet.NamedStyles<T>>(factory: Factory<T>): T {
  const colors = useSettingsColors();
  const type = useSettingsType();
  const metrics = useSettingsMetrics();
  return useMemo(() => StyleSheet.create(factory(colors, type, metrics)), [colors, type, metrics, factory]);
}
