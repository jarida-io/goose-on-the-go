/**
 * The five destinations, drawn by Ink's bottom bar — and the bar contracting.
 *
 * The bar is positioned over the screens rather than beside them. React
 * Navigation renders a custom `tabBar` as a flex sibling in a column, so it
 * reserves its own strip and content stops above it. A bar that reserves a
 * strip cannot contract out of one: the list would reflow under a moving
 * thumb. Lifted out of flow it can, and lists clear it with their own bottom
 * padding instead — `useBottomBarInset`.
 *
 * Which stage it is in comes from whichever list the reader is scrolling; see
 * `providers/chrome-provider`. The last stage is Ink's own: the bar shrinks to
 * a single control carrying the current destination's glyph, and pressing that
 * restores the bar rather than navigating, because the reader contracted it by
 * scrolling and not by choosing to.
 *
 * None of it is reachable without a paired Pond; see `TabLayout`.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Redirect, Tabs, useIsFocused } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { NowListening } from '@/components/patterns/now-listening';
import {
  useReduceMotion,
  useInkTheme,
} from '@/components/ui/ink';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { GlassBlur } from '@/components/ui/glass-blur';
import {
  ChromeProvider,
  useChromeMeasure,
  useChromeRestore,
  useChromeStage,
} from '@/providers/chrome-provider';
import { useServer } from '@/providers/server-provider';
import { useSnackbarClearance } from '@/providers/snackbar-provider';
import { useOnboarding } from '@/view-models/use-onboarding';
import { useSetupGate } from '@/view-models/use-setup-gate';
import { useSettingsIssues } from '@/view-models/use-settings-issues';
import { selectionTick } from '@/services/haptics';
import type { IconName } from '@/constants/icons';
import type { TranslationKey } from '@/services/i18n';

const DESTINATIONS: { name: string; labelKey: TranslationKey; icon: IconName | 'mark' }[] = [
  { name: 'index', labelKey: 'tabs.home', icon: 'home' },
  { name: 'chat', labelKey: 'tabs.chat', icon: 'chat' },
  { name: 'goose', labelKey: 'tabs.goose', icon: 'mark' },
  { name: 'schedules', labelKey: 'screens.schedule', icon: 'schedule' },
  { name: 'profile', labelKey: 'tabs.you', icon: 'profile' },
];

const MARK = require('@/assets/images/tab-goose.png');
const MARK_ON_DARK = require('@/assets/images/tab-goose-dark.png');

/**
 * My Goose is drawn with the brand mark, which is never recoloured: so it is not tinted as the
 * other glyphs are, and an unselected one steps back by opacity instead.
 */
const MarkGlyph = React.memo(function MarkGlyph({ selected }: { selected: boolean }) {
  const theme = useInkTheme();
  return (
    <Image
      source={theme.scheme === 'dark' ? MARK_ON_DARK : MARK}
      fadeDuration={0}
      resizeMode="contain"
      style={[styles.mark, { opacity: selected ? 1 : 0.62 }]}
      accessibilityIgnoresInvertColors
    />
  );
});

/**
 * What the bar reads of the navigator. expo-router and @react-navigation ship
 * divergent `BottomTabBarProps`, so this names only the part that is used.
 */
interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    navigate: (name: string) => void;
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
  };
}

function AppTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const theme = useInkTheme();
  const stage = useChromeStage();
  const measure = useChromeMeasure();
  const restore = useChromeRestore();

  const current = state.routes[state.index]?.name ?? 'index';
  const issueTone = useSettingsIssues()[0]?.tone ?? null;
  const [height, setHeight] = useState(0);
  const focused = useIsFocused();
  useSnackbarClearance(focused ? height : 0);

  const onChange = useCallback(
    (key: string) => {
      const route = state.routes.find((r) => r.name === key);
      if (!route) return;
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (key !== current && !event.defaultPrevented) {
        void selectionTick();
        navigation.navigate(route.name);
      }
    },
    [current, navigation, state.routes],
  );

  const isDark = theme.scheme === 'dark';
  const glassFill = isDark ? 'rgba(20, 18, 30, 0.56)' : 'rgba(255, 255, 255, 0.68)';
  const glassEdge = isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.10)';
  const activeBg = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.07)';
  const activeDest = DESTINATIONS.find((d) => d.name === current) ?? DESTINATIONS[0];
  const bottomPad = Math.max(insets.bottom, 12);
  const collapsed = stage === 'collapsed';
  const reduced = useReduceMotion();
  const collapseAnim = useRef(new Animated.Value(collapsed ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(collapseAnim, {
      toValue: collapsed ? 1 : 0,
      duration: reduced ? 0 : 210,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start();
  }, [collapseAnim, collapsed, reduced]);

  const barOpacity = collapseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const barScale = collapseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });
  const barTranslateY = collapseAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 8] });
  const puckOpacity = collapseAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const puckScale = collapseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.76, 1] });

  return (
    <View
      pointerEvents="box-none"
      onLayout={(e) => {
        const next = e.nativeEvent.layout.height;
        if (next === height) return;
        setHeight(next);
        measure(next);
      }}
      style={[styles.barWrap, { paddingBottom: bottomPad }]}
    >
      <NowListening placement="bar" />
      <Animated.View
        pointerEvents={collapsed ? 'none' : 'auto'}
        accessibilityRole="tablist"
        style={[
          styles.barShell,
          {
            borderColor: glassEdge,
            opacity: barOpacity,
            transform: [{ translateY: barTranslateY }, { scale: barScale }],
          },
        ]}
      >
        <GlassBlur intensity={56} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: glassFill }]} />
        {DESTINATIONS.map((d) => {
          const selected = d.name === current;
          return (
            <GPressable
              key={d.name}
              feedback="tint"
              onPress={() => onChange(d.name)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={t(d.labelKey)}
              style={[styles.tabItem, selected && { backgroundColor: activeBg }]}
            >
              <View style={styles.glyph}>
                {d.icon === 'mark' ? (
                  <MarkGlyph selected={selected} />
                ) : (
                  <GIcon
                    name={d.icon}
                    size={26}
                    color={selected ? theme.color.text : theme.color.textSecondary}
                  />
                )}
                {d.name === 'profile' && issueTone ? (
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: issueTone === 'info' ? theme.color.accent : theme.color.danger },
                    ]}
                  />
                ) : null}
              </View>
            </GPressable>
          );
        })}
      </Animated.View>

      <Animated.View
        pointerEvents={collapsed ? 'auto' : 'none'}
        style={[
          styles.puckAnchor,
          {
            bottom: bottomPad,
            opacity: puckOpacity,
            transform: [{ scale: puckScale }],
          },
        ]}
      >
        <GPressable
          feedback="lift"
          onPress={restore}
          accessibilityRole="button"
          accessibilityLabel={t(activeDest.labelKey)}
          style={[styles.collapsedPuck, { borderColor: glassEdge }]}
        >
          <GlassBlur intensity={56} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: glassFill }]} />
          {activeDest.icon === 'mark' ? (
            <MarkGlyph selected />
          ) : (
            <GIcon name={activeDest.icon} size={26} color={theme.color.text} />
          )}
        </GPressable>
      </Animated.View>
    </View>
  );
}

export default function TabLayout() {
  const { hydrated, paired } = useServer();
  const onboarding = useOnboarding();
  const setup = useSetupGate();
  const { t } = useTranslation();
  const reduced = useReduceMotion();

  // `hydrated` is what says the stored identity has been read back. Without
  // it, every cold start would bounce through pairing before discovering it is
  // already paired.
  if (!hydrated) return null;

  // Nothing in this app works without a paired Pond, so an app that has none
  // reaches none of it. A fresh install and a phone that just signed out land
  // in the same place: the first-run screen, which hands off to pairing — or
  // pairing itself, for someone who has already been shown that screen and
  // chosen to set up later.
  //
  // Keyed on whether there is a stored identity, not on the connection state.
  // `configure` publishes `unpaired` at the start of every reconfiguration --
  // including the one that enables remote access -- so a guard watching the
  // connection would throw somebody onto the pairing screen in the middle of
  // setting remote access up, which is what the previous attempt did.
  //
  // Nor on the in-memory identity. Staging another pairing clears that while the
  // stored one stays, and redirecting then replaced the tabs mid-wizard, so
  // backing out of pairing another Pond (Switch Pond) no longer led back to them.
  if (!paired) {
    // Which of the two depends on a stored flag; wait for it rather than guess.
    if (onboarding.loading) return null;
    return (
      <Redirect href={onboarding.data.show ? '/(onboarding)/welcome' : '/(stack)/pond-pairing'} />
    );
  }

  // A Pond nobody has set up refuses nearly everything with `onboarding_required`. Until the Pond
  // has answered, Home shows: an unreachable Pond must not hold the app on a blank screen.
  if (setup === 'needed') return <Redirect href="/(onboarding)/owner-setup" />;

  return (
    <ChromeProvider>
      <Tabs
        screenOptions={{ headerShown: false, animation: reduced ? 'none' : 'shift' }}
        tabBar={(props) => <AppTabBar {...props} />}
      >
        {DESTINATIONS.map((d) => (
          <Tabs.Screen key={d.name} name={d.name} options={{ title: t(d.labelKey) }} />
        ))}
      </Tabs>
    </ChromeProvider>
  );
}

const styles = StyleSheet.create({
  barWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    alignItems: 'flex-end',
  },
  barShell: {
    width: '100%',
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  tabItem: {
    flex: 1,
    height: '100%',
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  puckAnchor: {
    position: 'absolute',
    right: 20,
  },
  collapsedPuck: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glyph: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  // The mark is wider than it is tall, so it is given more room than a glyph to read at the same weight.
  mark: { width: 34, height: 34 },
  dot: { position: 'absolute', top: -3, right: -5, width: 9, height: 9, borderRadius: 4.5 },
});
