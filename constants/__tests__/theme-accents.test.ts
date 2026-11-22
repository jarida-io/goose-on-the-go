// The accent the member picks under Appearance: every colour the app draws with is built from the
// scheme and that accent, so choosing one recolours the whole app, not only Ink's own controls.

import { createTheme } from '@jarida/ink';

import { DEFAULT_THEME_ACCENT, LightColors, THEME_ACCENTS, inkTheme, isThemeAccent, themeColors } from '@/constants/colors';

it('offers the same five accents as the Pond dashboard, Purple first and by default', () => {
  expect(THEME_ACCENTS).toEqual(['Purple', 'Blue', 'Teal', 'Coral', 'Magenta']);
  expect(DEFAULT_THEME_ACCENT).toBe('Purple');
  expect(themeColors('light', 'Purple')).toEqual(LightColors);
});

it('draws the brand colours in the chosen accent, in both schemes', () => {
  for (const scheme of ['light', 'dark'] as const) {
    const tints = new Set(THEME_ACCENTS.map((a) => themeColors(scheme, a).tint));
    expect(tints.size).toBe(THEME_ACCENTS.length);
  }
  expect(themeColors('light', 'Teal').tint).toBe('#0D9488');
  // Text on a light accent is dark, so a letter on Teal or Coral stays readable.
  expect(themeColors('light', 'Coral').textOnBrand).not.toBe('#FFFFFF');
  expect(themeColors('light', 'Blue').textOnBrand).toBe('#FFFFFF');
});

it('keeps the surfaces whatever the accent', () => {
  expect(themeColors('dark', 'Coral').background).toBe(themeColors('dark', 'Purple').background);
});

it('reads back only an accent it knows', () => {
  expect(isThemeAccent('Teal')).toBe(true);
  expect(isThemeAccent('teal')).toBe(false);
  expect(isThemeAccent(null)).toBe(false);
});

it('draws a raised control\'s edge in the accent, keeping the brand ink for Purple', () => {
  expect(inkTheme('light', 'Purple').color.ink).toBe(createTheme({ scheme: 'light', accent: 'Purple' }).color.ink);
  expect(inkTheme('dark', 'Purple').color.ink).toBe(createTheme({ scheme: 'dark', accent: 'Purple' }).color.ink);
  expect(inkTheme('light', 'Teal').color.ink).toBe('#0F766E');
  const darkTeal = inkTheme('dark', 'Teal').color.ink;
  expect(darkTeal).not.toBe(createTheme({ scheme: 'dark', accent: 'Teal' }).color.ink);
  expect(darkTeal).toMatch(/^#[0-9A-F]{6}$/);
});
