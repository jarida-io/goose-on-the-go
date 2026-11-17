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

import { DEFAULT_THEME_ACCENT, isThemeAccent, themeColors, type ThemeAccent, type ThemeColors } from '@/constants/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Storage } from '@/services/storage';

export type ColorScheme = 'light' | 'dark';
export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  colors: ThemeColors;
  colorScheme: ColorScheme;
  isDark: boolean;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  /** The colour the whole app is drawn in, as the Pond's dashboard lets its user choose. */
  accent: ThemeAccent;
  setAccent: (next: ThemeAccent) => void;
  /** False until the stored preference has been read back. */
  hydrated: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isPreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [accent, setAccentState] = useState<ThemeAccent>(DEFAULT_THEME_ACCENT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([Storage.get('themePreference'), Storage.get('themeAccent')])
      .then(([stored, storedAccent]) => {
        if (!active) return;
        if (isPreference(stored)) setPreferenceState(stored);
        if (isThemeAccent(storedAccent)) setAccentState(storedAccent);
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

  const setAccent = useCallback((next: ThemeAccent) => {
    setAccentState(next);
    void Storage.set('themeAccent', next);
  }, []);

  // RN 0.85's useColorScheme may return 'unspecified'; collapse to light/dark.
  const colorScheme: ColorScheme =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: themeColors(colorScheme, accent),
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
