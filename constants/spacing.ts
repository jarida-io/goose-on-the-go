/**
 * Jarida Design System — Spacing (8pt grid, 4px half-step)
 *
 * Matches @jarida/ink's SPACE scale for every step ink defines (see
 * docs/DESIGN-SYSTEM.md's token audit); 7xl/8xl are GOTG-specific additions
 * beyond ink's ceiling.
 */

export const Spacing = {
  0: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  '6xl': 64,
  '7xl': 80,
  '8xl': 96,
} as const;
