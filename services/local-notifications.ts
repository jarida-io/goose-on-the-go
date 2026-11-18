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

import type { NotificationResponse } from 'expo-notifications';
import { notifications, type NotificationsModule } from './notifications-module';
import { Linking, Platform } from 'react-native';

import { router } from 'expo-router';

import { api, ApiError } from './api-client';
import i18n from './i18n';
import { markdownToPlain } from './markdown';

import { linkFromData, openRouteFromData, rideOfferFromData, screenPath, type OpenRoute } from './notification-link';
import { answerFrom, categoryFor, handleTodoResponse, promptData, promptFromData, registerTodoCategories, type Prompt } from './todo-prompts';
import type { ServerNotification } from './notification-stream';
import { noteWakeTap, watchWakeTaps } from './wake-alert';
import { wakePingOfNotification } from './wake-ping';

/**
 * How each category of notice reaches the user on Android, decided here and nowhere else.
 *
 * Android groups notifications by channel, and the channel, not the individual notification,
 * decides whether one may interrupt: only a HIGH-importance channel pops up as a heads-up banner.
 * Android never lets an app change a channel's importance once it exists (the user owns it from
 * then on), so a category whose importance changes needs a new channel id, and the old id goes in
 * `RETIRED_CHANNELS` to be deleted.
 *
 * - `alert`: something went wrong or needs looking at now (a failed pairing, a failed run, the
 *   disk filling, remote access down). HIGH, with its own vibration.
 * - `action_required`: a suggestion or reminder waiting for a yes or no, a missed run to answer,
 *   a sign-in to redo. HIGH, on its own channel so the phone's settings can quiet suggestions
 *   without quieting alerts. Before 2026-11-04 these shared the alerts channel, then named
 *   "Security alerts", which none of them is.
 * - `info`: news worth a glance (a schedule's result, a long task done, a device paired, a model
 *   downloaded). HIGH: every one of these is something the household asked the Pond to do or to
 *   say, so it is worth the interruption.
 * - `reply`: the phone's own notice that a reply finished while nobody was reading it. HIGH:
 *   it is posted only when nobody is reading that conversation, so the person has moved on and
 *   asked to be told. Until 2026-11-09 it was DEFAULT and waited in the shade unseen, which read
 *   as the answer never arriving.
 *
 * A category this app does not know arrives as an update.
 */
type Category = 'alert' | 'action_required' | 'info' | 'reply';

interface ChannelSpec {
  id: string;
  /** Read when the channels are created, so they carry the phone's language at the time. */
  name: () => string;
  description: () => string;
  popsUp: boolean;
  vibrationPattern?: number[];
}

const CHANNELS: Record<Category, ChannelSpec> = {
  alert: {
    id: 'giap-alerts',
    name: () => i18n.t('notifications.channels.alerts.name'),
    description: () => i18n.t('notifications.channels.alerts.description'),
    popsUp: true,
    vibrationPattern: [0, 250, 250, 250],
  },
  action_required: {
    id: 'giap-requests',
    name: () => i18n.t('notifications.channels.requests.name'),
    description: () => i18n.t('notifications.channels.requests.description'),
    popsUp: true,
  },
  // `giap-info` was DEFAULT, and Android keeps a channel's importance, so HIGH needed a new id.
  info: {
    id: 'giap-info-v2',
    name: () => i18n.t('notifications.channels.updates.name'),
    description: () => i18n.t('notifications.channels.updates.description'),
    popsUp: true,
  },
  // `giap-replies` was DEFAULT, and Android keeps a channel's importance, so HIGH needed a new id.
  reply: {
    id: 'giap-replies-v2',
    name: () => i18n.t('notifications.channels.replies.name'),
    description: () => i18n.t('notifications.channels.replies.description'),
    popsUp: true,
  },
};

/** Channels earlier versions created and nothing uses now; deleting one never made is a no-op. */
const RETIRED_CHANNELS = ['giap-info', 'giap-replies'];

function channelSpec(category: unknown): ChannelSpec {
  // Own keys only: `'toString' in CHANNELS` is true.
  return typeof category === 'string' && Object.prototype.hasOwnProperty.call(CHANNELS, category)
    ? CHANNELS[category as Category]
    : CHANNELS.info;
}

let configured: Promise<void> | null = null;

/**
 * Show foreground notifications in the shade, popping up the ones whose channel does.
 *
 * Without a handler, expo-notifications suppresses a notification that arrives while the app is
 * in the foreground, which is precisely when the SSE stream is delivering, so nothing would ever
 * reach the shade.
 *
 * `shouldPlaySound` is what decides the heads-up on Android, not `shouldShowBanner`: with it
 * false expo-notifications posts the notification silent (`setSilent`), and Android never pops up
 * a silent notification, whatever its channel. Before 2026-11-04 it was false for every notice,
 * so a notice that arrived while the app was open (over the stream, or the pending fetch on
 * return) landed silently in the shade, and only one presented while the app was in the
 * background, where this handler is not consulted, popped up. With it true the channel decides,
 * the same as in the background: its sound, which the phone's settings can turn off while
 * keeping the pop-up.
 */
function installHandler(Notifications: NotificationsModule): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      // An iPhone's wake line says nothing the stream is not already bringing while the app is open.
      if (wakePingOfNotification(notification)) {
        return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
      }
      const { popsUp } = channelSpec(notification.request.content.data?.category);
      return {
        shouldShowBanner: true, // iOS draws a banner either way; Android follows the sound.
        shouldShowList: true, // And it stays in the shade to be read later.
        shouldPlaySound: popsUp,
        shouldSetBadge: false,
      };
    },
  });
}

async function createChannels(Notifications: NotificationsModule): Promise<void> {
  if (Platform.OS !== 'android') return;

  for (const spec of Object.values(CHANNELS)) {
    await Notifications.setNotificationChannelAsync(spec.id, {
      name: spec.name(),
      description: spec.description(),
      importance: spec.popsUp
        ? Notifications.AndroidImportance.HIGH
        : Notifications.AndroidImportance.DEFAULT,
      ...(spec.vibrationPattern ? { vibrationPattern: spec.vibrationPattern } : {}),
    });
  }
  for (const id of RETIRED_CHANNELS) {
    await Notifications.deleteNotificationChannelAsync(id);
  }
}

/**
 * Prepare the notification channels and handler. Safe to call repeatedly — the
 * work happens once and every later caller awaits the same promise.
 */
export function configureLocalNotifications(): Promise<void> {
  const Notifications = notifications;
  if (!Notifications) return Promise.resolve(); // Expo Go: see notifications-module.ts
  if (!configured) {
    installHandler(Notifications);
    configured = Promise.all([
      createChannels(Notifications).catch((e) => {
        // A channel that cannot be created costs the shade entry, not the app.
        console.warn('[notifications] could not create channels', e);
      }),
      registerTodoCategories(Notifications).catch((e) => {
        // Without the categories a question still arrives; it is answered in the app instead.
        console.warn('[notifications] could not register the to-do buttons', e);
      }),
    ]).then(() => undefined);
  }
  return configured;
}

/**
 * Put one server notification in the shade.
 *
 * Failure is logged rather than thrown: the caller is a stream handler, and a
 * notification that could not be presented must not take the stream down with
 * it. It is still kept in the provider's list either way. Resolves whether it
 * reached the shade, for a caller that must not acknowledge one that did not.
 */
export async function presentLocally(notification: ServerNotification): Promise<boolean> {
  try {
    await configureLocalNotifications();
    const Notifications = notifications;
    if (!Notifications) return false; // Expo Go: see notifications-module.ts
    // A question Goose asks about a to-do carries its own buttons, answered without opening the app.
    const buttons = categoryFor(notification.data);
    await Notifications.scheduleNotificationAsync({
      // The server's own id, so the same notification arriving over both the
      // stream and a remote push replaces itself instead of duplicating.
      identifier: notification.id,
      content: {
        // The Pond sends a schedule's answer as the model wrote it, markdown and all.
        title: markdownToPlain(notification.title),
        body: markdownToPlain(notification.body),
        // A link, a ride offer or a screen to open rides along, already checked, for the tap to act on.
        data: {
          id: notification.id,
          category: notification.category,
          ...linkData(notification.data),
          ...promptData(notification.data),
        },
        ...(buttons ? { categoryIdentifier: buttons } : {}),
      },
      // Android routes by channel, and the channel is carried on the trigger —
      // `NotificationContentInput` has no `channelId`, so a channel set there is
      // silently dropped and every notification lands on the default channel.
      // A bare `{ channelId }` is the immediate, channel-aware trigger.
      trigger:
        Platform.OS === 'android'
          ? { channelId: channelSpec(notification.category).id }
          : null, // iOS has no channels; null is immediate.
    });
    return true;
  } catch (e) {
    console.warn('[notifications] could not present', notification.id, e);
    return false;
  }
}

/**
 * The fields to store on a shade notification for its tap: a link or a ride
 * offer, and a screen to open. Empty when it carries none of them.
 */
function linkData(data: unknown): Record<string, unknown> {
  return { ...actionData(data), ...openData(data) };
}

function actionData(data: unknown): Record<string, unknown> {
  const link = linkFromData(data);
  if (link) return { action: 'open_url', kind: link.kind, url: link.url, label: link.label };
  const offer = rideOfferFromData(data);
  return offer ? { action: 'ride_offer', provider: offer.provider, dropoff: offer.dropoff } : {};
}

function openData(data: unknown): Record<string, unknown> {
  const route = openRouteFromData(data);
  if (!route) return {};
  if (route.open === 'conversation') return { open: route.open, session_id: route.sessionId };
  if (route.open === 'watch') return { open: route.open, ...(route.watchId ? { watch_id: route.watchId } : {}) };
  if (route.open === 'todos') return { open: route.open, ...(route.todoId ? { todo_id: route.todoId } : {}) };
  if (route.open === 'pairing') return { open: 'devices', action: 'pairing_request', ...(route.requestId ? { request_id: route.requestId } : {}) };
  if (route.open === 'news') {
    return { open: route.open, ...(route.storyId ? { story_id: route.storyId } : {}), ...(route.digestId ? { digest_id: route.digestId } : {}) };
  }
  if (route.open === 'cart') return { open: route.open, ...(route.cartId ? { cart_id: route.cartId } : {}) };
  if (route.open === 'anchor') return { open: route.open, ...(route.anchorId ? { anchor_id: route.anchorId } : {}) };
  if (route.open === 'deliverable') return { open: route.open, ...(route.deliverableId ? { deliverable_id: route.deliverableId } : {}) };
  if (route.open === 'questions') {
    return { open: route.open, ...(route.batchId ? { batch_id: route.batchId } : {}), ...(route.anchorId ? { anchor_id: route.anchorId } : {}) };
  }
  if (route.open !== 'schedule') return { open: route.open };
  return {
    open: route.open,
    ...(route.scheduleId ? { schedule_id: route.scheduleId } : {}),
    ...(route.runId ? { run_id: route.runId } : {}),
  };
}

/** Notifications whose tap has been handled in this JS session, by identifier. */
const handledTaps = new Set<string>();

/** Tell the Pond a notice was opened. Never throws and never waited for: the tap has somewhere to go. */
async function reportOpened(id: unknown): Promise<void> {
  if (typeof id !== 'string' || !id) return;
  try {
    await api.notificationOpened(id);
  } catch (e) {
    console.info('[notifications] could not say a notice was opened', { kind: 'notification_opened', error: String(e) });
  }
}

/** Open what a notice's `data` asks for: a ride, a link, or a screen. Nothing when it asks for none. */
function openFromData(data: unknown): void {
  const offer = rideOfferFromData(data);
  if (offer) {
    const { name, latitude, longitude } = offer.dropoff;
    router.push({
      pathname: '/ride',
      params: { name, latitude: String(latitude), longitude: String(longitude), provider: offer.provider },
    });
    return;
  }
  const link = linkFromData(data);
  if (link) {
    Linking.openURL(link.url).catch((e) => {
      // No app and no browser can take it; the notification itself still says where to.
      console.warn('[notifications] could not open link', e);
    });
    return;
  }
  // A question tapped rather than answered opens where it is answered in full: an offer of a
  // reminder from a conversation on Reminders, where the offers are listed, a check-in on the to-dos.
  const route = openRouteFromData(data) ?? promptRoute(promptFromData(data));
  if (!route) return;
  if (route.open !== 'conversation') {
    const href = screenPath(route);
    // A tab is gone back to, not pushed: pushing one from a stack screen stacked a second tab bar
    // into the history, and back then walked through both.
    if (typeof href === 'string' && href.startsWith('/(tabs)/')) router.navigate(href);
    else router.push(href);
    return;
  }
  void conversationOrWall(route).then((opened) => router.push(screenPath(opened)));
}

/** Act on a tapped notification, checking what it carries again first. */
function openTapped(Notifications: NotificationsModule, response: NotificationResponse | null, onWakeTap?: () => void): void {
  if (!response) return;
  // Done, Not yet, Add or No on one of Goose's questions: answered where it is, nothing opened.
  if (answerFrom(response.actionIdentifier, response.notification.request.content.data)) {
    void handleTodoResponse(response, api, Notifications);
    return;
  }
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
  // The iPhone's fixed wake line: it names a notice and carries none, so the fetch decides where it leads.
  const ping = wakePingOfNotification(response.notification);
  if (ping) {
    void reportOpened(ping.notificationId);
    noteWakeTap();
    onWakeTap?.();
    return;
  }
  const data = response.notification.request.content.data;
  // The phone's own notice that a reply finished is not one the Pond keeps a record of.
  if (data?.category !== 'reply') void reportOpened(data?.id);
  openFromData(data);
}

/** Where a tapped question opens: the to-dos, the offers from chats, or the specialists; null for a notice that asks none. */
function promptRoute(prompt: Prompt | null): OpenRoute | null {
  if (!prompt) return null;
  if (prompt.action === 'agent_offer') return { open: 'specialists' };
  return prompt.action === 'todo_offer' ? { open: 'reminders' } : { open: 'todos' };
}

/**
 * The conversation a tap names, or the chat wall when the Pond says there is no such
 * conversation for this phone: deleted since, or another member's, which the Pond answers as
 * missing too. Any other failure (the Pond out of reach, the app still connecting) opens the
 * conversation, which says itself why it cannot load and keeps what it had, as before this check.
 */
async function conversationOrWall(route: Extract<OpenRoute, { open: 'conversation' }>): Promise<OpenRoute> {
  try {
    await api.listSessionMessages(route.sessionId, 1);
    return route;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      console.info('[notifications] the conversation a notice named is not there; opening chat', {
        kind: 'notification_open_fallback',
      });
      return { open: 'chat' };
    }
    return route;
  }
}

/**
 * Open ride and directions links, the ride screen for a ride offer, and the
 * screen the Pond names (schedules, devices, chat, models, extensions or remote
 * access), or the conversation a Pond notice or a reply notice names, when
 * their notification is tapped, including the tap that launched the app.
 * A tap on an iPhone's wake line calls `onWakeTap`, for the caller to fetch what
 * the Pond holds, and then opens the one notice that fetch found, if it found one.
 * Returns the unsubscribe.
 */
export function watchLinkTaps(onWakeTap?: () => void): () => void {
  const Notifications = notifications;
  if (!Notifications) return () => {}; // Expo Go: see notifications-module.ts
  const sub = Notifications.addNotificationResponseReceivedListener((response) => openTapped(Notifications, response, onWakeTap));
  Notifications.getLastNotificationResponseAsync()
    .then((response) => openTapped(Notifications, response, onWakeTap))
    .catch(() => {});
  const stopLeads = watchWakeTaps((notice) => openFromData(notice.data));
  return () => {
    sub.remove();
    stopLeads();
  };
}
