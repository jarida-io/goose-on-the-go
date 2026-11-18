/**
 * Root Layout — loads brand fonts, manages splash screen,
 * and wraps the app tree with ThemeProvider + ServerProvider.
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { loadAsync as loadFontsAsync, useFonts } from 'expo-font';
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
import { InkProvider } from '@/components/ui/ink';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConnectionStatus } from '@/components/patterns/connection-status';
import { NotificationsProvider } from '@/providers/notifications-provider';
import { ThemeProvider, useTheme } from '@/providers/theme-provider';
// Registers the app's icons with Ink. Imported for the side effect: on native
// every Ink `icon=` slot draws an empty gap until something is registered.
import '@/components/ui/ink-icons';
// Initialises i18next before the first screen renders.
import '@/services/i18n';
import { ServerProvider, useServer } from '@/providers/server-provider';
import { ConfirmProvider } from '@/providers/confirm-provider';
import { SnackbarProvider } from '@/providers/snackbar-provider';
import { loadHapticsPreference } from '@/services/haptics';
import { loadPhonePlacePreference } from '@/services/phone-place';
import { phoneWakeSupported } from '@/services/phone-wake';
import { followWakePhrase, installPhoneWake } from '@/services/phone-wake-pond';
import { loadReplyNoticePreference } from '@/services/reply-notices';
import { sendHomeLocationOnce } from '@/services/home-location';
import { showSnackbar } from '@/services/snackbar';
import { usePondSettings, type UsePondSettings } from '@/view-models/use-pond-settings';
import { useCaptureSync } from '@/view-models/use-capture-sync';
import { installMediaLibraryCapture } from '@/services/media-library-capture';

// Before any screen or the capture sync reads the library; installing it asks the member nothing.
installMediaLibraryCapture();

/**
 * Keep the splash up until the app can draw itself.
 *
 * "Can draw itself" used to mean all three brand fonts had parsed — 586 KB of
 * TTF, on the one serial step before first paint. Two of them are not on it:
 * `FontFamily.mono` (JetBrains Mono, 267 KB) appears only on stack screens the
 * user reaches later, and `FontFamily.bodyAlt` (Comfortaa, 197 KB) is a
 * design-system token nothing references yet. Only Quicksand, at 122 KB, is on
 * every first screen.
 *
 * So the splash now waits on Quicksand alone and the other two load behind it,
 * arriving long before anything asks for them.
 */
SplashScreen.preventAutoHideAsync();

/**
 * Loaded behind the splash — see above for why none of these gate first paint.
 *
 * `@jarida/ink` resolves a weight to one exact registered family name, because
 * Android ignores `fontWeight` (see requiredNativeFonts() in
 * @jarida/ink/dist/core/font.js). An unregistered name is not an error there —
 * React Native falls back to the system face — so these belong behind the
 * splash with the rest rather than in front of it. An ink control drawn in the
 * first frames is briefly system-faced and then correct, which is the same
 * trade the two fonts below already make.
 */
const DEFERRED_FONTS = {
  Comfortaa: require('../assets/fonts/Comfortaa.ttf'),
  'JetBrainsMono-Regular': require('../assets/fonts/JetBrainsMono-Regular.ttf'),
  Quicksand_400Regular,
  Quicksand_500Medium,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
};

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {

  const [fontsLoaded, fontError] = useFonts({
    Quicksand: require('../assets/fonts/Quicksand.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Deliberately not awaited and deliberately not a splash gate: a screen that
  // wants one of these is several taps away, and a font that fails to load
  // costs that screen its typeface, not the app its launch.
  useEffect(() => {
    loadFontsAsync(DEFERRED_FONTS).catch((e) =>
      console.warn('[fonts] deferred fonts failed to load', e),
    );
    void loadHapticsPreference();
    void loadReplyNoticePreference();
    void loadPhonePlacePreference();
    // Android starts the wake-word service only while the app is in front, so a reboot ends it
    // until the app opens again: this is that moment. It also starts answering the service's
    // speech segments for a phrase only the Pond can hear.
    installPhoneWake();
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemeProvider>
      <ServerProvider>
        <NotificationsProvider>
          <ThemedApp />
        </NotificationsProvider>
      </ServerProvider>
    </ThemeProvider>
  );
}


/**
 * The Pond's settings, read once for everything at the root that follows them: one poll, not one
 * per follower. Draws nothing of its own.
 */
function PondSettingsSync() {
  const pond = usePondSettings();
  return (
    <>
      <HomeLocationSync pond={pond} />
      {phoneWakeSupported() ? <PhoneWakeSync phrase={pond.settings?.voice_wake_word} /> : null}
    </>
  );
}

/**
 * Gives the Pond this phone's location when the phone reaches it at home, the Pond's location is
 * still a guess (a town's centre from its time zone or a typed name), and location is already
 * allowed, then says where the Pond now is. The phone's permission is the person's answer; it is
 * not asked again. Away from home it does nothing, and the Pond would refuse it anyway
 * (`services/home-location.ts`). Draws nothing.
 */
function HomeLocationSync({ pond }: { pond: UsePondSettings }) {
  const { t } = useTranslation();
  const { connectionState, isScreenReal } = useServer();
  const loaded = pond.settings !== null;
  const source = pond.settings?.weather_location_source ?? '';
  const { refresh } = pond.actions;
  const atHome = connectionState === 'local' && isScreenReal('settings');
  useEffect(() => {
    if (!loaded || !atHome || source === 'manual' || source === 'device') return;
    void sendHomeLocationOnce().then((result) => {
      if (!result) return;
      showSnackbar({ message: t('settings.location.fromPhone', { name: result.name }) });
      void refresh();
    });
  }, [loaded, atHome, source, refresh, t]);
  return null;
}

/**
 * Hands the phone's wake-word service the household's phrase from the Pond's settings, which the
 * store re-reads while the app is open: a phrase changed on the dashboard or another phone reaches
 * the service here, as well as with the Pond's next answer to a segment. Draws nothing.
 */
function PhoneWakeSync({ phrase }: { phrase: string | undefined }) {
  const trimmed = phrase?.trim();
  useEffect(() => {
    if (trimmed) followWakePhrase(trimmed);
  }, [trimmed]);
  return null;
}

/**
 * Sends new screenshots, and new photos from the albums the member chose, when the app comes to the
 * front, on a Pond that serves captures and in a build that can read the library. Draws nothing.
 */
function CaptureSync() {
  useCaptureSync();
  return null;
}

/**
 * Sits inside ThemeProvider so Navigation and Ink derive from the same resolved
 * scheme rather than each reading the system on its own.
 */
function ThemedApp() {
  const { isDark } = useTheme();
  // Ink cannot measure the notch or the home indicator itself; told once here,
  // every sheet, toast and bar clears them.
  const insets = useSafeAreaInsets();
  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <InkProvider scheme={isDark ? 'dark' : 'light'} accent="Purple" insets={insets}>
        {/* Inside Ink because the dialog and the snackbar draw with its theme; around every screen
            so any of them can ask. */}
        <SnackbarProvider>
          <ConfirmProvider>
            <ConnectionStatus />
            <PondSettingsSync />
            <CaptureSync />
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="(stack)" options={{ headerShown: false }} />
              <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
              {/* Over the tabs rather than inside one, so a conversation has the
                  whole screen: no bar under the composer. It draws its own header. */}
              <Stack.Screen name="conversation" options={{ headerShown: false }} />
              {/* Over everything, with its own close control: five sentences need the whole screen. */}
              <Stack.Screen name="teach-voice" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
              <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            </Stack>
            <StatusBar style={isDark ? 'light' : 'dark'} />
          </ConfirmProvider>
        </SnackbarProvider>
      </InkProvider>
    </NavThemeProvider>
  );
}
