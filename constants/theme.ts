/**
 * Jarida Design System — Unified Theme Export
 *
 * Re-exports all design tokens from a single entry point.
 * Components can import from '@/constants/theme' for convenience
 * or from individual token files for tree-shaking.
 */

export { Colors, LightColors, DarkColors, JaridaPurple, Accent, AccentPurple, Grey, Brand, Semantic, RoleColors, type ThemeColors } from './colors';
export { FontFamily, FontSize, FontWeight, LineHeight, LetterSpacing } from './typography';
export { Spacing } from './spacing';
export { Radii } from './radii';
export { Shadows } from './shadows';
export { IconPaths, type IconName } from './icons';
