/**
 * GreetingCard — the opening of a conversation that has not started.
 *
 * pond-desktop's new-chat card: a mono "New chat" eyebrow, a greeting for the
 * time of day with the person's name in it, one quiet true line about where
 * the conversation goes, and the goose. It is the one raised card on an empty
 * conversation — the only thing on the screen, so the only thing that can
 * carry the edge — and it rises into place the way messages do, so the screen
 * settles as one.
 *
 * The greeting and the line under it are chosen by a seed that changes per new
 * conversation, not per render, so the card does not reword itself while it
 * is being read.
 *
 * Under it, the Pond's own suggestions as pills, which send straight away.
 */

import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  InkEdge,
  InkEyebrow,
  inkText,
  useInkTheme,
  useReduceMotion,
} from '@/components/ui/ink';

import { Goose } from '@/components/patterns/goose';
import {
  GREETINGS_PER_PERIOD,
  SUBTITLES,
  greetingKey,
  periodOf,
  pick,
  subtitleKey,
} from '@/constants/quips';

/** pond-desktop's `ch-arrive`: 14px of rise over 320ms on its ease-out. */
const ARRIVE_MS = 320;
const ARRIVE_RISE = 14;

export interface GreetingCardProps {
  name: string | null;
  seed: number;
  /** A turn is being sent: the goose paddles. */
  busy: boolean;
}

export function GreetingCard({ name, seed, busy }: GreetingCardProps) {
  const theme = useInkTheme();
  // The conversation stays mounted under screens pushed over it; its goose rests while it is hidden.
  const focused = useIsFocused();
  const reduced = useReduceMotion();
  const { t } = useTranslation();
  const [arrival] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduced) {
      arrival.setValue(1);
      return;
    }
    arrival.setValue(0);
    Animated.timing(arrival, {
      toValue: 1,
      duration: ARRIVE_MS,
      easing: Easing.bezier(...theme.easing),
      useNativeDriver: true,
    }).start();
  }, [arrival, reduced, seed, theme.easing]);

  const period = periodOf(new Date(seed).getHours());
  const greeting = name
    ? t(greetingKey(period, pick(seed, GREETINGS_PER_PERIOD)), { name })
    : t(greetingKey('anonymous', pick(seed, GREETINGS_PER_PERIOD)));
  const subtitle = t(subtitleKey(pick(seed, SUBTITLES)));

  const title = inkText(theme, {
    role: 'display',
    size: 'xl',
    weight: theme.weight.bold,
    tracking: 'title',
    leading: 'tight',
  });
  const hint = inkText(theme, { size: 'base', color: theme.color.textSecondary });

  const rise = arrival.interpolate({ inputRange: [0, 1], outputRange: [ARRIVE_RISE, 0] });

  return (
    <Animated.View style={[styles.wrap, { opacity: arrival, transform: [{ translateY: rise }] }]}>
      <InkEdge radius={theme.radius.lg} contentStyle={styles.card}>
        <InkEyebrow>{t('chat.greeting.eyebrow')}</InkEyebrow>
        <View style={styles.body}>
          <View style={styles.copy}>
            <Text accessibilityRole="header" style={title.style}>
              {greeting}
            </Text>
            <Text style={hint.style}>{subtitle}</Text>
          </View>
          <Goose state={busy ? 'working' : 'idle'} size={104} still={!focused} />
        </View>
      </InkEdge>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  card: { padding: 22, gap: 14 },
  body: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1, gap: 6 },
});
