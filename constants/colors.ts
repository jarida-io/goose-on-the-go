/**
 * Jarida Design System — Color Tokens
 * Source: Jarida Brand Heuristics + Goose In A Pond design bundle
 */

export const JaridaPurple = {
  50: '#F4ECFF',
  100: '#E6D6FF',
  200: '#CFB0FF',
  300: '#B386FF',
  400: '#9D63FF',
  500: '#8C4BFF',
  600: '#7636E6',
  700: '#5D23C2',
  800: '#421593',
  900: '#2A0C66',
} as const;

/**
 * Ink's UI accent — the interactive/CTA color, distinct from the JaridaPurple
 * brand mark ramp above. Per @jarida/ink's src/tokens/color.ts, the mark
 * (JaridaPurple[500], 4.42:1) and the accent (5.47:1) are deliberately
 * different values; the accent is what should carry interactive elements
 * and text. Identical across light/dark in ink, so used unconditionally here.
 */
export const Accent = {
  base: '#7C3AED',
  pressed: '#6D28D9',
  soft: 'rgba(124, 58, 237, 0.11)',
  softer: 'rgba(124, 58, 237, 0.06)',
} as const;

/** Flat alias for the common case of the plain accent color. */
export const AccentPurple = Accent.base;

export const Grey = {
  50: '#FAFAFA',
  100: '#F5F5F5',
  200: '#EDEDED',
  300: '#D9D9D9',
  400: '#B5B5B5',
  500: '#8A8A8A',
  600: '#5F5F5F',
  700: '#3D3D3D',
  800: '#262626',
  900: '#1C1C1C',
} as const;

export const Semantic = {
  success: '#1F8A3C',
  successSoft: 'rgba(31,138,60,0.12)',
  warning: '#C88A00',
  warningSoft: 'rgba(200,138,0,0.12)',
  danger: '#C8383B',
  dangerSoft: 'rgba(200,56,59,0.10)',
  info: '#1C63D1',
  infoSoft: 'rgba(28,99,209,0.10)',
} as const;

export const Brand = {
  purple: '#8C4BFF',
  charcoal: '#1C1C1C',
  white: '#FFFFFF',
} as const;

/** Role-based colors for model assignment chips */
export const RoleColors = {
  chat: Accent.base,
  think: '#F5A524',
  task: '#17C964',
  asr: '#0072F5',
  tts: '#F31260',
} as const;

/** Theme color shape */
export interface ThemeColors {
  background: string;
  backgroundSecondary: string;
  backgroundTertiary: string;
  card: string;
  cardElevated: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;
  textOnBrand: string;
  textBrand: string;
  border: string;
  borderStrong: string;
  borderBrand: string;
  tint: string;
  tintSoft: string;
  icon: string;
  iconActive: string;
  tabIconDefault: string;
  tabIconSelected: string;
}

/** Light theme surface + text colors */
export const LightColors: ThemeColors = {
  // Surfaces
  background: Brand.white,
  backgroundSecondary: Grey[50],
  backgroundTertiary: Grey[100],
  card: Brand.white,
  cardElevated: Brand.white,

  // Text
  text: Brand.charcoal,
  textSecondary: Grey[600],
  textTertiary: Grey[500],
  textDisabled: Grey[400],
  textOnBrand: Brand.white,
  textBrand: Accent.base,

  // Borders
  border: Grey[200],
  borderStrong: Grey[300],
  borderBrand: Accent.base,

  // Interactive
  tint: Accent.base,
  tintSoft: Accent.soft,
  icon: Grey[500],
  iconActive: Accent.base,
  tabIconDefault: Grey[500],
  tabIconSelected: Accent.base,
} as const;

/** Dark theme surface + text colors */
export const DarkColors: ThemeColors = {
  // Surfaces
  background: Grey[900],
  backgroundSecondary: Grey[800],
  backgroundTertiary: Grey[700],
  card: Grey[800],
  cardElevated: Grey[700],

  // Text
  text: '#ECEDEE',
  textSecondary: Grey[400],
  textTertiary: Grey[500],
  textDisabled: Grey[600],
  textOnBrand: Brand.white,
  textBrand: Accent.base,

  // Borders
  border: Grey[700],
  borderStrong: Grey[600],
  borderBrand: Accent.base,

  // Interactive
  tint: Accent.base,
  tintSoft: Accent.soft,
  icon: Grey[400],
  iconActive: Accent.base,
  tabIconDefault: Grey[500],
  tabIconSelected: Brand.white,
} as const;

export const Colors = {
  light: LightColors,
  dark: DarkColors,
} as const;
