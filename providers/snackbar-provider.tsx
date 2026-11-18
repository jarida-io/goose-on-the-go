/**
 * SnackbarProvider -- one short message at the foot of the screen about an action the user just
 * took: "Saved on your Pond.", "Could not start the run." with Try again.
 *
 * Mounted once, inside `InkProvider` in `app/_layout.tsx`, so it draws with the app's theme and
 * sits over every screen. The message itself lives in `services/snackbar.ts`; `useSnackbar()` is
 * the hook for components, and a module-level store calls `showSnackbar` directly.
 *
 * What it does, after Material 3's snackbar and the HIG:
 *
 * - One at a time. A new message replaces the one showing.
 * - It goes by itself: about four seconds, longer for a long sentence (Ink's `readingTime`), and
 *   at least eight when it offers an action. With a screen reader on, one that offers an action
 *   stays until it is dismissed or replaced, because finding the button by swiping takes longer
 *   than any timer a sighted reader would accept.
 * - A tap on the message puts it away; so does the screen reader's escape gesture.
 * - It is announced, once, when it appears. Announced rather than a live region, because Android
 *   would otherwise read it twice.
 * - It clears the safe area, the tab bar (which reports its height with `useSnackbarClearance`)
 *   and the keyboard.
 * - It rises on a short spring and fades, leaves in Ink's fast duration, and simply appears and
 *   goes with Reduce Motion on (`theme.animate`).
 * - It is drawn in the other scheme, as Material's inverse surface is: the other scheme's surface,
 *   text, accent and status colours, so a dark bar over a light app and a light one over a dark
 *   app, each already measured by Ink against its own surface (`snackbarPalette`). A leading
 *   icon says which kind of message it is (`SNACKBAR_ICON`), in that tone's colour. Depth comes
 *   from a shadow, not a border; the message wraps to two lines and the whole of it is still
 *   announced.
 *
 * Which feedback goes here and which stays in the page is in docs/VIEW-LAYER.md, "Feedback for
 * actions".
 */

import { GPressable } from '@/components/ui/g-pressable';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { AccessibilityInfo, Animated, Easing, Keyboard, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { EASE_IN_OUT, createTheme, toneColors, type InkTheme } from '@jarida/ink';
import { inkText, readingTime, useInkTheme } from '@/components/ui/ink';

import { GIcon } from '@/components/ui/g-icon';
import type { IconName } from '@/constants/icons';

import {
  SNACKBAR_ACTION_MS,
  SNACKBAR_MS,
  currentSnackbar,
  dismissSnackbar,
  showSnackbar,
  subscribeSnackbar,
  type Snackbar,
  type SnackbarRequest,
  type SnackbarTone,
} from '@/services/snackbar';

/** What `useSnackbar()` hands a component. Both functions are stable. */
export interface SnackbarApi {
  show: (request: SnackbarRequest) => number;
  dismiss: (id?: number) => void;
}

const API: SnackbarApi = { show: showSnackbar, dismiss: dismissSnackbar };

/** Report the bottom chrome's height, so the message sits above it. */
const ClearanceContext = createContext<(height: number) => void>(() => {});

/**
 * How long `snackbar` stays on its own, or null for until it is put away.
 *
 * Exported for the tests, which pin the rule rather than a number in a timer.
 */
export function snackbarDuration(snackbar: Snackbar, screenReader: boolean): number | null {
  if (snackbar.action && screenReader) return null;
  const floor = snackbar.action ? SNACKBAR_ACTION_MS : SNACKBAR_MS;
  return Math.max(floor, readingTime(snackbar.message));
}

/** The glyph at the start of each kind of message: a tick, an exclamation mark, an i. */
export const SNACKBAR_ICON: Record<SnackbarTone, IconName> = {
  success: 'done',
  danger: 'alert',
  neutral: 'info',
};

/** The colours a snackbar is drawn in. */
export interface SnackbarPalette {
  ground: string;
  words: string;
  action: string;
  pressed: string;
  icon: Record<SnackbarTone, string>;
}

/**
 * The other scheme's colours, for a surface laid over this one.
 *
 * Taken whole from Ink's theme for the other scheme rather than mixed here, because every one of
 * them is already measured against that scheme's surface: the text, the status foregrounds (AA
 * 4.5:1 and up), and the accent line, which `createTheme` derives so that whichever accent is
 * chosen still clears 4.5:1 as text. A neutral message takes Ink's info colour for its icon.
 * Exported for the tests, which measure it.
 */
export function snackbarPalette(theme: Pick<InkTheme, 'scheme' | 'accent'>): SnackbarPalette {
  const same = createTheme({ scheme: theme.scheme, accent: theme.accent }).color;
  return {
    ground: same.surface,
    words: same.text,
    action: same.accentLine,
    pressed: same.pressed,
    icon: {
      success: toneColors('success', same).fg,
      danger: toneColors('danger', same).fg,
      neutral: toneColors('info', same).fg,
    },
  };
}

export function SnackbarProvider({ children }: PropsWithChildren) {
  const [clearance, setClearance] = useState(0);
  return (
    <ClearanceContext.Provider value={setClearance}>
      {children}
      <SnackbarHost clearance={clearance} />
    </ClearanceContext.Provider>
  );
}

/** Show or put away the snackbar. Works anywhere; the provider only draws it. */
export function useSnackbar(): SnackbarApi {
  return API;
}

/**
 * Keep the snackbar above a bar drawn over the foot of the screen. Pass 0 when the bar is not in
 * front -- the tab bar passes its height only while its navigator is focused, so a stack screen
 * pushed over the tabs gets the plain safe area back.
 */
export function useSnackbarClearance(height: number): void {
  const report = useContext(ClearanceContext);
  useEffect(() => {
    report(height);
    return () => report(0);
  }, [report, height]);
}

function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    // iOS says `will*` ahead of the animation, so the message moves with the keyboard.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => {
        if (live) setOn(enabled);
      })
      .catch(() => {
        // Unknown is treated as off: the message still goes by itself, as it would for anyone.
      });
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return on;
}

function SnackbarHost({ clearance }: { clearance: number }) {
  const { t } = useTranslation();
  const theme = useInkTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const screenReader = useScreenReader();
  const snackbar = useSyncExternalStore(subscribeSnackbar, currentSnackbar);

  // The last message stays drawn while it slides away, so it leaves with its words on it. Kept in
  // step while rendering, as the view-models reset theirs, rather than one frame late in an effect.
  const [shown, setShown] = useState<Snackbar | null>(snackbar);
  if (snackbar && snackbar !== shown) setShown(snackbar);
  if (!snackbar && shown && !theme.animate) setShown(null);
  const [progress] = useState(() => new Animated.Value(snackbar ? 1 : 0));

  useEffect(() => {
    if (snackbar) AccessibilityInfo.announceForAccessibility(snackbar.message);
  }, [snackbar]);

  useEffect(() => {
    const target = snackbar ? 1 : 0;
    if (!theme.animate) {
      progress.setValue(target);
      return;
    }
    // In on a spring that settles just past its mark and back, out on a quick ease: arriving
    // should catch the eye, leaving should not.
    const run = snackbar
      ? Animated.spring(progress, { toValue: 1, damping: 20, stiffness: 260, mass: 1, useNativeDriver: true })
      : Animated.timing(progress, {
          toValue: 0,
          duration: theme.duration.fast,
          easing: Easing.bezier(EASE_IN_OUT[0], EASE_IN_OUT[1], EASE_IN_OUT[2], EASE_IN_OUT[3]),
          useNativeDriver: true,
        });
    run.start(({ finished }) => {
      if (finished && !snackbar) setShown(null);
    });
    return () => run.stop();
  }, [snackbar, progress, theme.animate, theme.duration.fast]);

  useEffect(() => {
    if (!snackbar) return;
    const ms = snackbarDuration(snackbar, screenReader);
    if (ms === null) return;
    const timer = setTimeout(() => dismissSnackbar(snackbar.id), ms);
    return () => clearTimeout(timer);
  }, [snackbar, screenReader]);

  const palette = useMemo(() => snackbarPalette(theme), [theme]);

  if (!shown) return null;

  const bottom = (keyboard > 0 ? keyboard : clearance > 0 ? clearance : insets.bottom) + theme.space[3];
  const body = inkText(theme, { size: 'base', weight: theme.weight.medium, leading: 'snug', color: palette.words });
  const action = inkText(theme, { size: 'base', weight: theme.weight.bold, color: palette.action });
  // A dark bar over a light page casts a soft shadow; a light bar over a dark page is lifted by
  // its own brightness, and a darker, wider shadow is what keeps its edge from glowing.
  const shadow = theme.scheme === 'dark' ? { shadowOpacity: 0.5, shadowRadius: 20 } : { shadowOpacity: 0.22, shadowRadius: 16 };

  return (
    <View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: theme.space[4] }]}
    >
      <Animated.View
        testID="snackbar"
        style={{
          width: '100%',
          // One sentence at reading measure: on a tablet it sits centred rather than across the screen.
          maxWidth: theme.measure.prose,
          marginBottom: bottom,
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [theme.space[5], 0] }) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1], extrapolate: 'clamp' }) },
          ],
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space[3],
          minHeight: theme.rowHeight.lg,
          paddingLeft: theme.space[4],
          paddingRight: shown.action ? theme.space[1] : theme.space[4],
          borderRadius: theme.radius.lg,
          backgroundColor: palette.ground,
          // A plane over the content, said by its lift rather than a rule around it.
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          ...shadow,
          elevation: 8,
        }}
      >
        <View
          testID="snackbar-icon"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <GIcon name={SNACKBAR_ICON[shown.tone]} size={20} strokeWidth={2} color={palette.icon[shown.tone]} />
        </View>
        <GPressable
          feedback="none"
          style={{ flex: 1, paddingVertical: theme.space[3] }}
          onPress={() => dismissSnackbar(shown.id)}
          onAccessibilityEscape={() => dismissSnackbar(shown.id)}
          accessibilityLabel={shown.message}
          accessibilityHint={t('common.dismissHint')}
        >
          <Text style={body.style} numberOfLines={2} ellipsizeMode="tail">
            {shown.message}
          </Text>
        </GPressable>
        {shown.action ? (
          <GPressable
            feedback="none"
            accessibilityRole="button"
            onPress={() => {
              dismissSnackbar(shown.id);
              shown.action?.onPress();
            }}
            style={({ pressed }) => ({
              minHeight: theme.touch.tapMin,
              minWidth: theme.touch.tapMin,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: theme.space[3],
              borderRadius: theme.radius.md,
              backgroundColor: pressed ? palette.pressed : 'transparent',
            })}
          >
            <Text style={action.style}>{shown.action.label}</Text>
          </GPressable>
        ) : null}
      </Animated.View>
    </View>
  );
}
