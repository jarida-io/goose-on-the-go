# Data safety — the inputs behind the store declarations

This is the working record behind the Play Data safety form and the Apple privacy
nutrition labels. It exists so that the next release answers those forms from evidence
rather than from memory, and so that a reviewer can check an answer against the line of
code that justifies it.

Every claim below cites the file it came from. When the code moves, this file is wrong
until somebody moves it too. Treat a citation that no longer resolves as a defect.

**Scope.** This describes the client in this repository. It does not describe what the
Pond retains, and it cannot describe what the coordinator retains — that is operational
configuration outside this repo, and the open questions are collected at the end.

---

## What the app stores on the device

### Secret material — Keychain (iOS) / EncryptedSharedPreferences (Android)

Via `expo-secure-store`, in `services/secure-storage.ts:33-39`:

| Key | What it is |
|---|---|
| `goose.pondIdentity` | The paired Pond's pinned identity, used to refuse an impostor |
| `goose.sessionToken` | Bearer token for the Pond's API |
| `goose.refreshToken` | Used once on a 401 to re-obtain a session token |
| `goose.installId` | Stable per-install UUID, sent as `client_id` in every handshake |

On iOS, `goose.pondIdentity` is kept readable once the phone has been unlocked after starting
(`AFTER_FIRST_UNLOCK`, in its own Keychain service), where the others keep the Keychain's
default of readable only while unlocked. A Pond alert wakes the app while the phone is locked,
and the app needs the pairing then to fetch the alert from the Pond (2026-10-30, #164). It is the
setting messaging apps use for the same reason: the item stays in the Keychain, encrypted, and is
not readable before the first unlock after a restart. Pairings saved before this move over the
next time the app saves the sign-in.

`goose.adminKey` is kept apart from the table above, and only when the member keeps it: this
phone's own key to My Pond, the Pond's administration. On iOS it is written with
`requireAuthentication` and `WHEN_PASSCODE_SET_THIS_DEVICE_ONLY`, so it is read only after Face ID
or a fingerprint. On Android it is sealed by an AES-GCM key in the Android Keystore that opens, for
one use at a time, only after a strong (Class 3) biometric or the phone's PIN, pattern or password
(`plugins/pond-keyguard/PondKeyguard.kt`); only the sealed bytes are kept, in the app's own
preferences. Either way it never leaves in a backup or for another phone, and can no longer be read
once the screen lock is removed or a new face or finger is added. It goes nowhere but the paired Pond, and
unpairing forgets it.

`installId` deserves a note for the forms, because "persistent identifier" is a category
reviewers look at closely. It is generated on device (`services/install-id.ts`), never
derived from hardware, never sent anywhere but the paired Pond, and is resettable. Its
purpose is that re-pairing updates the same device row rather than accumulating duplicates.

### Non-secret preferences — AsyncStorage

`services/storage.ts:10-19`:

`@goose/server-url`, `@goose/connection-profile`, `@goose/last-screen`, `@goose/settings`,
`@goose/dev-screen-modes`, `@goose/remote-offer-dismissed`, and `@goose/admin-key-for`: the pin of
the Pond whose My Pond key the phone keeps, so the app knows one is kept without a biometric
prompt. The key itself is never written here.

The connection profile (`models/connection.ts:2-9`) holds the Pond's host, port, its
local URLs, an optional remote URL, an optional tunnel URL (the household's own ngrok, below),
and whether remote access is off or embedded along with the coordinator's control URL. These are addresses of a household server, not
credentials; no token has been written here since `services/secure-storage.ts` took over.

One migration detail that belongs in the record: builds predating secure storage wrote a
plaintext bearer token to `@goose/token`. Removing the key from the code would not remove
the value from a device that already had one, so `purgeLegacyStorage()`
(`services/storage.ts:27-43`) deletes it on upgrade.

### Embedded network node — app-private files

Once remote access is turned on, the embedded node keeps a directory per pairing under
`pond-network/` in the app's private storage: `noBackupFilesDir` on Android, and
Application Support on iOS, where `PondNetwork.stage`
(`plugins/pond-tls/ios/PondNetwork.swift`) marks the directory excluded from backup. It
holds the node's private machine key and node key and, where the coordinator grants it,
a cached network map: the household's peers, their tailnet addresses and the access
rules. The map holds no private keys. None of these files leave the device; the
coordinator learns only the public keys listed below.

When remote access goes off, including when this phone is unpaired or the Pond forgets the
pairing, `forgetNetworkMap` in `PondNetwork` (`plugins/pond-tls/PondNetwork.kt`,
`plugins/pond-tls/ios/PondNetwork.swift`) erases the map through the Pond library's
`Mobile.disable`. The node's keys stay while the pairing does.

The app keeps one pairing's node directory at a time. Activating a profile erases every
other directory under `pond-network/` through the Pond library's `Mobile.prune`, called
from `pruneSupersededIdentities` in `PondNetwork` (`plugins/pond-tls/PondNetwork.kt`,
`plugins/pond-tls/ios/PondNetwork.swift`), so keys from replaced or forgotten pairings do
not accumulate. A forgotten pairing activates with no profile and keeps none. The library
refuses a directory whose node is still running, and a failure is logged.

---

## What leaves the device, and to whom

### 1. The Pond — the household server

Everything the app does functionally goes here, over pinned HTTPS, authenticated. Pairing
is a CPace password-authenticated key exchange on the local network
(`services/cpace.ts`, 2026-10-13); the six-digit code itself is never sent. This includes the push
token registration below and the remote-access enrollment below.

For the forms, this is the important framing and it is worth stating precisely: the Pond
is the user's own hardware. Data reaching it has not left the household.

What the app sends it, beyond the control traffic of the screens themselves:

| What | When | Where in the code |
|---|---|---|
| What the user types to Goose | Each message | `services/api-client.ts` (chat) |
| Recorded speech | Voice mode, only the stretches where the user is speaking | `view-models/use-voice.ts` (`api.transcribe`), `services/api-client.ts` (`transcribe`, `POST /api/v1/transcribe`) |
| Photos and files the user attaches | When the user picks or takes one for a message | `services/media.ts` |
| The device's location | Once, when the user asks for a ride fare | `view-models/use-ride.ts` (`locateHere`), `services/api-client.ts` (`POST /api/v1/rides/quote`) |
| The device's location, as the home's | At home only, on the Pond's own network: when the user takes the offer shown once per launch while the Pond's location is a guess and location is already allowed, or taps Find my location | `services/home-location.ts`, `services/api-client.ts` (`PUT /api/v1/location/device`) |
| The name of the place the device is in | With each message, only while the user has turned on Tell Goose where this phone is | `services/phone-place.ts`, `services/api-client.ts` (`streamChat`, `device_place`) |

Each is described under its own heading below.

### 2. The coordinator — only after the user opts in to remote access

Remote access is opt-in and declinable, and the app is usable without it.

When enabled, the embedded node contacts the coordinator named by the Pond's own
`/api/v1/remote-access/configuration` response (`services/remote-access.ts:77-84`). The
coordinator therefore observes:

- the node's **node key** and **machine key**, established by the embedded node;
- the **tailnet address** assigned to this device — the app validates it falls in
  `100.64.0.0/10`, and the transport recognises `fd7a:115c:a1e0:` for IPv6
  (`remote` in `PondNetwork`, `plugins/pond-tls/PondNetwork.kt` and
  `plugins/pond-tls/ios/PondNetwork.swift`). The same check refuses Tailscale's own
  service address (`100.100.100.100`, `fd7a:115c:a1e0::53`) as a target: it is the
  node's resolver and local API, never a Pond;
- **connection and disconnection times**, inherent to maintaining a control connection.

What it does not observe is the content: traffic between this device and the Pond is
encrypted end to end, and the coordinator's role is to introduce the two, not to carry
their conversation. Where a direct path cannot be established, a relay carries ciphertext
and sees the metadata inherent to relaying it.

Note the direction of the enrollment write, because it is easy to describe backwards: the
app sends `{authUrl, nodeKey, machineKey}` to **the Pond**, not to the coordinator
(`services/remote-access.ts:104`), and the Pond approves the node. Approval is a local
act, which is the point of the design.

A phone whose remote access lapsed, because the Pond did not see it on the home network
for 30 days, has its enrollment revoked, and the coordinator will not enrol that machine
key again. When the Pond reports this (`stale_identity`), the app erases the embedded
node's private node and machine keys from the device and enrols a node with new ones
(2026-10-12, see `docs/PINNED_HTTPS.md`). The coordinator then holds the new public keys;
the old ones stay with it only as the revoked record. A lapsed pairing's keys are never
reused.

### 3. Google FCM and Apple APNs

`services/push-token.ts:1-19` is explicit about the shape, and it is the strongest privacy
claim in the product, so the declaration should make it rather than bury it.

The phone obtains its native device token and registers it **with the Pond**
(`POST /api/v1/devices/{installId}/push-token`). The Pond's own relay then talks to FCM v1
and APNs directly. The wake pings are **content-free**: the phone wakes and pulls the real
content from the Pond over its own authenticated channel.

So Google and Apple see a device token and the fact that a ping occurred. They do not see
notification text, because there is none to see.

On the phone (2026-10-30, #164), the ping runs a background task
(`services/background-notifications.ts`). The task reads the alert's id from the ping and
fetches this phone's waiting alerts from the Pond (`GET /api/v1/notifications/pending`) over the
same pinned connection the app always uses. It shows each alert with the time the Pond recorded
it and confirms it (`POST /api/v1/notifications/{id}/ack`). When the Pond cannot be reached, the
phone shows "Alert from your Pond" with no detail, under the alert's id, so the real alert
replaces it once fetched. Nothing in that notice came from anywhere but the ping.

On iPhone the ping is a silent push, which needs the `remote-notification` background mode.
`expo-task-manager` also declares `fetch`, which the app does not use. iOS decides whether to
deliver a silent push: it limits how often, and delivers none to an app the user has
force-quit. Away from home, a cold background start first brings up the remote-access route the
way the app does at launch (`services/pond-session.ts`), inside a 20-second budget. When no route
answers, the wake ping's own pull (`services/background-pond.ts`) tries the home addresses. There
the embedded remote-access node is not running in a cold background start (#50), so the phone
shows the "Alert from your Pond" notice instead.

### 4. Uber — through the Pond, for a ride the user asks for

The app never contacts Uber. When the user asks for a fare, the app sends the pickup point
to the Pond (`POST /api/v1/rides/quote`), and the Pond sends it to `api.uber.com` directly
(the Pond's `pond-adapters-uber`) to price the ride and, if the user confirms, book it.
Jarida's sign-in relay is involved only when a member connects an Uber account on the Pond,
where it adds the app's client secret to the token exchange; it does not carry trips or
locations. That is the Pond's behaviour, not this app's, and the Pond's own statement has
to cover it.

A Pond notification about a ride can carry a link, and the app opens it only if its host is
Uber's or a maps provider's (`ALLOWED_HOSTS` in `services/notification-link.ts`). Opening it
hands the user to that app or site; this app sends it nothing.

### 5. ngrok — only when the household runs its own tunnel

A household can reach its Pond from outside through its own ngrok account instead of the
embedded network. The Pond opens the tunnel; the app never contacts ngrok's service. Once the
Pond reports a tunnel address (an authenticated `GET /api/v1/system/info`, read only while the
phone is home), the app saves it as the profile's tunnel URL and, away from home, connects to
that address. The connection passes through ngrok's servers, which therefore see the phone's
IP address, when it connects and how much it sends. They do not see the content: ngrok does not
terminate TLS for this tunnel, and the app pins the same Pond key as at home. When the Pond
reports no tunnel, the saved address is dropped.

### 6. Nobody else

Verified against the dependency list rather than asserted: there is no analytics SDK, no
crash reporter, no advertising or attribution SDK, and no tracking library of any kind in
`package.json`. There is no contacts access and no advertising identifier. Location is read
only for a ride fare, at home to tell the household's own Pond where home is, if the user turns it on
to name the place the phone is in, and to watch the places the user saves for reminders, below.

The Android build does carry Google code that reports on itself (found 2026-11-09 in the release
runtime classpath, listed in `assets/legal/open-source.json`): `com.google.mlkit:barcode-scanning`
and `play-services-mlkit-barcode-scanning`, which `expo-camera` uses to read QR codes, and
`firebase-messaging` for push. Both bring Google's data transport
(`com.google.android.datatransport:transport-backend-cct`), which Google uses for those SDKs'
own usage and performance metrics. What they send from a release build, and whether it can be
turned off, is not yet verified; the privacy policy says so as an open item.

`expo-device` establishes whether the code is running on physical hardware before attempting push
registration, and since 2026-10-17 gives the default name this phone pairs under (its device name,
else its model). That name is shown with Change before pairing, and goes only to the user's own
Pond, as pairing's `device_name` always has.

---

## Camera, photos and files

The camera has two uses, and they answer the forms differently.

- **QR codes,** through `expo-camera`: the Pond's pairing code, and a Matter device's setup
  code. Decoding happens on device. No image is stored, and no image is transmitted.
- **A photo for a message,** through `expo-image-picker` (`launchCameraAsync` in
  `services/media.ts`), when the user chooses to take one. It is sent to the Pond.

Photos from the library and files come through the system pickers (`launchImageLibraryAsync`
and `expo-document-picker`'s `getDocumentAsync`, in `services/media.ts`), so the app sees
only what the user picks. Every picture is requested with `exif: false` and re-encoded to a
JPEG of at most 1024 px on its long edge before it is sent, so its location and other
metadata do not travel with it. A file is either a picture, handled the same way, or plain
text, which is read on the phone and sent inside the message; anything else is refused at
the picker.

## Microphone

`expo-audio`, with `enableBackgroundRecording: false` in `app.json`. In voice mode the app
listens for speech; each stretch the user speaks is written to a WAV file in the app's
cache, sent to the Pond to be transcribed (`POST /api/v1/transcribe`), and deleted in a
`finally` once the request ends, whether it succeeded or not (`discardFile` in
`view-models/use-voice.ts`). Nothing is recorded outside voice mode.

`app.json` lists the `expo-audio` plugin twice, with two different microphone purpose
strings. The first one's string is the one that ships: a prebuilt `Info.plist` (checked
2026-10-17) carries "Goose On The Go uses your microphone so you can talk to Goose." The
duplicate should be removed before submission, keeping whichever sentence is meant.

## Location

`expo-location`, with only a when-in-use purpose string in `app.json`, which says what it is
for. It is read for three things in the foreground, and one in the background:

- **A ride fare.** `locateHere` in `view-models/use-ride.ts` asks for foreground permission and
  takes one high-accuracy fix, when the user asks for a ride fare. The coordinates go to the
  Pond as the pickup point and from there to Uber (above). They are held in memory for the ride
  screen and never written to storage.
- **Where home is** (since 2026-11-09). A Pond has no GPS, so without help its location is its
  time zone's city. `services/home-location.ts` takes one balanced-accuracy fix and names the
  place with the phone's system geocoder (Google's on Android, Apple's on iOS, the provider that
  already serves the phone its location), then sends both to the household's own Pond
  (`PUT /api/v1/location/device`). It does so only while the app reaches the Pond on its local
  network (`connectionState === 'local'`), and the Pond refuses a fix from anywhere else
  (`not_on_home_network`), so a phone away from home never moves the household. Unasked, the app
  sends it at most once per launch, while the Pond's location is still a guess and only with a
  location grant the user already gave, then says where the Pond now is; it never asks for the
  grant to do this, and without one nothing is read or sent (`app/_layout.tsx`,
  `HomeLocationSync`). Until 2026-11-18 it asked in a snackbar first, on every launch, which the
  user asked to stop: the grant is the answer, as for every other permission. Find my location in Settings
  asks for permission and replaces whatever the Pond had. The Pond stores the place rounded to
  about 110 m. Nothing is kept on the phone.
- **Where the phone is**, by name. Tell Goose where this phone is (Settings, off until the user
  turns it on, which asks for foreground permission) sends the name of the place the phone is in
  ("Westlands, Nairobi") with each message, so the assistant can say where the user is.
  `services/phone-place.ts` takes a balanced-accuracy fix at most every five minutes while a
  message is being sent, names it with the phone's system geocoder, and drops the coordinates:
  only the name reaches the household's own Pond, which keeps it for that turn. The switch is
  remembered on the phone; the place is held in memory only.
- **Places saved for reminders**, in the background. A to-do or reminder can wait on a place the
  user saves, such as home; saving one sends its position to the Pond (`addPlace`,
  `POST /me/places`). With the background permission the user grants, `services/geofence.ts`
  registers those places with the OS's own geofencing (`startGeofencingAsync`) and, on arriving or
  leaving, tells the Pond only which place and which way (`POST /me/places/{id}/event`). The
  position itself never leaves the phone that way.

There is no other background location and no continuous tracking.

The built apps agree (checked 2026-10-17 in prebuilt native projects): iOS's `Info.plist`
carries `NSLocationWhenInUseUsageDescription` and no "always" key, and the Android manifest
has `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` without
`ACCESS_BACKGROUND_LOCATION`.

---

## Bluetooth

A local module (`plugins/pond-ble`) scans for a new Pond's setup service and connects to the one
the user picks, to claim it and give it Wi-Fi. Declared: iOS `NSBluetoothAlwaysUsageDescription`;
Android `BLUETOOTH_SCAN` with `usesPermissionFlags="neverForLocation"`, `BLUETOOTH_CONNECT`, and
`BLUETOOTH`/`BLUETOOTH_ADMIN` capped at API 30. Nothing is bonded.

The Wi-Fi networks listed are the Pond's own scan; the phone's Wi-Fi is never read. The
password travels to the Pond under ChaCha20-Poly1305 with a key from that connection's CPace
exchange, is never written to storage on the phone, and nothing asks the system's password store
to save it (iOS still shows its Passwords key above the keyboard on every masked field). For both stores this is Bluetooth use without data collection: nothing goes anywhere but
the user's own Pond.

---

## Draft answers

### Google Play — Data safety

| Question | Answer | Basis |
|---|---|---|
| Does your app collect or share any of the required user data types? | See below; no data is shared with third parties for advertising or analytics | no such SDK exists in the tree |
| Device or other IDs | Collected, not shared. Sent only to the user's own Pond | `install-id.ts`, `push-token.ts` |
| Location → Precise location | Collected, for app functionality, optional: one reading when the user asks for a ride fare. Passed by the Pond to Uber for that ride; see open input 8 on whether Play counts that as shared | `use-ride.ts` |
| Photos and videos → Photos | Collected, for app functionality, optional: only photos the user picks or takes for a message, sent to the user's own Pond | `media.ts` |
| Files and docs | Collected, for app functionality, optional: only files the user attaches, sent to the user's own Pond | `media.ts` |
| Audio → Voice or sound recordings | Collected, for app functionality, optional: speech in voice mode, sent to the user's own Pond and deleted from the phone once sent | `use-voice.ts` |
| Messages → Other in-app messages | Collected, for app functionality: what the user types to Goose, sent to the user's own Pond | `api-client.ts` |
| App activity, personal info, contacts | Not collected | no such permission or code path |
| Is data encrypted in transit? | Yes — pinned HTTPS locally, encrypted tunnel remotely | `services/api-client.ts`, `PondNetwork.kt` |
| Can users request data deletion? | Yes — unpairing releases this phone's access, and the Pond is the user's own hardware | `profile.signOutWarning` in `services/i18n/locales/en.json` |

### Apple — privacy nutrition labels

- **Identifiers → Device ID**: used for App Functionality only; not linked to an identity,
  not used for tracking.
- **Location → Precise Location**: App Functionality; one reading for a ride fare the user
  asks for.
- **User Content → Photos or Videos**, **Audio Data**, **Other User Content** (files, and what
  the user types to Goose): App Functionality; sent only to the user's own Pond.
- Not used for tracking, in every category above.
- **Data not collected** for every other category.
- **Tracking**: none. No ATT prompt is required, and none should be added.

---

## Open inputs — not answerable from this repository

These are the questions the forms will ask that the client's source cannot settle. They
need an answer from whoever operates the infrastructure before the listing goes live, and
recording a guess here would be worse than recording the gap.

1. **Coordinator retention.** How long are node keys, machine keys, tailnet addresses and
   connection logs kept, and what is the deletion path when a phone is unpaired? The client
   can say what it sends; only the operator can say what is kept. The phone erases its
   own superseded node keys (2026-10-05, see above); whether the coordinator deletes the
   corresponding nodes is still open.
2. **Relay operation.** Which relays can carry this traffic, who runs them, and what do
   their logs retain?
3. **Jurisdiction and controller.** Which legal entity is the data controller for the
   coordinator, and in which countries does it operate? Both forms ask.
4. **The hosted policy URL.** Both stores require a stable, publicly reachable URL. It does
   not exist yet, which is also why the app does not yet link to one.
5. **Support and deletion contact.** The address a user writes to, which must be real.
6. **What counts as "collected".** The drafts above treat anything this app sends off the
   phone as collected, even when it goes only to the user's own Pond, because both stores
   define collection by transmission off the device and neither has a category for the
   user's own server. That is the conservative reading. If the submitter takes the other
   reading, it has to apply to every category at once, the device ID included, not be
   chosen category by category.
7. **Storage permissions on Android.** A debug build's merged manifest (2026-10-13) lists
   `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE`, brought in by the media plugins; the
   app itself uses the system pickers, which need neither. Check the release manifest, and
   remove them if they are there, before answering Play's questions about photo and file
   access.
8. **The ride pickup and Uber.** Play does not count a transfer as sharing when it follows a
   specific action the user takes and expects to share data with, and asking for a ride
   fare is one. Whether to rely on that exemption, or declare location as shared with Uber
   anyway, is a judgement for whoever submits. Apple's label asks whether data is linked to
   the user's identity: the pickup reaches Uber on the member's own Uber account.

---

## Why the wording matters here more than usual

Goose In A Pond is sold as privacy-first and local by default, and that claim is doing real
work in the product. A declaration that is vague about what the coordinator sees does not
protect that claim; it undermines it, because the honest answer is genuinely good. The
coordinator learns that a device exists and how to reach it. It does not learn what was
said, and the notification path was built specifically so that Google and Apple could not
learn it either.

That is a strong position. It is worth stating precisely rather than defensively.
