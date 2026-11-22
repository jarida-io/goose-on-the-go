/**
 * Jarida Design System — Color Tokens
 * Source: Jarida Brand Heuristics + Goose In A Pond design bundle
 */

import { ACCENT_NAMES, createTheme, type AccentName, type InkTheme } from '@jarida/ink';

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
 * Ink's UI accent — the interactive/CTA colour, distinct from the JaridaPurple
 * brand mark ramp above. Per @jarida/ink's tokens/color.ts the mark
 * (JaridaPurple[500], 4.42:1) and the accent (5.47:1) are deliberately
 * different values; the accent is what carries interactive elements and text.
 *
 * `base` and `pressed` are the same in ink's light and dark palettes — ink
 * "keeps base and pressed, and tints the two soft steps instead". But base is
 * a *fill* colour there, read against the white text on top of it. Against a
 * dark ground it measures 2.93:1, under the 3:1 floor for UI and nowhere near
 * the 4.5:1 for text, so anything that draws the accent *as* ink or a line on
 * dark uses `onDark` — ink's own `accentLine` for its dark theme, 6.9:1.
 */
export const Accent = {
  base: '#7C3AED',
  pressed: '#6D28D9',
  soft: 'rgba(124, 58, 237, 0.11)',
  softer: 'rgba(124, 58, 237, 0.06)',
  /** Accent as text, icon or line on a dark surface. */
  onDark: '#B794FF',
  /** Dark tints the soft steps rather than reusing the light solids. */
  softDark: 'rgba(124, 58, 237, 0.22)',
  softerDark: 'rgba(124, 58, 237, 0.12)',
} as const;

/** Flat alias for the common case of the plain accent colour. */
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

/**
 * The squares behind Settings icons, so a row is found by colour before it is read. pond-desktop's
 * own settings accents, so a setting wears the same colour on both; white glyphs clear 3:1 on each.
 */
export const TileColors = {
  purple: Accent.base,
  blue: Semantic.info,
  green: '#16A34A',
  teal: '#0D9488',
  orange: '#EA580C',
  red: Semantic.danger,
  pink: '#DB2777',
  indigo: '#4F46E5',
  amber: '#B45309',
  slate: '#475569',
} as const;

export type TileColor = keyof typeof TileColors;

/**
 * The parts of what the Pond keeps, drawn as one bar. Each is a step apart in lightness as well as
 * hue, so they read apart without colour; the models, the largest, take the most contrast.
 */
export const StorageColors = {
  light: { models: JaridaPurple[700], kv_snapshots: TileColors.blue, engine_caches: TileColors.teal, rest: Grey[400] },
  dark: { models: Accent.onDark, engine_caches: TileColors.teal, kv_snapshots: TileColors.blue, rest: Grey[700] },
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
  /**
   * Meaning, as text or a mark on this scheme's surfaces. Not `Semantic`, whose
   * fixed values are for fills: its red measures about 3.3:1 as text on the dark
   * card, under the 4.5:1 a sentence needs.
   */
  danger: string;
  success: string;
  warning: string;
  info: string;
}

/** Light theme surface + text colors */
/**
 * The theme, read off Ink rather than kept beside it.
 *
 * These used to be their own values: a pure white page in light and a neutral
 * charcoal one in dark, under Ink's warm paper and its purple-black. Every screen
 * built on this sat beside Ink's cards, sheets and settings pages in a slightly
 * different colour, worst in dark, where the stack header was grey above a
 * purple page. Deriving them means a screen and the Ink components on it agree.
 */
function fromInk(scheme: 'light' | 'dark', accent: AccentName): ThemeColors {
  const c = createTheme({ scheme, accent }).color;
  return {
    background: c.bg,
    backgroundSecondary: c.content,
    backgroundTertiary: c.chrome,
    card: c.surface,
    cardElevated: c.surface,

    text: c.text,
    textSecondary: c.textSecondary,
    textTertiary: c.textTertiary,
    textDisabled: c.textDisabled,
    textOnBrand: c.textOnAccent,
    textBrand: c.accentLine,

    border: c.line,
    borderStrong: c.lineStrong,
    borderBrand: c.accentLine,

    tint: c.accent,
    tintSoft: c.accentSoft,
    icon: c.textTertiary,
    iconActive: c.accentLine,
    tabIconDefault: c.textTertiary,
    tabIconSelected: scheme === 'dark' ? c.text : c.accentLine,

    danger: c.dangerFg,
    success: c.successFg,
    warning: c.warningFg,
    info: c.infoFg,
  };
}

/** The accents the member can choose, the same five the Pond's dashboard offers. */
export const THEME_ACCENTS: readonly AccentName[] = ACCENT_NAMES;
export type ThemeAccent = AccentName;

/** Ink lists its brand accent, Purple, first: the app's colour until the member picks another. */
export const DEFAULT_THEME_ACCENT: ThemeAccent = ACCENT_NAMES[0];

export const LightColors: ThemeColors = fromInk('light', DEFAULT_THEME_ACCENT);

export const DarkColors: ThemeColors = fromInk('dark', DEFAULT_THEME_ACCENT);

export function isThemeAccent(value: string | null): value is ThemeAccent {
  return value !== null && (ACCENT_NAMES as string[]).includes(value);
}

const built = new Map<string, ThemeColors>();

/** The app's colours for a scheme and an accent, built once each. */
export function themeColors(scheme: 'light' | 'dark', accent: ThemeAccent): ThemeColors {
  const key = `${scheme}:${accent}`;
  let colors = built.get(key);
  if (!colors) {
    colors = fromInk(scheme, accent);
    built.set(key, colors);
  }
  return colors;
}

export const Colors = {
  light: LightColors,
  dark: DarkColors,
} as const;

function mixHex(a: string, b: string, weight: number): string {
  const channel = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const mixed = [0, 1, 2].map((i) => Math.round(channel(a, i) * (1 - weight) + channel(b, i) * weight));
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/**
 * Ink's theme for a scheme and accent, with its `ink` (the colour of every raised control's offset
 * edge) following the accent. Ink keeps `ink` at the brand purple whatever the accent, so a Teal app
 * drew purple edges under its teal buttons. Purple keeps the brand's own values; another accent
 * takes the same relation to its fill: its pressed shade in light, a lighter tint of it in dark.
 */
export function inkTheme(scheme: 'light' | 'dark', accent: ThemeAccent): InkTheme {
  const theme = createTheme({ scheme, accent });
  if (accent === DEFAULT_THEME_ACCENT) return theme;
  const ink = scheme === 'dark' ? mixHex(theme.color.accent, '#FFFFFF', 0.45) : theme.color.accentPressed;
  return { ...theme, color: { ...theme.color, ink } };
}
