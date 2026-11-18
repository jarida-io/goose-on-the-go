/**
 * Copies a text exactly as written, markdown and all, so a code block or a reply pastes the way it
 * reads. The icon turns to a check for a moment, which is the only word a copy needs.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { hitSlop } from '@jarida/ink';
import { useInkTheme } from '@/components/ui/ink';

import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { copyText } from '@/services/clipboard';
import { selectionTick } from '@/services/haptics';

/** The quiet buttons under a reply: as tall as the chip beside them. */
export const ACTION_HEIGHT = 24;
const COPIED_MS = 1500;

export function CopyButton({
  text,
  label,
  style,
  onLongPress,
}: {
  text: string;
  label?: string;
  style?: StyleProp<ViewStyle>;
  onLongPress?: () => void;
}) {
  const theme = useInkTheme();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <GPressable
      feedback="tint"
      onPress={() => {
        void selectionTick();
        // A build without the clipboard offers the share sheet instead, which says nothing was copied.
        void copyText(text).then((done) => setCopied(done === 'copied'));
      }}
      onLongPress={
        onLongPress
          ? () => {
              void selectionTick();
              onLongPress();
            }
          : undefined
      }
      accessibilityRole="button"
      accessibilityLabel={copied ? t('chat.reply.copied') : (label ?? t('chat.reply.copy'))}
      hitSlop={hitSlop(ACTION_HEIGHT)}
      style={[styles.button, { borderRadius: theme.radius.pill }, style]}
    >
      <GIcon name={copied ? 'check' : 'copy'} size={15} color={copied ? theme.color.success : theme.color.textSecondary} />
    </GPressable>
  );
}

const styles = StyleSheet.create({
  button: { height: ACTION_HEIGHT, minWidth: 32, alignItems: 'center', justifyContent: 'center' },
});
