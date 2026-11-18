/**
 * ChromePuck — one round control floating over content, in opaque chrome.
 *
 * It floats over a wall of ink-edged cards, and the edge marks content, never
 * chrome: a control wearing the plate there would read as one more card. So a
 * puck is the opaque `chrome` fill, a `lineStrong` hairline and Ink's lift. It
 * stays solid while the bottom bar is glass, on purpose: at a puck's size glass
 * over a card buys little and costs the glyph its contrast, and a tint of
 * `surface`, the very colour the cards are, would separate nothing.
 * VIEW-LAYER.md has the numbers.
 *
 * `marked` puts a dot on it, for a control whose setting is not the default.
 * The dot is `accentLine`, the accent as a mark rather than a fill, because a
 * puck is chrome and the one filled accent on a screen belongs to its content.
 */

import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { glassLift } from '@jarida/ink';
import { useInkTheme } from '@/components/ui/ink';

import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import type { IconName } from '@/constants/icons';

/** The puck's diameter. Past the 44pt touch floor without reaching for `hitSlop`. */
export const PUCK_SIZE = 52;

export interface ChromePuckProps {
  icon: IconName;
  /** Spoken, and the only name the control has — there is no visible label. */
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  marked?: boolean;
  /** What the control currently shows, for a screen reader: "Chats", say. */
  value?: string;
  expanded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ChromePuck({
  icon,
  label,
  onPress,
  onLongPress,
  marked = false,
  value,
  expanded,
  style,
}: ChromePuckProps) {
  const theme = useInkTheme();

  return (
    <GPressable
      feedback="lift"
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={value ? { text: value } : undefined}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      style={[
        styles.puck,
        {
          backgroundColor: theme.color.chrome,
          borderColor: theme.color.lineStrong,
          borderWidth: theme.edge.hairlineWidth,
        },
        glassLift(theme),
        style,
      ]}
    >
      <GIcon name={icon} size={20} color={theme.color.text} />
      {marked ? (
        <View
          pointerEvents="none"
          style={[styles.mark, { backgroundColor: theme.color.accentLine }]}
        />
      ) : null}
    </GPressable>
  );
}

const styles = StyleSheet.create({
  puck: {
    width: PUCK_SIZE,
    height: PUCK_SIZE,
    borderRadius: PUCK_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    position: 'absolute',
    top: 11,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
