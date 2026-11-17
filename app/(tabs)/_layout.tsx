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

import React, { useCallback, useMemo, useState } from 'react';
import { Redirect, Tabs, useIsFocused } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { NowListening } from '@/components/patterns/now-listening';
import {
  InkBottomBar,
  InkProvider,
  useInkTheme,
  type InkNavDestination,
} from '@/components/ui/ink';
import { Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GIcon } from '@/components/ui/g-icon';
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
  { name: 'devices', labelKey: 'tabs.devices', icon: 'device' },
  { name: 'profile', labelKey: 'tabs.you', icon: 'profile' },
];

const MARK = require('@/assets/images/tab-goose.png');
const MARK_ON_DARK = require('@/assets/images/tab-goose-dark.png');

/**
 * My Goose is drawn with the brand mark, which is never recoloured: so it is not tinted as the
 * other glyphs are, and an unselected one steps back by opacity instead.
 */
function MarkGlyph({ selected }: { selected: boolean }) {
  const theme = useInkTheme();
  return (
    <Image
      source={theme.scheme === 'dark' ? MARK_ON_DARK : MARK}
      style={[styles.mark, { opacity: selected ? 1 : 0.62 }]}
      accessibilityIgnoresInvertColors
    />
  );
}

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
  // Settings lists what needs attention, so its tab says when something does.
  const issueTone = useSettingsIssues()[0]?.tone ?? null;
  const [height, setHeight] = useState(0);
  // A message about an action sits above the bar, but only while the tabs are in front: a screen
  // pushed over them has no bar under it.
  const focused = useIsFocused();
  useSnackbarClearance(focused ? height : 0);

  const items = useMemo<InkNavDestination[]>(
    () =>
      DESTINATIONS.map((d) => ({
        key: d.name,
        label: t(d.labelKey),
        // Ink's own text tokens, because the label beside the icon is already
        // drawn in them — `textOnBrand` is white, which read as selected only
        // for as long as the bar was assumed to be dark.
        // The dot is drawn on the glyph rather than through Ink's `badge`, which sits at 60% of
        // the whole item and so off the icon, and which the collapsed bar does not draw.
        icon: (
          <View style={styles.glyph}>
            {d.icon === 'mark' ? (
              <MarkGlyph selected={d.name === current} />
            ) : (
              <GIcon
                name={d.icon}
                size={22}
                color={d.name === current ? theme.color.text : theme.color.textSecondary}
              />
            )}
            {d.name === 'profile' && issueTone ? (
              <View style={[styles.dot, { backgroundColor: issueTone === 'info' ? theme.color.accent : theme.color.danger }]} />
            ) : null}
          </View>
        ),
      })),
    [current, theme.color.text, theme.color.textSecondary, theme.color.accent, theme.color.danger, issueTone, t],
  );

  // The bar draws a dash over the selected destination in `accentLine`, and
  // exposes no way to turn it off. Selection is already carried by the icon and
  // label going from tertiary to full contrast, so the dash is a third telling
  // of the same fact. A theme scoped to the bar is Ink's own escape hatch, and
  // inside the bar that token draws nothing else.
  const barTheme = useMemo(
    () => ({ ...theme, color: { ...theme.color, accentLine: 'transparent' } }),
    [theme],
  );

  // Every press is announced as `tabPress`, the current tab's included, so a
  // screen can listen for it (and veto it) exactly as with the stock bar. Only
  // a press that moves somewhere navigates.
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

  return (
    // `box-none` so that once the bar is a puck, the width it no longer covers
    // belongs to the content underneath again.
    <View
      pointerEvents="box-none"
      onLayout={(e) => {
        const next = e.nativeEvent.layout.height;
        if (next === height) return;
        setHeight(next);
        measure(next);
      }}
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
    >
      <NowListening placement="bar" />
      <InkProvider theme={barTheme}>
        <InkBottomBar
          label={t('tabs.label')}
          items={items}
          value={current}
          onChange={onChange}
          variant="floating"
          stage={stage}
          collapse
          // Ink would otherwise answer its own puck with local state the stage
          // machine never hears about, and it cannot see a scroll that leaves
          // the stage unchanged — so a reader who pressed and kept scrolling
          // down would hold a bar that never contracted again.
          onExpand={restore}
          // Ink's scroll edge is a top bar's rule: nothing until content has
          // passed under it, because at the top of a page nothing has. At the
          // bottom that inverts — an offset of zero means the bar is over the
          // first screenful — so `auto` spends the whole scroll drawing labels
          // straight onto cards.
          material="always"
          // Real blur behind Ink's tint, in both schemes. Ink drops it for its
          // solid fill when Reduce Transparency is on, so that needs no second
          // path here.
          blurComponent={GlassBlur}
          bottomInset={insets.bottom}
          style={{
            // Two placements, one prop. Ink's shell is `alignSelf: flex-end`
            // with a width it only learns from its first layout, so before that
            // layout it has to stretch or it measures its own content and the
            // destinations bunch into a corner. After it, the width is
            // Ink's animated one, and `flex-end` is what makes the bar contract
            // towards the right rather than the left.
            alignSelf: height > 0 ? 'flex-end' : 'stretch',
            // The tint is `surface`, the colour the cards are made of, so on its
            // own it cannot tell the bar from a card passing under it, in dark
            // or in light. In light the lift does that; on a dark ground a
            // shadow is nothing. An edge is what says this is a plane, in both
            // schemes, and the blur keeps a card's label from reading straight
            // across it. The web glass draws the same hairline; the native
            // binding does not.
            borderWidth: theme.edge.hairlineWidth,
            borderColor: theme.color.lineStrong,
          }}
        />
      </InkProvider>
    </View>
  );
}

export default function TabLayout() {
  const { hydrated, paired } = useServer();
  const onboarding = useOnboarding();
  const setup = useSetupGate();
  const { t } = useTranslation();

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
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <AppTabBar {...props} />}>
        {DESTINATIONS.map((d) => (
          <Tabs.Screen key={d.name} name={d.name} options={{ title: t(d.labelKey) }} />
        ))}
      </Tabs>
    </ChromeProvider>
  );
}

const styles = StyleSheet.create({
  glyph: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  // The mark is wider than it is tall, so it is given more room than a glyph to read at the same weight.
  mark: { width: 30, height: 30 },
  dot: { position: 'absolute', top: -3, right: -5, width: 9, height: 9, borderRadius: 4.5 },
});
