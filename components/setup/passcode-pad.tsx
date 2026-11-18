import React from 'react';
import { StyleSheet, View } from 'react-native';
import { InkButton, InkNotice, InkText, useInkTheme } from '@/components/ui/ink';

import { GPressable } from '@/components/ui/g-pressable';
import { Spacing } from '@/constants/spacing';
import { selectionTick } from '@/services/haptics';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const;

export function PasscodePad({
  title,
  subtitle,
  length,
  maxLength = 12,
  value,
  error,
  busy,
  autoSubmit = true,
  submitLabel = 'Continue',
  forgotLabel,
  onForgot,
  onChange,
  onSubmit,
}: {
  title: string;
  subtitle?: string;
  length: number;
  maxLength?: number;
  value: string;
  error?: string | null;
  busy?: boolean;
  autoSubmit?: boolean;
  submitLabel?: string;
  forgotLabel?: string;
  onForgot?: () => void;
  onChange: (next: string) => void;
  onSubmit: (code: string) => void;
}) {
  const theme = useInkTheme();
  const press = (k: string) => {
    if (busy || !k) return;
    void selectionTick();
    if (k === '⌫') {
      onChange(value.slice(0, -1));
      return;
    }
    const next = (value + k).slice(0, Math.max(length, maxLength));
    onChange(next);
    if (autoSubmit && next.length >= length) {
      onSubmit(next);
    }
  };

  const dotCount = Math.max(length, value.length);

  return (
    <View style={padStyles.wrap}>
      <InkText size="lg" weight="semibold" style={padStyles.center}>{title}</InkText>
      {subtitle ? <InkText size="sm" tone="secondary" style={padStyles.center}>{subtitle}</InkText> : null}
      <View style={padStyles.dots}>
        {Array.from({ length: dotCount }).map((_, i) => (
          <View
            key={i}
            style={[
              padStyles.dot,
              {
                borderColor: theme.color.accentLine,
                backgroundColor: i < value.length ? theme.color.accentLine : 'transparent',
              },
            ]}
          />
        ))}
      </View>
      {error ? <InkNotice tone="danger">{error}</InkNotice> : null}
      <View style={padStyles.grid}>
        {KEYS.map((k, idx) => (
          <GPressable
            key={`${k}-${idx}`}
            disabled={!k || busy}
            onPress={() => press(k)}
            accessibilityRole={k ? 'button' : undefined}
            accessibilityLabel={k === '⌫' ? 'Delete' : k || undefined}
            style={[
              padStyles.key,
              k ? { borderColor: theme.color.line, backgroundColor: theme.color.chrome } : padStyles.blankKey,
            ]}
          >
            <InkText size="xl" weight="semibold">{k}</InkText>
          </GPressable>
        ))}
      </View>
      {value.length >= length ? (
        <InkButton variant="primary" block loading={busy} onPress={() => onSubmit(value)}>
          {submitLabel}
        </InkButton>
      ) : null}
      {forgotLabel && onForgot ? (
        <InkButton variant="quiet" block disabled={busy} onPress={onForgot}>
          {forgotLabel}
        </InkButton>
      ) : null}
    </View>
  );
}

const padStyles = StyleSheet.create({
  wrap: { gap: Spacing.md, paddingBottom: Spacing.xl, alignItems: 'center' },
  center: { textAlign: 'center' },
  dots: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.md, marginVertical: Spacing.sm },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 252, gap: Spacing.md, justifyContent: 'center' },
  key: { width: 72, height: 56, borderRadius: 28, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  blankKey: { borderWidth: 0, backgroundColor: 'transparent' },
});
