/**
 * Root Layout — loads brand fonts, manages splash screen,
 * and wraps the app tree with ThemeProvider + ServerProvider.
 */

import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';
import {
  Quicksand_400Regular,
  Quicksand_500Medium,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
} from '@expo-google-fonts/quicksand';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import { InkProvider } from '@jarida/ink/native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ThemeProvider } from '@/providers/theme-provider';
import { ServerProvider } from '@/providers/server-provider';

/** Keep splash visible while fonts load */
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const [fontsLoaded, fontError] = useFonts({
    // Existing app fonts — unchanged, zero regression to non-ink screens.
    Quicksand: require('../assets/fonts/Quicksand.ttf'),
    Comfortaa: require('../assets/fonts/Comfortaa.ttf'),
    'JetBrainsMono-Regular': require('../assets/fonts/JetBrainsMono-Regular.ttf'),
    // @jarida/ink native font resolver requires these exact family names —
    // see requiredNativeFonts() in @jarida/ink/dist/core/font.js.
    Quicksand_400Regular,
    Quicksand_500Medium,
    Quicksand_600SemiBold,
    Quicksand_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemeProvider>
      <ServerProvider>
        <NavThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <InkProvider>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="(stack)" options={{ headerShown: false }} />
              <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            </Stack>
            <StatusBar style="auto" />
          </InkProvider>
        </NavThemeProvider>
      </ServerProvider>
    </ThemeProvider>
  );
}
