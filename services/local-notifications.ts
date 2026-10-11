/**
 * Puts server notifications in the phone's own notification shade.
 *
 * The SSE stream (`services/notification-stream.ts`) only delivers while the
 * app is connected. Before this, a streamed notice was drawn as an in-app
 * banner and nowhere else, so a "Failed pairing attempt" left no trace the
 * moment the banner was dismissed or the user switched away — there was nothing
 * to go back and read, which is not how any other app on the phone behaves.
 *
 * Presenting each one locally puts it where the user already looks for
 * notifications and leaves it there until they clear it, which is why the
 * in-app banner is gone rather than sitting alongside this.
 *
 * This is deliberately separate from `services/push-token.ts`, which registers
 * for *remote* pushes the server sends when the app is not running. The two
 * meet at `identifier`: both use the server's notification id, so a
 * notification delivered over both paths replaces itself rather than appearing
 * twice.
 */

import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import { linkFromData } from './notification-link';
import type { ServerNotification } from './notification-stream';

/**
 * Android groups notifications by channel, and the channel — not the individual
 * notification — decides whether one may interrupt. Two channels, because a
 * security alert and a schedule result should not arrive the same way.
 */
const ALERT_CHANNEL = 'giap-alerts';
const INFO_CHANNEL = 'giap-info';

/** Categories that warrant a heads-up rather than a quiet shade entry. */
const URGENT = new Set(['alert', 'action_required']);

let configured: Promise<void> | null = null;

/**
 * Show foreground notifications in the shade.
 *
 * Without a handler, expo-notifications suppresses a notification that arrives
 * while the app is in the foreground — which is precisely when the SSE stream
 * is delivering, so nothing would ever reach the shade.
 */
function installHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true, // Heads-up, the same as when the app is closed.
      shouldShowList: true, // And it stays in the shade to be read later.
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function createChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(ALERT_CHANNEL, {
    name: 'Security alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
  await Notifications.setNotificationChannelAsync(INFO_CHANNEL, {
    name: 'Updates',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * Prepare the notification channels and handler. Safe to call repeatedly — the
 * work happens once and every later caller awaits the same promise.
 */
export function configureLocalNotifications(): Promise<void> {
  if (!configured) {
    installHandler();
    configured = createChannels().catch((e) => {
      // A channel that cannot be created costs the shade entry, not the app.
      console.warn('[notifications] could not create channels', e);
    });
  }
  return configured;
}

/**
 * Put one server notification in the shade.
 *
 * Failure is logged rather than thrown: the caller is a stream handler, and a
 * notification that could not be presented must not take the stream down with
 * it. It is still kept in the provider's list either way.
 */
export async function presentLocally(notification: ServerNotification): Promise<void> {
  try {
    await configureLocalNotifications();
    await Notifications.scheduleNotificationAsync({
      // The server's own id, so the same notification arriving over both the
      // stream and a remote push replaces itself instead of duplicating.
      identifier: notification.id,
      content: {
        title: notification.title,
        body: notification.body,
        // A ride or directions link rides along, already checked, for the tap to open.
        data: {
          id: notification.id,
          category: notification.category,
          ...linkData(notification.data),
        },
      },
      // Android routes by channel, and the channel is carried on the trigger —
      // `NotificationContentInput` has no `channelId`, so a channel set there is
      // silently dropped and every notification lands on the default channel.
      // A bare `{ channelId }` is the immediate, channel-aware trigger.
      trigger:
        Platform.OS === 'android'
          ? { channelId: URGENT.has(notification.category) ? ALERT_CHANNEL : INFO_CHANNEL }
          : null, // iOS has no channels; null is immediate.
    });
  } catch (e) {
    console.warn('[notifications] could not present', notification.id, e);
  }
}

/** The open-link fields to store on a shade notification; empty when it carries no link. */
function linkData(data: unknown): Record<string, string> {
  const link = linkFromData(data);
  return link ? { action: 'open_url', kind: link.kind, url: link.url, label: link.label } : {};
}

/** Notifications whose tap has been handled in this JS session, by identifier. */
const handledTaps = new Set<string>();

/** Open the link a tapped notification carries, checking it again first. */
function openTapped(response: Notifications.NotificationResponse | null): void {
  if (!response) return;
  // The listener and the read of the last response can both deliver one tap; it opens once.
  const id = response.notification.request.identifier;
  if (handledTaps.has(id)) return;
  handledTaps.add(id);
  // expo-notifications keeps the last response for as long as its native module lives, so
  // one left in place would reopen its link on every later mount, with no tap at all.
  try {
    Notifications.clearLastNotificationResponse();
  } catch {
    // Not available on this platform; the identifier check still covers this session.
  }
  const link = linkFromData(response.notification.request.content.data);
  if (!link) return;
  Linking.openURL(link.url).catch((e) => {
    // No app and no browser can take it; the notification itself still says where to.
    console.warn('[notifications] could not open link', e);
  });
}

/**
 * Open ride and directions links when their notification is tapped, including
 * the tap that launched the app. Returns the unsubscribe.
 */
export function watchLinkTaps(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(openTapped);
  Notifications.getLastNotificationResponseAsync()
    .then(openTapped)
    .catch(() => {});
  return () => sub.remove();
}
