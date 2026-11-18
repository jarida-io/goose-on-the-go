/**
 * WallDock — search and a new conversation, where the thumb already is.
 *
 * Two pucks over the bar: search on the left, compose on the right. Search
 * opens where it sits. The puck grows into a field towards the right, its
 * magnifier staying under the thumb that pressed it, and compose steps aside,
 * because a person typing a search is not about to start a conversation. It
 * closes back into the puck along the same path.
 *
 * The growth is a critically damped spring from wherever the value is, so a
 * close that arrives mid-open turns around rather than finishing first. Width
 * is layout, which the native driver cannot animate, so this runs on the JS
 * thread like Ink's own navbar morph — briefly, and only when asked. The lift
 * above the keyboard is a transform and runs natively, on an outer view, so
 * the two drivers never share a node.
 */

import { GPressable } from '@/components/ui/g-pressable';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { glassLift, hitSlop } from '@jarida/ink';
import { inkText, useInkTheme, useReduceMotion } from '@/components/ui/ink';

import { ChromePuck, PUCK_SIZE } from '@/components/patterns/chrome-puck';
import { WALL_GUTTER } from '@/components/patterns/conversation-wall';
import { GIcon } from '@/components/ui/g-icon';
import { selectionTick } from '@/services/haptics';

/** Clear air between the dock and the bar below it. */
export const DOCK_GAP = 12;

/** Response 0.35s at a damping ratio of 1: no overshoot, since nothing was flung. */
const SPRING = { stiffness: 320, damping: 36, mass: 1 } as const;

/** iOS's keyboard curve, near enough, so the dock rides up with it. */
const KEYBOARD_EASING = Easing.bezier(0.17, 0.59, 0.4, 0.77);

export interface WallDockProps {
  query: string;
  onQuery: (query: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompose?: () => void;
  onComposeIncognito?: () => void;
  placeholder?: string;
  /** The bar's strip, which the dock floats above. */
  bottomInset: number;
}

export function WallDock({
  query,
  onQuery,
  open,
  onOpenChange,
  onCompose,
  onComposeIncognito,
  placeholder,
  bottomInset,
}: WallDockProps) {
  const theme = useInkTheme();
  const reduced = useReduceMotion();
  const { t } = useTranslation();
  const input = useRef<TextInput>(null);
  const [width, setWidth] = useState(0);
  const [progress] = useState(() => new Animated.Value(open ? 1 : 0));
  const [lift] = useState(() => new Animated.Value(0));
  const [showTip, setShowTip] = useState(false);

  // Periodically inform the user that long-pressing Compose starts an incognito session.
  useEffect(() => {
    if (!onComposeIncognito || open) {
      setShowTip(false);
      return;
    }
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const flash = () => {
      setShowTip(true);
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setShowTip(false), 5000);
    };
    const initialTimer = setTimeout(flash, 1500);
    const interval = setInterval(flash, 45000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [onComposeIncognito, open]);

  // No stop in between: starting a spring on a moving value hands the new one
  // the old one's velocity, which is the whole point of using a spring here.
  useEffect(() => {
    const to = open ? 1 : 0;
    if (reduced) {
      progress.setValue(to);
      return;
    }
    Animated.spring(progress, { toValue: to, ...SPRING, useNativeDriver: false }).start();
  }, [open, reduced, progress]);

  useEffect(() => () => progress.stopAnimation(), [progress]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  // Clear of the keyboard while one is up. iOS says `will` ahead of the
  // animation, so the dock moves with it; Android only says `did`.
  useEffect(() => {
    const move = (to: number, duration: number | undefined) => {
      if (reduced || !duration) {
        lift.setValue(to);
        return;
      }
      Animated.timing(lift, {
        toValue: to,
        duration,
        easing: KEYBOARD_EASING,
        useNativeDriver: true,
      }).start();
    };
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      // space[4], not space[2]: the same clearance ChatDock keeps, and for the
      // same reason — a keyboard's own toolbar row sits inside the height it
      // reports, so half a step leaves the dock touching it.
      const rise = e.endCoordinates.height + theme.space[4] - (bottomInset + DOCK_GAP);
      move(-Math.max(0, rise), e.duration);
    });
    const hide = Keyboard.addListener(hideEvent, (e) => move(0, e.duration));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [bottomInset, lift, reduced, theme.space]);

  const openSearch = useCallback(() => {
    if (open) {
      input.current?.focus();
      return;
    }
    void selectionTick();
    onOpenChange(true);
  }, [onOpenChange, open]);

  const close = useCallback(() => {
    onQuery('');
    Keyboard.dismiss();
    onOpenChange(false);
  }, [onOpenChange, onQuery]);

  const fieldWidth =
    width > 0
      ? progress.interpolate({ inputRange: [0, 1], outputRange: [PUCK_SIZE, width] })
      : PUCK_SIZE;
  // The entry arrives in the second half of the growth and leaves in the first
  // half of the shrink, so text is never squeezed into a puck-sized field.
  const entryOpacity = progress.interpolate({ inputRange: [0.5, 1], outputRange: [0, 1] });
  const composeOpacity = progress.interpolate({ inputRange: [0, 0.4], outputRange: [1, 0] });

  const field = inkText(theme, { size: 'md' });

  return (
    <Animated.View
      pointerEvents="box-none"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[
        styles.dock,
        { bottom: bottomInset + DOCK_GAP, transform: [{ translateY: lift }] },
      ]}
    >
      <Animated.View
        style={[
          styles.field,
          {
            width: fieldWidth,
            backgroundColor: theme.color.chrome,
            borderColor: theme.color.lineStrong,
            borderWidth: theme.edge.hairlineWidth,
          },
          glassLift(theme),
        ]}
      >
        <GPressable feedback="none"
          onPress={openSearch}
          accessibilityRole={open ? undefined : 'button'}
          accessibilityLabel={open ? undefined : t('chat.history.search')}
          accessibilityState={open ? undefined : { expanded: false }}
          // Once open, the field carries the name; a second "Search" beside it
          // would be the same control read twice.
          aria-hidden={open}
          style={styles.glyph}
        >
          <GIcon name="search" size={20} color={theme.color.text} />
        </GPressable>
        <Animated.View
          style={[styles.entry, { opacity: entryOpacity }]}
          pointerEvents={open ? 'auto' : 'none'}
          aria-hidden={!open}
        >
          <TextInput
            ref={input}
            value={query}
            onChangeText={onQuery}
            placeholder={placeholder ?? t('chat.history.searchPlaceholder')}
            placeholderTextColor={theme.color.textTertiary}
            accessibilityLabel={t('chat.history.search')}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            // "Search" on the keyboard means "show me", and the wall already
            // is — so it only puts the keyboard away.
            onSubmitEditing={() => Keyboard.dismiss()}
            // An empty field that loses focus is a search nobody is making.
            onBlur={() => {
              if (!query.trim()) onOpenChange(false);
            }}
            style={[field.style, styles.input]}
          />
          <GPressable feedback="none"
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel={t('chat.history.closeSearch')}
            hitSlop={hitSlop(32)}
            style={styles.close}
          >
            <GIcon name="x" size={18} color={theme.color.textSecondary} />
          </GPressable>
        </Animated.View>
      </Animated.View>

      {showTip && !open && onComposeIncognito ? (
        <GPressable
          feedback="none"
          onPress={() => setShowTip(false)}
          accessibilityRole="button"
          accessibilityLabel="Long-press Compose to start an incognito session"
          style={[
            styles.tip,
            {
              backgroundColor: theme.color.chrome,
              borderColor: theme.color.lineStrong,
              borderWidth: theme.edge.hairlineWidth,
              borderRadius: theme.radius.pill,
            },
            glassLift(theme),
          ]}
        >
          <GIcon name="eye-off" size={13} color={theme.color.accentLine} />
          <Text style={inkText(theme, { size: 'xs', color: theme.color.textSecondary }).style}>
            Hold to start incognito chat
          </Text>
        </GPressable>
      ) : null}

      {onCompose ? (
        <Animated.View
          style={[styles.compose, { opacity: composeOpacity }]}
          pointerEvents={open ? 'none' : 'box-none'}
          aria-hidden={open}
        >
          <ChromePuck
            icon="compose"
            label={t('chat.newConversation')}
            onPress={onCompose}
            onLongPress={
              onComposeIncognito
                ? () => {
                    setShowTip(false);
                    onComposeIncognito();
                  }
                : undefined
            }
          />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: WALL_GUTTER,
    right: WALL_GUTTER,
    height: PUCK_SIZE,
  },
  // No `overflow: hidden`: on iOS it clips the lift's shadow along with the
  // content, and the entry is transparent until the field is wide enough to
  // hold it, so there is nothing to clip.
  field: {
    height: PUCK_SIZE,
    borderRadius: PUCK_SIZE / 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  glyph: {
    width: PUCK_SIZE - 2,
    height: PUCK_SIZE - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entry: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  input: { flex: 1, paddingVertical: 0 },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compose: { position: 'absolute', right: 0, top: 0 },
  tip: {
    position: 'absolute',
    right: 0,
    bottom: PUCK_SIZE + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
