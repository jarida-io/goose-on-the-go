/**
 * AttachMenu — Camera, Photos or Files, from the composer's plus, and Deep research when the Pond
 * offers it.
 *
 * It grows up out of the button that opened it, scaled from that corner, and
 * shrinks back into it: the rule the wall's menu follows from its puck, so
 * where it came from is never in doubt. It is chrome, so it wears the bar's
 * material and no edge.
 *
 * A `Modal`, as Ink's own sheet and dialog are, rather than a view positioned
 * over the screen. It brings Android's back button and a dismiss area that
 * really covers the whole screen — a backdrop drawn by the dock would reach
 * outside the dock's bounds, and Android does not deliver touches there.
 *
 * Being a modal is also why a choice waits for it to close. `onChoose` fires
 * only once the menu is gone: a picker launched while the menu was still
 * leaving was presented on the menu's own view controller, and iOS dismissed
 * it with the menu — the Files browser opened and vanished in the same breath,
 * and a picker torn down that way can leave its request unanswered, which
 * refuses every later one.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { glassLift } from '@jarida/ink';
import { InkText, useInkTheme, useReduceMotion } from '@/components/ui/ink';

import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import type { IconName } from '@/constants/icons';
import type { TranslationKey } from '@/services/i18n';
import type { AttachSource } from '@/services/media';
import type { ResearchItem } from '@/view-models/use-deep-research';

/** Response 0.3s, critically damped: a menu appearing carried no momentum. */
const SPRING = { stiffness: 420, damping: 41, mass: 1 } as const;

/**
 * iOS says when the modal has gone (`onDismiss`), and that is the moment to
 * launch. This long after the menu leaves the tree, the choice goes ahead
 * anyway: on a platform that does not say, and as a backstop if iOS never does.
 */
const DISMISS_BACKSTOP_MS = 500;

const SOURCES: { source: AttachSource; icon: IconName; label: TranslationKey }[] = [
  { source: 'camera', icon: 'camera', label: 'chat.composer.camera' },
  { source: 'photos', icon: 'photo', label: 'chat.composer.photos' },
  { source: 'files', icon: 'file', label: 'chat.composer.files' },
];

export interface AttachMenuProps {
  open: boolean;
  onClose: () => void;
  /** A source was chosen. Called once the menu has closed, never while it is leaving. */
  onChoose: (source: AttachSource) => void;
  /** The research row, as `researchItem` works it out; absent, the menu offers only sources. */
  research?: ResearchItem;
  /** Research mode is on, which takes a question alone, so the sources wait. */
  researching?: boolean;
  /** Research was chosen; called once the menu has closed, so the field can take the focus. */
  onResearch?: () => void;
  /** Web watch was chosen; called once the menu has closed, so the guided sheet can open. */
  onWebWatch?: () => void;
  /** Where the plus button's top edge is, measured up from the screen's foot. */
  anchorBottom: number;
  /** The plus button's left edge. */
  anchorLeft: number;
}

export function AttachMenu({
  open,
  onClose,
  onChoose,
  research,
  researching = false,
  onResearch,
  onWebWatch,
  anchorBottom,
  anchorLeft,
}: AttachMenuProps) {
  const theme = useInkTheme();
  const reduced = useReduceMotion();
  const { t } = useTranslation();
  const [exiting, setExiting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [progress] = useState(() => new Animated.Value(0));

  // The exit has to begin on the pass that closes the menu, or its first
  // frame is spent unmounted — so this is derived during render.
  if (open !== wasOpen) {
    setWasOpen(open);
    setExiting(!open && !reduced);
  }

  useEffect(() => {
    const to = open ? 1 : 0;
    if (reduced) {
      progress.setValue(to);
      return;
    }
    Animated.spring(progress, { toValue: to, ...SPRING, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished && !open) setExiting(false);
      },
    );
  }, [open, reduced, progress]);

  // The choice, held until the menu has gone; see the header.
  const chosen = useRef<AttachSource | 'research' | 'web-watch' | null>(null);
  const release = useCallback(() => {
    const source = chosen.current;
    chosen.current = null;
    if (source === 'research') onResearch?.();
    else if (source === 'web-watch') onWebWatch?.();
    else if (source) onChoose(source);
  }, [onChoose, onResearch, onWebWatch]);

  const shown = open || exiting;
  useEffect(() => {
    if (shown || !chosen.current) return;
    const backstop = setTimeout(release, Platform.OS === 'ios' ? DISMISS_BACKSTOP_MS : 0);
    return () => clearTimeout(backstop);
  }, [shown, release]);

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });

  return (
    <Modal
      visible={shown}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
      onDismiss={release}
    >
      <GPressable feedback="none" haptic="none"
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessible={false}
        importantForAccessibility="no"
      />
      <Animated.View
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
        pointerEvents={open ? 'auto' : 'none'}
        style={[
          styles.panel,
          {
            left: anchorLeft,
            bottom: anchorBottom + theme.space[2],
            borderRadius: theme.radius.xl,
            backgroundColor: theme.color.chrome,
            borderColor: theme.color.lineStrong,
            borderWidth: theme.edge.hairlineWidth,
            opacity: progress,
            transform: [{ scale }],
          },
          glassLift(theme),
        ]}
      >
        {SOURCES.map((s) => (
          <GPressable
            key={s.source}
            feedback="tint"
            disabled={researching}
            onPress={() => {
              chosen.current = s.source;
              onClose();
            }}
            accessibilityRole="button"
            accessibilityState={{ disabled: researching }}
            style={[styles.row, { borderRadius: theme.radius.md }, researching ? styles.dim : null]}
          >
            <GIcon name={s.icon} size={20} color={theme.color.text} />
            <InkText size="md" weight="medium">
              {t(s.label)}
            </InkText>
          </GPressable>
        ))}
        {researching ? (
          <View style={styles.note}>
            <InkText size="sm" tone="secondary">
              {t('chat.research.attachOff')}
            </InkText>
          </View>
        ) : null}
        {research?.shown || onWebWatch ? (
          <View style={[styles.rule, { backgroundColor: theme.color.line, height: theme.edge.hairlineWidth }]} />
        ) : null}
        {research?.shown ? (
          <GPressable
            feedback="tint"
            disabled={research.disabled || researching}
            onPress={() => {
              chosen.current = 'research';
              onClose();
            }}
            accessibilityRole="button"
            accessibilityState={{ disabled: research.disabled || researching }}
            accessibilityHint={research.noteKey ? t(research.noteKey) : t('chat.research.menuHint')}
            style={[styles.row, styles.tall, { borderRadius: theme.radius.md }, research.disabled ? styles.dim : null]}
          >
            <GIcon name="search" size={20} color={theme.color.text} />
            <View style={styles.words}>
              <InkText size="md" weight="medium">
                {t('chat.research.menu')}
              </InkText>
              <InkText size="sm" tone="secondary">
                {research.noteKey ? t(research.noteKey) : t('chat.research.menuHint')}
              </InkText>
            </View>
          </GPressable>
        ) : null}
        {onWebWatch ? (
          <GPressable
            feedback="tint"
            disabled={researching}
            onPress={() => {
              chosen.current = 'web-watch';
              onClose();
            }}
            accessibilityRole="button"
            accessibilityState={{ disabled: researching }}
            accessibilityHint="Watch a webpage or search the web for updates."
            style={[styles.row, styles.tall, { borderRadius: theme.radius.md }, researching ? styles.dim : null]}
          >
            <GIcon name="eye" size={20} color={theme.color.text} />
            <View style={styles.words}>
              <InkText size="md" weight="medium">
                Web watch
              </InkText>
              <InkText size="sm" tone="secondary">
                Your Pond watches a page or searches the web and tells you when something matches.
              </InkText>
            </View>
          </GPressable>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    width: 264,
    padding: 6,
    // The corner it grows from is the plus button's.
    transformOrigin: 'bottom left',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  tall: { paddingVertical: 10, alignItems: 'flex-start' },
  words: { flex: 1, gap: 2 },
  dim: { opacity: 0.45 },
  note: { paddingHorizontal: 12, paddingBottom: 8 },
  rule: { marginVertical: 4, marginHorizontal: 12 },
});
