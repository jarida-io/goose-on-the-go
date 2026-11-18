/**
 * Slide a message left to answer it, as a messages app does. The message follows the finger part
 * of the way and a reply arrow comes in behind it; past the line, a tick says letting go will
 * reply. It only claims a sideways drag, so the thread still scrolls under a vertical one, and a
 * screen reader gets the same as an action on the message.
 */

import React, { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useInkTheme, useReduceMotion } from '@/components/ui/ink';

import { GIcon } from '@/components/ui/g-icon';
import { selectionTick } from '@/services/haptics';

/** How far the message goes before letting go replies, and the most it follows the finger. */
const LINE = 56;
const REACH = 72;
/** Left-to-right voice note requires a deliberate long drag so casual swipes never trigger it. */
const VOICE_LINE = 170;
const VOICE_REACH = 195;

export function SwipeToReply({
  onReply,
  onVoiceNote,
  children,
}: {
  onReply?: () => void;
  onVoiceNote?: () => void;
  children: ReactNode;
}) {
  const theme = useInkTheme();
  const { t } = useTranslation();
  const reduced = useReduceMotion();
  const x = useSharedValue(0);
  const past = useSharedValue(false);
  const pastVoice = useSharedValue(false);

  const tick = () => void selectionTick();
  const reply = () => onReply?.();
  const voiceNote = () => onVoiceNote?.();

  const pan = Gesture.Pan()
    .enabled(Boolean(onReply || onVoiceNote))
    // Sideways first: a drag that starts vertical is the thread's scroll, not a reply.
    .activeOffsetX(onReply && onVoiceNote ? [-14, 28] : onReply ? -14 : 28)
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      const minX = onReply ? -REACH : 0;
      const maxX = onVoiceNote ? VOICE_REACH : 0;
      const clamped = Math.max(minX, Math.min(maxX, e.translationX));
      x.set(clamped);
      const beyondReply = Boolean(onReply) && clamped <= -LINE;
      if (beyondReply !== past.get()) {
        past.set(beyondReply);
        if (beyondReply) scheduleOnRN(tick);
      }
      const beyondVoice = Boolean(onVoiceNote) && clamped >= VOICE_LINE;
      if (beyondVoice !== pastVoice.get()) {
        pastVoice.set(beyondVoice);
        if (beyondVoice) scheduleOnRN(tick);
      }
    })
    .onEnd(() => {
      if (past.get()) scheduleOnRN(reply);
      else if (pastVoice.get()) scheduleOnRN(voiceNote);
    })
    .onFinalize(() => {
      x.set(reduced ? 0 : withSpring(0, { damping: 20, stiffness: 260 }));
      past.set(false);
      pastVoice.set(false);
    });

  const follow = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const arrow = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [0, -LINE], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(x.get(), [0, -LINE], [0.6, 1], 'clamp') }],
  }));
  const voiceBadge = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [0, VOICE_LINE], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(x.get(), [0, VOICE_LINE], [0.6, 1], 'clamp') }],
  }));

  // A root of its own, as the microphone has, so a message drawn on any screen can be swiped; sized
  // to the message, since unstyled it would take flex: 1.
  return (
    <GestureHandlerRootView
      style={styles.root}
      accessibilityActions={onReply ? [{ name: 'reply', label: t('chat.reply.reply') }] : undefined}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'reply') onReply?.();
      }}
    >
      {onVoiceNote ? (
        <Animated.View pointerEvents="none" style={[styles.voiceArrow, voiceBadge]}>
          <View style={[styles.disc, { backgroundColor: theme.color.accentSoft }]}>
            <GIcon name="voice" size={16} color={theme.color.accentLine} />
          </View>
        </Animated.View>
      ) : null}
      <Animated.View pointerEvents="none" style={[styles.arrow, arrow]}>
        <View style={[styles.disc, { backgroundColor: theme.color.neutralSoft }]}>
          <GIcon name="reply" size={16} color={theme.color.textSecondary} />
        </View>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={follow}>{children}</Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 0 },
  arrow: { position: 'absolute', right: 0, top: 0, bottom: 0, justifyContent: 'center' },
  voiceArrow: { position: 'absolute', left: 0, top: 0, bottom: 0, justifyContent: 'center' },
  disc: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
