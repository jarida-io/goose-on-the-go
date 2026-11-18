/**
 * Ink, as this app uses it: every component of `@jarida/ink/native`, with the ones a person
 * presses giving the feel of what they did. A button or card taps, a choice ticks, a switch or a
 * checkbox toggles. Ink itself has no haptics, so without this each screen had to remember them,
 * and many did not (the Devices tab's add button, the Home avatar, the Ask Goose suggestions).
 *
 * Import Ink from here, never from `@jarida/ink/native` directly; the lint rule enforces it. A
 * handler on one of these components needs no `tap()` of its own.
 */
import {
  InkButton as InkButtonBase,
  InkCard as InkCardBase,
  InkCheckbox as InkCheckboxBase,
  InkChip as InkChipBase,
  InkChoice as InkChoiceBase,
  InkListItem as InkListItemBase,
  InkMenu as InkMenuBase,
  InkRadioGroup as InkRadioGroupBase,
  InkSegmented as InkSegmentedBase,
  InkSelect as InkSelectBase,
  InkSheet as InkSheetBase,
  InkSwitch as InkSwitchBase,
  InkIcon,
  inkText,
  renderIconSlot,
  useInkInsets,
  useInkTheme,
  type InkButtonProps,
  type InkCardProps,
  type InkChipProps,
  type InkChoiceProps,
  type InkNoticeProps,
  type InkSegmentedProps,
  type InkSheetProps,
  type InkSwitchProps,
} from '@jarida/ink/native';
import React, { useEffect, useMemo, useRef, type ComponentProps } from 'react';
import { Animated, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { selectionTick, tap, toggle } from '@/services/haptics';

// A name this file defines is not re-exported by `export *` (ECMAScript says so, and Babel's
// transform honours it), so the wrapped components below are the ones the app gets. The
// import/export rule does not model that precedence; ink.test.tsx checks it instead.
/* eslint-disable import/export */
export * from '@jarida/ink/native';

/**
 * `handler`, then `feel`: a handler that gives its own feel first keeps it (haptics drops the
 * second within its press window). Undefined stays undefined, so a disabled control stays inert.
 */
export function withFeel<A extends unknown[]>(
  handler: ((...args: A) => void) | undefined,
  feel: () => Promise<void>,
): ((...args: A) => void) | undefined {
  if (!handler) return undefined;
  return (...args: A) => {
    handler(...args);
    void feel();
  };
}

export function InkButton(props: InkButtonProps) {
  return <InkButtonBase {...props} onPress={withFeel(props.onPress, tap)} />;
}

export function InkCard(props: InkCardProps) {
  return <InkCardBase {...props} onPress={withFeel(props.onPress, tap)} />;
}

export function InkChip(props: InkChipProps) {
  return <InkChipBase {...props} onPress={withFeel(props.onPress, selectionTick)} onRemove={withFeel(props.onRemove, tap)} />;
}

export function InkChoice(props: InkChoiceProps) {
  return <InkChoiceBase {...props} onSelect={withFeel(props.onSelect, selectionTick)} />;
}

export function InkSegmented<T extends string>(props: InkSegmentedProps<T>) {
  return <InkSegmentedBase {...props} onChange={withFeel(props.onChange, selectionTick)!} />;
}

export function InkSwitch(props: InkSwitchProps) {
  return <InkSwitchBase {...props} onChange={withFeel(props.onChange, toggle)!} />;
}

export function InkCheckbox(props: ComponentProps<typeof InkCheckboxBase>) {
  return <InkCheckboxBase {...props} onChange={withFeel(props.onChange, toggle)!} />;
}

export function InkListItem(props: ComponentProps<typeof InkListItemBase>) {
  return <InkListItemBase {...props} onPress={withFeel(props.onPress, tap)} />;
}

export function InkSelect<T extends string>(props: ComponentProps<typeof InkSelectBase<T>>) {
  return <InkSelectBase<T> {...props} onChange={withFeel(props.onChange, selectionTick)!} />;
}

export function InkRadioGroup<T extends string>(props: ComponentProps<typeof InkRadioGroupBase<T>>) {
  return <InkRadioGroupBase<T> {...props} onChange={withFeel(props.onChange, selectionTick)!} />;
}

export function InkMenu(props: ComponentProps<typeof InkMenuBase>) {
  const items = props.items.map((item) => ({ ...item, onPress: withFeel(item.onPress, tap) }));
  return <InkMenuBase {...props} items={items} />;
}

const NOTICE_ICON = { neutral: 'info', brand: 'info', info: 'info', success: 'done', warning: 'alert', danger: 'alert' } as const;

/**
 * A notice as a plain line: an icon in the notice's tone and the words beside it, with no tinted
 * box around them. Only a danger notice puts its words in its tone, and only it interrupts.
 */
export function InkNotice({ tone = 'neutral', icon, action, children }: InkNoticeProps) {
  const theme = useInkTheme();
  const assertive = tone === 'danger';
  const { style } = inkText(theme, { size: 'sm', leading: 'base', color: assertive ? theme.color.dangerFg : theme.color.textSecondary });
  return (
    <View
      accessibilityRole={assertive ? 'alert' : undefined}
      accessibilityLiveRegion={assertive ? 'assertive' : 'polite'}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space[2] }}
    >
      {icon === undefined || typeof icon === 'string' ? <InkIcon name={icon ?? NOTICE_ICON[tone]} size={18} tone={tone} /> : renderIconSlot(icon, 18)}
      <View style={{ flex: 1, gap: theme.space[2] }}>
        <Text style={style}>{children}</Text>
        {action ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>{action}</View> : null}
      </View>
    </View>
  );
}

/**
 * Bottom sheet with a responsive vertical-drag nub so every modal sheet can be
 * dragged up (elastic expand) or down (dismiss) system-wide.
 */
export function InkSheet(props: InkSheetProps) {
  const { open, onClose, side = 'bottom', title, description, dismissible = true, scroll = true, children, style } = props;
  const theme = useInkTheme();
  const insets = useInkInsets();
  const dragY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) dragY.setValue(0);
  }, [open, dragY]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => dismissible,
        onMoveShouldSetPanResponder: (_e, g) => dismissible && Math.abs(g.dy) > 4 && Math.abs(g.dy) >= Math.abs(g.dx),
        onPanResponderMove: (_e, g) => {
          dragY.setValue(g.dy >= 0 ? g.dy : g.dy * 0.35);
        },
        onPanResponderRelease: (_e, g) => {
          if (g.dy > 85 || g.vy > 0.55) {
            Animated.timing(dragY, { toValue: 480, duration: 160, useNativeDriver: true }).start(() => {
              dragY.setValue(0);
              onCloseRef.current();
            });
          } else {
            Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 5 }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 5 }).start();
        },
      }),
    [dismissible, dragY],
  );

  if (side !== 'bottom') {
    return <InkSheetBase {...props} />;
  }

  const heading = inkText(theme, {
    role: 'display',
    size: 'xl',
    weight: theme.weight.bold,
    italic: true,
    tracking: 'title',
    leading: 'tight',
  });
  const body = inkText(theme, { size: 'base', color: theme.color.textSecondary });
  const radius = theme.radius['2xl'];
  const gutter = theme.space[5];

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => (dismissible ? onClose() : undefined)}
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={sheetStyles.backdrop}>
        <Pressable
          accessible={false}
          disabled={!dismissible}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.color.scrim }]}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={sheetStyles.kav}>
          <Animated.View
            style={[
              sheetStyles.panel,
              {
                maxHeight: '88%',
                borderWidth: theme.edge.borderWidth,
                borderColor: theme.color.edge,
                borderBottomWidth: 0,
                backgroundColor: theme.color.surface,
                borderTopLeftRadius: radius,
                borderTopRightRadius: radius,
                paddingBottom: Math.max(theme.space[5], insets.bottom + theme.space[2]),
                transform: [{ translateY: dragY }],
              },
              style,
            ]}
          >
            <View
              {...(dismissible ? pan.panHandlers : {})}
              style={{
                gap: theme.space[2],
                paddingTop: theme.space[2],
                paddingBottom: theme.space[4],
                paddingHorizontal: gutter,
              }}
            >
              {dismissible ? (
                <View style={sheetStyles.grabberHit}>
                  <View
                    style={{
                      width: 40,
                      height: 5,
                      borderRadius: theme.radius.pill,
                      backgroundColor: theme.color.textDisabled,
                    }}
                  />
                </View>
              ) : null}
              <Text accessibilityRole="header" style={heading.style}>
                {title}
              </Text>
              {typeof description === 'string' ? <Text style={body.style}>{description}</Text> : description}
            </View>
            {scroll ? (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                alwaysBounceVertical={false}
                style={sheetStyles.scroll}
                contentContainerStyle={{ gap: theme.space[4], paddingHorizontal: gutter }}
              >
                {children}
              </ScrollView>
            ) : (
              <View style={[sheetStyles.scroll, { gap: theme.space[4], paddingHorizontal: gutter }]}>
                {children}
              </View>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  kav: { width: '100%', justifyContent: 'flex-end' },
  panel: { width: '100%', flexShrink: 1 },
  grabberHit: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 32 },
  scroll: { flexShrink: 1 },
});
