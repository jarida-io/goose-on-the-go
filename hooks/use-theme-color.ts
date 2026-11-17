/**
 * useThemeColor — resolve a single Jarida color token for the active scheme.
 *
 * Accepts optional per-scheme overrides via `props`. Falls back to the
 * token value for the app's chosen scheme and accent.
 */

import type { ThemeColors } from '@/constants/colors';
import { useTheme } from '@/providers/theme-provider';

type ThemeColorName = keyof ThemeColors;

/**
 * Returns the resolved color string for `colorName` under the current scheme.
 * If `props.light` or `props.dark` is provided, that override takes precedence.
 */
export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: ThemeColorName,
): string {
  // The app's own scheme and accent, not the system's: a phone set to dark with the app on light
  // would otherwise draw these in the other scheme's colours.
  const { colors, colorScheme } = useTheme();
  return props[colorScheme] ?? colors[colorName];
}
