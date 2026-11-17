import { useEffect, useState, type ReactElement } from 'react';
import { GPressable } from '@/components/ui/g-pressable';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useServer } from '@/providers/server-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ThemeColors } from '@/constants/colors';
import '@/services/i18n';
import { GIcon } from '@/components/ui/g-icon';
import type { IconName } from '@/constants/icons';
import { Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';
import { useTheme } from '@/providers/theme-provider';
import { connectionSurface, stackScreenSurface, type ConnectionPhase } from '@/models/connection';
import { useConnectionStatus } from '@/view-models/use-connection-status';
// The insecure development banner above this one takes the top inset when it is shown.

/**
 * How long a first check may run before the strip says so. The banner pushes every screen down, so
 * showing it for a reconnect that finishes in a few hundred milliseconds -- a network change, a
 * return to the app -- made the whole layout jump for nothing anyone could act on. Once a check has
 * failed the strip stays up through the next ones, rather than leaving and coming back with each.
 */
const RECONNECT_GRACE_MS = 1_500;

/**
 * Shows `children` once the grace period has passed. It holds no reset of its own: the strip
 * renders nothing between outages, so React mounts a fresh one, with a fresh timer, for each.
 */
function AfterGrace({ children }: { children: ReactElement }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), RECONNECT_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);
  return shown ? children : null;
}

/** The glyph for what kind of problem it is: the connection, the pairing, or trust in the Pond. */
function phaseIcon(phase: ConnectionPhase): IconName {
  if (phase === 'pairing') return 'link';
  if (phase === 'trust') return 'shield';
  return 'cloud-off';
}

export interface ConnectionStatusProps {
  /**
   * `banner` sits above the navigator and takes the status-bar inset; `inline` sits under a stack
   * screen's title bar, inside the screen named by `screen`. Each draws only where
   * `connectionSurface` gives the route to it, so the state is told in one place per screen.
   */
  placement?: 'banner' | 'inline';
  /** The stack screen an inline strip belongs to. */
  screen?: string;
}

/**
 * The connection's state where the screen has no card of its own for it: what is happening, why
 * when the checks or the remote-access coordinator say, when the next check runs, and the action that helps -- Try now, or Pair
 * where only pairing can. A working connection says nothing.
 *
 * Screens do not repeat it: while it is up, content that did not arrive shows only that it will
 * fill in (`ContentUnavailable`). Home and Switch Pond tell the same state on the Pond's own card
 * (`PondStatusCard`), and the strip stays off them.
 *
 * The title and the reason are a polite live region, so a screen reader hears the state change;
 * the countdown is left out of the region's label, or it would be read out every second.
 */
export function ConnectionStatus({ placement = 'banner', screen }: ConnectionStatusProps) {
  const status = useConnectionStatus();
  const { connectionState, connectionOutage } = useServer();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();

  const surface = placement === 'inline' ? stackScreenSurface(screen ?? '') : connectionSurface(segments);
  // Before the saved pairing has loaded, the state is a placeholder, not news.
  if (!status.hydrated || status.phase === 'connected' || surface !== placement) return null;
  // The coordinator's account, when it has one, says more than which route did not answer.
  const reason = status.why ?? status.reason;
  const label = reason ? `${status.title}. ${reason}` : status.title;
  const detail = [reason, status.next].filter(Boolean).join(' · ');
  const strip = (
    <View style={[styles.container, placement === 'banner' ? { paddingTop: insets.top + Spacing.xs } : styles.inline]}>
      <GIcon name={phaseIcon(status.phase)} size={16} color={colors.textSecondary} />
      <View style={styles.statement} accessible accessibilityLiveRegion="polite" accessibilityLabel={label}>
        <Text style={styles.title}>{status.title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      {status.phase === 'pairing' ? (
        <GPressable feedback="none" accessibilityRole="button" hitSlop={Spacing.md} onPress={() => router.push('/(stack)/pond-pairing')}>
          <Text style={styles.action}>{t('connection.actionPair')}</Text>
        </GPressable>
      ) : status.retryable ? (
        <GPressable feedback="none"
          accessibilityRole="button"
          accessibilityState={{ disabled: status.checking }}
          disabled={status.checking}
          hitSlop={Spacing.md}
          onPress={status.tryNow}
        >
          <Text style={[styles.action, status.checking && styles.actionIdle]}>{t('connection.tryNow')}</Text>
        </GPressable>
      ) : null}
    </View>
  );
  const firstCheck = connectionState === 'reconnecting' && !connectionOutage?.failures;
  return firstCheck ? <AfterGrace>{strip}</AfterGrace> : strip;
}
/*
 * Themed, because the banner is drawn behind the notification bar.
 *
 * The colours were a hardcoded pale lavender on deep purple. The root layout
 * sets the system status bar's content to light in dark mode, so those white
 * icons landed on a near-white strip and the clock, signal and battery became
 * unreadable -- the notification bar was there, and could not be seen. A
 * surface that follows the scheme keeps the contrast the system is expecting.
 */
const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.lg,
      // Its own ground sets it apart; a rule under it and a margin round the line framed it twice.
      paddingBottom: Spacing.xs,
      backgroundColor: c.backgroundSecondary,
    },
    inline: { paddingTop: Spacing.xs },
    statement: { flex: 1, gap: 2 },
    title: { color: c.text, fontSize: FontSize.sm },
    detail: { color: c.textSecondary, fontSize: FontSize.xs },
    action: { color: c.textBrand, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
    actionIdle: { color: c.textTertiary },
  });
