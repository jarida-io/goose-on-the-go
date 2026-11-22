# Notifications

How a notice from the Pond reaches the phone's notification shade, with the app open, in the
background, and closed.

## The three paths

| Path | When it delivers | Code |
|---|---|---|
| SSE stream, `GET /api/v1/notifications/stream` | App in the foreground; on Android also in the background while "Stay connected in the background" is on | `services/background-connection.ts`, `services/notification-stream.ts` |
| Push wake-up, then `GET /api/v1/notifications/pending` | Whenever the Pond sends one; the fallback when Android has paused the stream, and the only background path on iOS | `services/notification-wake.ts`, `services/background-notifications.ts` |
| The same pending fetch on return to the foreground | Each time the app comes back to the front | `providers/notifications-provider.tsx` |

They overlap on purpose. All three end in `services/notification-delivery.ts`, which is what
keeps a notice from being shown twice:

1. **One deduplicator per JavaScript runtime.** A notice the stream delivered and the pending list
   then offers again is seen once.
2. **The server's id is the shade identifier** (`presentLocally` in
   `services/local-notifications.ts`). A headless wake-up and the app later are separate runtimes;
   the second presentation of the same id replaces the first rather than adding a row.
3. **Every delivered notice is acknowledged** with `POST /api/v1/notifications/{id}/ack`, so the
   Pond stops offering it. The body is `{"shown": true}` when the shade took the notice, and empty
   otherwise; the Pond records the two apart. A tap on a notice also sends
   `POST /api/v1/notifications/{id}/opened`, never waited for: the tap opens its screen whatever the
   Pond answers. The pending path acknowledges everything it fetched, including notices
   it had already shown. The stream path acknowledges only through a client whose token rotation
   is persisted (`PondApiClient.hasSession`): an acknowledgement that triggered an unpersisted
   refresh would strand the phone's refresh token.

`GET /notifications/pending` may answer a bare array or `{ "notifications": [...] }`; each item is
the stream's `ServerNotification` shape (`id`, `target`, `category`, `title`, `body`, optional
`data`). An item without an id, title and body is logged and skipped.

## Which notices pop up (2026-11-04)

`services/local-notifications.ts` decides, per category, in its `CHANNELS` table. On Android the
channel decides whether a notice may pop up as a heads-up banner; only a HIGH-importance channel
does.

| Category | Channel | Importance | Notices |
|---|---|---|---|
| `alert` | `giap-alerts`, "Alerts" | HIGH, with vibration | a failed pairing, a failed run, low disk, remote access down, a device removed |
| `action_required` | `giap-requests`, "Suggestions and questions" | HIGH | suggestions and reminders, a missed run to answer, a sign-in to redo |
| `info`, and any category this app does not know | `giap-info-v2`, "Updates" | HIGH | schedule results, a long task done, a device paired, a model downloaded |
| `reply` (the phone's own) | `giap-replies-v2`, "Replies" | HIGH | a reply that finished while nobody was reading it; pops up, since it is posted only when nobody is reading that conversation. `giap-replies` was DEFAULT until 2026-11-09 and is deleted |

**Why only some popped up before.** The handler that presents a notice while the app is in the
foreground answered `shouldPlaySound: false` for every notice. expo-notifications then posts the
notification silent (`setSilent`, in its `ExpoNotificationBuilder`), and Android never pops up a
silent notification, whatever the channel. A notice presented while the app was in the
background, where the handler is not consulted, popped up; one that arrived over the stream or the
pending fetch while the app was open landed silently in the shade. That is why a Daily Brief that
arrived by push wake-up popped up and a suggestion that arrived while the app was open did not.
The handler now lets a notice sound exactly when its channel pops up, so the channel decides in
both cases. Its sound is the channel's, which the phone's settings can turn off while keeping the
pop-up.

**Changing a channel.** Android keeps a channel's importance once created; the user owns it from
then on. A category whose importance changes needs a new channel id, and the old id goes in
`RETIRED_CHANNELS`, which is deleted on every start (deleting a channel that does not exist is a
no-op). `giap-info` (DEFAULT) is retired that way. A channel's name and description can change in
place: `giap-alerts` was named "Security alerts" and also carried `action_required` until
2026-11-04. The names and descriptions are in `notifications.channels` in
`services/i18n/locales/en.json`.

## What a tap opens

`services/notification-link.ts` reads the Pond's `open` hint against an allow-list, and
`openTapped` in `services/local-notifications.ts` acts on it. The contract is "Route hints" in the
Pond's `docs/architecture/notifications.md`. A `chat` hint with a `session_id` (a long task done,
an agent's run, a suggestion from a reminder) becomes the `conversation` route the phone's own
reply notice uses. Before opening it, the tap asks the Pond for that conversation
(`GET /sessions/{id}/messages?limit=1`): a 404 (deleted, or another member's) opens the chat tab
instead, and any other failure opens the conversation, which says itself why it cannot load. A
missing or malformed id opens the chat tab, as every `chat` hint did before 2026-11-04.

The idea engine's notices name three more screens: `deliverable` (`deliverable_id`, a piece of
work that is ready or changed) opens `/(stack)/goose-deliverable`; `anchor` (`anchor_id`, the
heartbeat's heads-up about a plan) opens `/(stack)/goose-anchor`; `questions` (`batch_id`,
optional `anchor_id`) opens `/(stack)/goose-questions` with that batch. An id of the wrong shape
is dropped and the plans list, or every open question, opens instead.

Some notices are answered from their own buttons without opening the app (`services/todo-prompts.ts`):
a to-do check-in (Done, Not yet), an offer from a chat (Add, No), and a specialist offer
(`action: "agent_offer"`, `agent: "budget"`), whose Turn on button sends
`PUT /me/agents/budget {on: true}`. Each button is sent once however often the press is
delivered, and the notice leaves the shade once answered. Tapped rather than answered, a
specialist offer opens the specialists screen.

## Push wake-up

The Pond sends FCM a **data-only** message at high priority, `{ notification_id, category,
wake: "1" }`, with no title or body. Nothing readable transits Google or Apple; see
[PRIVACY.md](./PRIVACY.md).

- `index.ts` imports `services/background-notifications.ts` before `expo-router/entry`. That
  module defines the expo-task-manager task and calls `Notifications.registerTaskAsync` at module
  scope, because a headless start loads the bundle without mounting any screen.
- On Android, expo-notifications hands every FCM message to registered tasks, in the foreground,
  the background and with the app killed, and draws nothing itself for a message with no title or
  body (`ExpoHandlingDelegate.shouldPresent`). The data map arrives as the payload's `data`.
- The handler (`handleWake`) ignores anything without `wake: "1"`, restores the pairing if the
  app is not running (`ensurePondSession` in `services/pond-session.ts`: saved identity and
  addresses, remote transport, pinning, then the same `ConnectionManager` the app uses), fetches,
  presents, acknowledges, and logs one line with counts and duration. It is bounded at 20 seconds
  and never throws.
- A fetched notice reaches the shade with the time the Pond recorded it added to its text
  (`withEventTime`), because the shade shows only when it arrived. After a wake-up, one the shade
  refused is left unacknowledged, so the next wake-up fetches it again.
- The task leaves a wake to the stream while the app is open. When the pass above reaches no
  Pond, the wake ping's own pull (`handleWakePing` in `services/wake-handler.ts`) tries the home
  addresses directly (`services/background-pond.ts`). When that fails too, the phone shows "Alert
  from your Pond" (or "Update") with no detail, under the alert's own id (`standIn`), so the real
  alert replaces it once fetched. Nothing in it came from anywhere but the ping.
- On iOS the pairing is kept readable after the first unlock (`services/secure-storage.ts`), since
  a wake-up arrives while the phone is locked and needs it to reach the Pond.
- A token refresh during a headless wake-up is persisted to the secure store, so the app does not
  later start with a refresh token the Pond has retired.
- `POST_NOTIFICATIONS` (Android 13 and later) is requested by `registerPushToken`. Without it the
  task still runs and acknowledges, but Android shows nothing.
- **iOS** gets the same three keys at the top of the APNs payload under one visible line, "Something
  new from your Pond.", because iOS throttles silent pushes and drops them for an app the person
  swiped away. `readWakePing` reads the keys there as well as under `data`. Once a fetch of the
  pending list has shown and acknowledged what it stood for, the line is taken out of the shade
  (`services/wake-alert.ts`); while the shade refuses a notice the line stays. While the app is open
  the line is not drawn at all. A tap on it opens the app, fetches, and opens the notice's screen
  when the fetch found exactly one; with several it leaves the app where it is. No stand-in is shown
  over it when the Pond cannot be reached: the line already says as much.
- **iOS** needs `content-available: 1` on the APNs payload and the `remote-notification`
  background mode, which `app.json` turns on through expo-notifications'
  `enableBackgroundRemoteNotifications`. iOS decides how often a background push is honoured, and
  Apple advises no more than two or three an hour.
- Android may also defer or drop high-priority messages for an app it considers abusive of them
  (FCM deprioritises high-priority messages that do not lead to a visible notification). Each
  wake-up here should lead to one, which is another reason the Pond sends it only when it has
  something to show.

## Stay connected in the background (Android)

Settings, This phone, Notifications: **Stay connected in the background**, off by default. Stored
on the phone (`Storage` key `stayConnected`), not on the Pond. It was on by default until
2026-11, and holding the stream open all day was the largest drain on Android batteries the app
had; a phone that never chose keeps it off, and one that turned it on keeps its choice. With it
off, the push wake-up delivers, sometimes later while the phone is idle.

While it is on and the phone is paired, `NotificationsProvider` starts `PondPresenceService`
(`plugins/pond-presence/PondPresence.kt`, wired by `plugins/with-pond-presence.js`): an Android
foreground service with an ongoing, low-importance notification on its own channel, "Background
connection". The service holds the process at foreground priority; the stream itself is the same
JavaScript stream the app uses in the foreground, which now lives in
`services/background-connection.ts` rather than in a provider. That move is load-bearing: when the
user swipes the app out of recents, React Native stops the surface and every provider unmounts,
while the process and its JavaScript runtime carry on under the service.

Lifecycle, as pure functions in `services/background-connection.ts` and tested there:

- `shouldRunService`: Android, paired, setting on. Turning the setting off or unpairing (including
  the Pond revoking this phone) stops the service.
- `shouldHoldStream`: always while the app is in front; in the background only while the service
  runs. On iOS, and on Android with the setting off, the stream closes when the app leaves the
  front, as it always did.
- The service is started only while the app is in the foreground. Android 12 and later refuse a
  foreground-service start from the background; the refusal is logged and the push wake-up covers
  delivery.
- A dropped stream reconnects with its own backoff, 1 s doubling to 30 s in the foreground and
  to five minutes in the background (`maxBackoff`), so an unreachable Pond does not wake the radio
  every 30 s all day. While the app is open the
  provider also asks the connection manager to look for a better endpoint; while it is not, the
  stream keeps retrying the endpoint it had, and the next foreground pass re-selects. A 401 with no
  provider mounted stops the stream, since nothing there can refresh the token; the wake-up
  delivers until the app is opened.
- The service is not sticky. If Android kills the process, the service goes with it rather than
  being recreated without a stream behind its notification, and the push wake-up delivers.
- On return to the foreground the stream is restarted, since one held through Doze may be wedged,
  and the pending list is fetched once.

The service type is **remoteMessaging** (`FOREGROUND_SERVICE_REMOTE_MESSAGING`). `dataSync` was
the other candidate and is what `PondNetworkService` uses, but from Android 15 a `dataSync`
service is limited to six hours in any 24, which does not fit a connection meant to stay open.

### What the ongoing notification says

It follows the stream rather than the service, so it never claims a connection that does not
exist. `presenceNotice` in `services/background-connection.ts` maps the state to the text, and
the state moves as the stream does:

- **Connecting to your Pond**: a stream is being opened, or the connection manager is still
  looking for the Pond (`reconnecting`). This is what the service starts with.
- **Connected to your Pond**: the Pond accepted the stream, a 200 with its headers in
  (`NotificationStream`'s `onConnect`). Only this state says notices arrive straight away.
- **Can't reach your Pond**: the stream dropped and is backing off, or there is no stream and
  the connection manager found no endpoint (`disconnected`, reported through
  `noteNoEndpoint`). The text says the Pond keeps its notices, which it does: they are flushed on
  the next connection, or fetched by the push wake-up.

A stream that replaces one that was up (a rotated token, the app coming back to the front) keeps
the notice at connected until it connects or drops, rather than flickering through connecting.
A change of state re-posts the notification with `notify` on the service's own id
(`PondPresenceModule.update`), not with another foreground-service start, because Android 12 and
later refuse that from the background, where most changes happen. The channel is low importance
and the notification alerts only once, so an update never sounds; an unchanged state re-posts
nothing. Before 2026-10-27 the notice read "Connected to your Pond" from the moment the service
started, whether or not any Pond was in reach.

The notification can be swiped away on Android 13 and later; the service keeps running when it is.
With remote access also on, the phone shows two ongoing notifications, one per service.

### Google Play

A foreground service type has to be declared in the Play Console with a description and a video
of the user-visible feature. `remoteMessaging` is described by Android as transferring text
messages between devices for continuity; the use here, receiving the Pond's notices for the user
on this phone, is a reasonable reading but not the textbook one, and review may ask. Two fallbacks
if it is refused: `connectedDevice` (interactions with an external device over the network, which
the Pond is; the manifest already holds `CHANGE_WIFI_MULTICAST_STATE`, which satisfies its
prerequisite), or dropping the service and relying on the push wake-up alone. The setting is on by
default; Play does not forbid that, but the ongoing notification and the setting's description
have to make the cost plain, which they do.

## When the Pond itself is offline (2026-11-22)

Every path above starts at the Pond, so none of them can say that the Pond is down. Before
2026-11-22 a power cut or a dead home line reached the household only as a line in the connection
strip, on a screen somebody had open; a 10-hour overnight power cut on 2026-11-21 told nobody.

`services/pond-offline-watch.ts` closes that gap. The OS runs a background check no more often than
every 15 minutes (`expo-background-task`: WorkManager on Android, BGTaskScheduler on iOS; a phone
saving battery runs it less often). It asks the remote-access coordinator with the status grant the
Pond signed for this phone (`services/pond-status.ts`) and, the first time it hears of an outage,
puts one `alert` in the shade: "Your Pond is offline", with the strip's own sentence as the body
(power cut or home internet, turned off, or the Pond stopped). Each outage is told once, keyed by
the kind and the coordinator's own start time (`@goose/pond-offline-told`).

It says nothing while the app is open (the strip says it), for a restart (over before the next
check), or after the Pond is back: the Pond then sends `pond_lost_power` or `pond_lost_internet`
itself, with how long it was out. The check is registered once this phone holds a grant, from the
same place the grant is renewed (`view-models/use-pond-offline-reason.ts`). Logs:
`kind=pond_offline_watch` with the outcome of each check.

## iOS

iOS has no foreground services. The Settings row explains that instead of offering a switch, the
stream runs only while the app is open, and background delivery is the push wake-up alone.

## Testing

- `services/__tests__/notification-wake.test.ts`: the wake handler against a fake client --
  presents and acknowledges, ignores non-wake payloads, survives failures and a stalled Pond, and
  a notice delivered by the stream is not shown again by the wake-up.
- `services/__tests__/background-connection.test.ts`: the service and stream decisions.
- `services/__tests__/presence-notice.test.ts`: the state-to-text mapping, and that the notice
  moves with the stream and re-posts only on a change.
- `services/__tests__/https-notification-stream.test.ts`: `onConnect` fires once, on a 200, and
  never for a refusal.
- `services/__tests__/api-routes.test.ts`: both pending shapes and the ack route.
- `plugins/__tests__/with-pond-presence.test.ts`: the manifest declaration.
- On a device: background the app, send a notice, and check it arrives with the ongoing
  notification present; turn the setting off, force Doze (`adb shell dumpsys deviceidle
  force-idle`), send another, and check it arrives through the wake-up.
