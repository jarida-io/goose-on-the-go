/**
 * A small floating player while the news is read aloud on this phone, so it can be paused,
 * resumed or stopped from wherever the member went after pressing Listen. The phone's own media
 * controls (lock screen, notification shade) are the other way to pause it.
 *
 * It floats rather than taking a row of the screen. A strip across the top sat above each screen's
 * own title bar, which keeps its status-bar inset under it, so two headers stacked and the screen
 * read as broken. On the tabs it rides just above the tab bar, inside the bar's own measured
 * block, so lists clear it as they clear the bar; on other screens it floats over the bottom edge.
 */

import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import type { ThemeColors } from '@/constants/colors';
import { Shadows } from '@/constants/shadows';
import { Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useTheme } from '@/providers/theme-provider';
import { pauseListening, resumeListening, stopListening, useListening } from '@/view-models/news-player';

/** `bar`: in the tab bar's block, above it. `floating`: over the bottom edge of a screen. */
export function NowListening({ placement }: { placement: 'bar' | 'floating' }) {
  const listening = useListening();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (!listening) return null;

  const playing = listening.state === 'playing';
  const loading = listening.state === 'loading';
  const status = listening.state === 'paused' ? t('goose.digest.nowPaused') : t('goose.digest.nowListening');

  return (
    <View
      pointerEvents="box-none"
      style={placement === 'floating' ? [styles.floating, { bottom: insets.bottom + Spacing.md }] : styles.bar}
    >
      <View style={styles.pill}>
        <GIcon name="listen" size={18} color={colors.textBrand} />
        <View style={styles.words} accessible accessibilityLiveRegion="polite" accessibilityLabel={`${status}: ${listening.title}`}>
          <Text style={styles.status}>{status}</Text>
          <Text style={styles.title} numberOfLines={1}>
            {listening.title}
          </Text>
        </View>
        {loading ? null : (
          <GPressable
            feedback="tint"
            haptic="toggle"
            style={styles.button}
            accessibilityRole="button"
            accessibilityLabel={playing ? t('goose.digest.pause') : t('goose.digest.resume')}
            hitSlop={Spacing.sm}
            onPress={playing ? pauseListening : resumeListening}
          >
            <GIcon name={playing ? 'pause' : 'play'} size={20} color={colors.text} />
          </GPressable>
        )}
        <GPressable
          feedback="tint"
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel={t('goose.digest.stop')}
          hitSlop={Spacing.sm}
          onPress={stopListening}
        >
          <GIcon name="x" size={18} color={colors.textSecondary} />
        </GPressable>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    bar: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
    floating: { position: 'absolute', left: Spacing.lg, right: Spacing.lg },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingLeft: Spacing.md,
      paddingRight: Spacing.xs,
      paddingVertical: Spacing.xs,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      backgroundColor: c.backgroundSecondary,
      ...Shadows.md,
    },
    words: { flex: 1, gap: 1 },
    status: { color: c.textSecondary, fontSize: FontSize.xs },
    title: { color: c.text, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
    button: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  });
