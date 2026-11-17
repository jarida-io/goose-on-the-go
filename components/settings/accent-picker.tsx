/**
 * The colour the whole app is drawn in: five swatches, the same five the Pond's dashboard offers
 * under Appearance. Choosing one recolours every screen at once, because every colour the app uses
 * is built from the scheme and this accent (`themeColors`), and Ink is handed the same accent.
 * Stored on this phone only; the Pond never sees it.
 */

import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { GIcon } from '@/components/ui/g-icon';
import { GPressable } from '@/components/ui/g-pressable';
import { THEME_ACCENTS, themeColors, type ThemeAccent, type ThemeColors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { TranslationKey } from '@/services/i18n';
import { useTheme } from '@/providers/theme-provider';

const NAME_KEYS: Record<ThemeAccent, TranslationKey> = {
  Purple: 'settings.accent.purple',
  Blue: 'settings.accent.blue',
  Teal: 'settings.accent.teal',
  Coral: 'settings.accent.coral',
  Magenta: 'settings.accent.magenta',
};

export function AccentPicker() {
  const { accent, setAccent, colorScheme, colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();

  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t('settings.accent.label')}>
      {THEME_ACCENTS.map((name) => {
        const chosen = name === accent;
        const swatch = themeColors(colorScheme, name);
        return (
          <GPressable
            key={name}
            feedback="lift"
            haptic="selection"
            style={styles.choice}
            accessibilityRole="radio"
            accessibilityState={{ checked: chosen }}
            accessibilityLabel={t(NAME_KEYS[name])}
            onPress={() => setAccent(name)}
          >
            <View style={[styles.ring, { borderColor: chosen ? swatch.tint : 'transparent' }]}>
              <View style={[styles.swatch, { backgroundColor: swatch.tint }]}>
                {chosen ? <GIcon name="check" size={18} color={swatch.textOnBrand} /> : null}
              </View>
            </View>
            <Text style={[styles.name, chosen && { color: colors.text, fontWeight: FontWeight.semibold }]}>{t(NAME_KEYS[name])}</Text>
          </GPressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: Spacing.sm, paddingVertical: Spacing.md },
    choice: { alignItems: 'center', gap: Spacing.xs, minWidth: 56 },
    ring: { padding: 3, borderRadius: 999, borderWidth: 2 },
    swatch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    name: { color: c.textSecondary, fontSize: FontSize.xs },
  });
