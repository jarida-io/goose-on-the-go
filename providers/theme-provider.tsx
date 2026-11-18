/**
 * ThemeProvider — the single owner of the colour scheme.
 *
 * Everything that needs to know whether the app is dark reads it from here:
 * the screens, React Navigation and Ink. Resolving it in more than one place is
 * what makes a theme flip on its own, because two owners disagree about who
 * won.
 *
 * `preference` is what the person chose; `colorScheme` is what that resolves to
 * once the system is consulted. Only the preference is stored.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { Colors, type ThemeColors } from '@/constants/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Storage } from '@/services/storage';

export type ColorScheme = 'light' | 'dark';
export type ThemePreference = 'system' | 'light' | 'dark';
export type AccentName = 'Purple' | 'Blue' | 'Teal' | 'Coral' | 'Magenta';

export const ACCENT_OPTIONS: ReadonlyArray<{ name: AccentName; hex: string }> = [
  { name: 'Purple', hex: '#7C3AED' },
  { name: 'Blue', hex: '#2563EB' },
  { name: 'Teal', hex: '#0D9488' },
  { name: 'Coral', hex: '#F97316' },
  { name: 'Magenta', hex: '#DB2777' },
];

interface ThemeContextValue {
  colors: ThemeColors;
  colorScheme: ColorScheme;
  isDark: boolean;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  accent: AccentName;
  setAccent: (next: AccentName) => void;
  /** False until the stored preference has been read back. */
  hydrated: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isPreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isAccentName(value: string | null): value is AccentName {
  return ACCENT_OPTIONS.some((o) => o.name === value);
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [accent, setAccentState] = useState<AccentName>('Purple');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([Storage.get('themePreference'), Storage.get('accentPreference')])
      .then(([storedTheme, storedAccent]) => {
        if (!active) return;
        if (isPreference(storedTheme)) setPreferenceState(storedTheme);
        if (isAccentName(storedAccent)) setAccentState(storedAccent);
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void Storage.set('themePreference', next);
  }, []);

  const setAccent = useCallback((next: AccentName) => {
    setAccentState(next);
    void Storage.set('accentPreference', next);
  }, []);

  // RN 0.85's useColorScheme may return 'unspecified'; collapse to light/dark.
  const colorScheme: ColorScheme =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: Colors[colorScheme],
      colorScheme,
      isDark: colorScheme === 'dark',
      preference,
      setPreference,
      accent,
      setAccent,
      hydrated,
    }),
    [colorScheme, preference, setPreference, accent, setAccent, hydrated],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }
  return ctx;
}
