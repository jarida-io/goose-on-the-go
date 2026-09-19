import { api } from '@/services/api-client';
/**
 * NotificationsProvider — live server notifications for the paired Pond.
 *
 * While the app is in the foreground and a session token exists, this keeps
 * an SSE connection to `GET /api/v1/notifications/stream` (see
 * `services/notification-stream.ts`). Notifications queued while the phone
 * was away are flushed by the server on connect, so nothing is lost between
 * sessions. Background/killed-state delivery is the server's FCM/APNs relay
 * (still stubbed server-side) — out of scope here.
 *
 * Arrivals are presented in the phone's own notification shade
 * (`services/local-notifications.ts`) rather than as an in-app banner, so a
 * notice outlives the screen the user happened to be on.
 *
 * Exposes the received list (newest first, capped), an unread count, and
 * `markAllRead()` for the notifications UI.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { getInstallId } from '@/services/install-id';
import {
  NotificationStream, NotificationDeduplicator,
  type ServerNotification,
} from '@/services/notification-stream';
import { registerPushToken, watchPushTokenRotation } from '@/services/push-token';
import { configureLocalNotifications, presentLocally } from '@/services/local-notifications';
import { useServer } from '@/providers/server-provider';

/** Newest notifications kept in memory for the UI. */
const MAX_KEPT = 50;

interface NotificationsContextValue {
  /** Newest first. */
  notifications: ServerNotification[];
  unreadCount: number;
  markAllRead: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: PropsWithChildren) {
  const { serverUrl, token, online, recover } = useServer();
  const deduplicator = useMemo(() => new NotificationDeduplicator(), []);
  const [notifications, setNotifications] = useState<ServerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const streamRef = useRef<NotificationStream | null>(null);

  useEffect(() => {
    if (!token || !serverUrl || !online) return;
    let cancelled = false;

    const startStream = async () => {
      const deviceId = await getInstallId();
      if (cancelled || AppState.currentState !== 'active') return;
      const stream = new NotificationStream({
        baseUrl: serverUrl,
        deduplicator,
        deviceId,
        token,
        onDisconnect: () => { void recover(); },
        onAuthFailure: () => { void api.refreshAuthentication().then((ok) => { if (ok) void recover(); else console.warn('[notifications] local pairing may be required'); }).catch(() => console.warn('[notifications] token refresh failed; not retrying rotation')); },
        onNotification: (n) => {
          setNotifications((prev) => [n, ...prev].slice(0, MAX_KEPT));
          setUnreadCount((prev) => prev + 1);
          // Presentation is the phone's own notification shade. There is no
          // in-app banner: a second, app-only copy of the same notice was one
          // more thing to dismiss and it disappeared the moment the app did.
          void presentLocally(n);
        },
      });
      streamRef.current = stream;
      stream.start();
    };

    void startStream();

    // Channels and the foreground handler, so a streamed notification can reach
    // the phone's shade rather than living and dying inside the app.
    void configureLocalNotifications();

    // Background push (Path B): register the native FCM/APNs token with the
    // paired server and keep it fresh across platform rotations. No-ops
    // cleanly where push is unavailable (Expo Go, simulators, permission
    // denied) — foreground SSE above works regardless.
    registerPushToken().catch((e) => console.log('[push] registration failed:', e));
    const stopTokenWatch = watchPushTokenRotation();

    // The stream only needs to live while the app is foregrounded; RN kills
    // long-lived sockets in the background anyway, and the server re-flushes
    // undelivered notifications on the next connect.
    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        streamRef.current?.stop();
        void startStream();
      } else {
        streamRef.current?.stop();
      }
    };
    const sub = AppState.addEventListener('change', onAppState);

    return () => {
      cancelled = true;
      sub.remove();
      stopTokenWatch();
      streamRef.current?.stop();
      streamRef.current = null;
    };
  }, [serverUrl, token, online, recover, deduplicator]);

  const markAllRead = useCallback(() => setUnreadCount(0), []);

  const value = useMemo<NotificationsContextValue>(
    () => ({ notifications, unreadCount, markAllRead }),
    [notifications, unreadCount, markAllRead],
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
}

/**
 * Access live server notifications.
 * Must be called within a `<NotificationsProvider>`.
 */
export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a <NotificationsProvider>');
  }
  return ctx;
}
