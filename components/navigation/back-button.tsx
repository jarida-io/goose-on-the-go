/**
 * The back control in every stack screen's header.
 *
 * These screens are pushed from the tab group through the *root* stack, so the nested navigator in
 * `app/(stack)/_layout.tsx` has exactly one entry in its own history and suppresses the system back
 * button. Without this, every one of them is a dead end reachable only by the edge-swipe gesture --
 * which is invisible, and which a person who has turned it off does not have at all.
 *
 * A screen with history of its own, such as a folder opened in place in Files, passes `onPress` to
 * go back through that first; it decides when to hand back to the router.
 */

import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { face } from '@/constants/typography';
import { useTheme } from '@/providers/theme-provider';
import { selectionTick } from '@/services/haptics';

function useBackAction(onPress?: () => void) {
  const router = useRouter();
  return useCallback(() => {
    void selectionTick();
    if (onPress) onPress();
    else router.back();
  }, [onPress, router]);
}

export function BackButton({ onPress }: { onPress?: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const back = useBackAction(onPress);

  return (
    <GPressable
      onPress={back}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      style={styles.backButton}
    >
      <GIcon name="chevron-left" size={22} color={colors.text} />
    </GPressable>
  );
}

export function BackTitle({ children, onPress }: { children: string; onPress?: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const back = useBackAction(onPress);

  return (
    <GPressable
      onPress={back}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={children}
      accessibilityHint={t('common.back')}
      style={styles.titleButton}
    >
      <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
        {children}
      </Text>
    </GPressable>
  );
}

export interface StackHeaderProps {
  options: {
    title?: string;
    headerLeft?: (props: { canGoBack?: boolean; tintColor?: string }) => React.ReactNode;
    headerTitle?: string | ((props: { children: string; tintColor?: string }) => React.ReactNode);
    headerRight?: (props: { canGoBack?: boolean; tintColor?: string }) => React.ReactNode;
  };
  route: { name: string };
  back?: unknown;
}

/**
 * Shared React Native stack header so iOS and Android render the exact same
 * flat `<` back control without the native iOS circular glass pill.
 */
export function StackHeader({ options, route, back }: StackHeaderProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const titleText = typeof options.title === 'string' ? options.title : route.name;
  const canGoBack = Boolean(back);

  const left = options.headerLeft
    ? options.headerLeft({ canGoBack, tintColor: colors.text })
    : canGoBack
      ? <BackButton />
      : null;

  const titleNode =
    typeof options.headerTitle === 'function'
      ? options.headerTitle({ children: titleText, tintColor: colors.text })
      : <BackTitle>{typeof options.headerTitle === 'string' ? options.headerTitle : titleText}</BackTitle>;

  const right = options.headerRight ? options.headerRight({ canGoBack, tintColor: colors.text }) : null;

  return (
    <View style={[styles.header, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={styles.bar}>
        <View style={styles.side}>{left}</View>
        <View style={styles.center}>{titleNode}</View>
        <View style={[styles.side, styles.sideRight]}>{right}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
  },
  bar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  side: {
    minWidth: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  sideRight: {
    alignItems: 'flex-end',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    padding: 4,
  },
  titleButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  title: {
    fontSize: 17,
    ...face('display', 'bold'),
  },
});
