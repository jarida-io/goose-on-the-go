# What the app reads from the Pond

Screens used to show invented data: a real person's name and email, "6 devices", "72°F", Lo-fi Beats playing. This file records what each screen reads now, from which endpoint, and what it shows when a read fails. The rule throughout: **show only what the Pond said.** A read that fails is *unknown*, never zero or empty, because zero is a claim about somebody's home and a request that did not come back has claimed nothing.

Everything here is read through `services/api-client.ts`; no screen fetches on its own.

## Who this phone belongs to

`GET /api/v1/devices/self` (goose-in-a-pond#390) returns this device and the household member it is attributed to. The phone never names itself: the Pond reads the device off the token it issued at pairing, and the attribution comes from the pairing code. The response is for **display only**. It proves nothing to the Pond and grants nothing.

| Answer | Shown |
|---|---|
| `profile: { id, display_name }` | the member's name |
| `profile: null` | no name. Nobody has claimed this device, which is the normal case, because pairing happens before anyone says who they are. |
| `404` / `405` | no name, not logged. An older Pond without the route answers 405, because the GET falls through to `/devices/{id}`. |
| `503` or a network failure | logged, and reported as *unknown* (`undefined`) rather than as nobody (`null`), so a live screen keeps the name it already had instead of dropping it until the next poll. Before any name has loaded, none is shown. A Pond that tried and failed is not the same as one with nothing to say. |

`readMember()` in `view-models/use-household.ts`. The profile header and the Home greeting share it; Home uses `useMember()`, which reads the member alone rather than the whole household.

## The profile header

| Shown | Source |
|---|---|
| Name and avatar initial | the member, above. The initial is taken by code point, so a name starting outside the Basic Multilingual Plane is not cut in half. With no member, a home icon. |
| Which Pond | `GET /api/v1/system/info` → `hostname`. This works for existing pairings, with no re-pair needed. |
| Devices | `GET /api/v1/devices`, the same count the Devices tab shows |
| Rooms | the Devices tab's own `groupByRoom`, not counting Unassigned, which is a fallback rather than a room anyone named |
| Routines | `GET /api/v1/schedules` |
| Users | `GET /api/v1/profiles` |

There is no email line and no plan badge. A profile is an id, a name and an avatar, with no account behind it, and there is no entitlement for a badge to reflect.

Each figure is its own read, settled independently, so a Pond that cannot list its schedules still shows its device count. **A failed read shows a dash.** `readHousehold()`, `settledCount()` and `countRooms()` in `view-models/use-household.ts`.

## Home

| Shown | Source | When it is not shown |
|---|---|---|
| Greeting | the phone's clock: morning from 5 until 12, afternoon until 17, evening after that (`greetingFor`) | |
| Name and avatar | `readMember()`, above | no name when nobody has claimed the device |
| "N online" chip | the device list the grid below shows, so the two cannot disagree | while that list is loading or failed |
| "N°C outside" chip | `GET /api/v1/weather` → `temp`. **Celsius**: the Pond asks open-meteo for `temperature_unit=celsius`. "Outside", because it is outdoor weather where the Pond is set up, not a thermostat. | when no location is configured (`enabled: false`), or the read failed |
| Now Playing | `GET /api/v1/music/now-playing` (`nowPlayingOf`). Track and artist while Spotify reports playback. "Nothing playing" only when the Pond says `connected: true, playing: false`. | with no Spotify account, when Spotify refused (`error` set), or when a claim of playback carries no track |
| Next routine | `GET /api/v1/schedules/upcoming?limit=5`: the first schedule that is not paused and has a valid `next_run` (`nextRoutineOf`). A time already passed reads "Due now" (`untilOf`). | when no routine will run |

With neither card, the Right Now heading is not drawn over an empty row.

The **Meeting** and **Locked** chips were removed rather than wired: nothing in the Pond answers either question. **Next Event became Next routine.** There is no calendar integration, so the card shows the Pond's own schedules and is labelled as a routine, never as an event.

`/schedules/upcoming` sends the Pond's `Schedule` as stored: `label`, `paused`, `next_run`, and no `name`. The card reads it through `UpcomingSchedule` in `services/types.ts`, which describes what is actually on the wire, rather than through the mismatched shared `Schedule` noted under Known gaps.

Each card has its own reader in `view-models/use-right-now.ts`: `readOutdoorTemp()`, `readNowPlaying()` and `readNextRoutine()`. None of them ever rejects, and each runs on its own cadence (below). `readRightNow()` composes the three for one-shot use.

## Keeping it current

A screen reads the Pond **while it is in front**, not once when it mounts. Every live read goes through one loop, `view-models/use-live.ts`, so the rules that keep polling safe live in one place:

- it reads **only while its screen is focused** and the app is not in the background, so a screen nobody is looking at costs nothing;
- it reads **at once on arrival**, so coming back to a screen, or returning the app to the foreground, is current straight away;
- it **never overlaps**: the next read is scheduled when the last one settles, so a slow Pond slows the poll rather than stacking requests behind it;
- it **never waits less than `MIN_POLL_MS`** (5s), whatever it is asked for. The guard checks for a finite number, because a `NaN` delay would slip past a plain `Math.max`.

The Pond rate-limits per IP (600 requests a minute for API traffic), and a runaway loop once spent the whole budget and locked this phone out of `/handshake`, the recovery path.

| Source | Cadence | Constant | Why |
|---|---|---|---|
| Now Playing | 10s, or 5 min after a refusal or with no account | `NOW_PLAYING_MS`, `NOW_PLAYING_BACKOFF_MS` | The desktop's own cadence, and every call reaches Spotify. It does **not** back off when the Pond cannot be reached: a blip should not leave the card stale for five minutes. |
| Devices | 15s | `DEVICES_MS` | Each read also fetches every switchable device's power state. |
| Recent conversations | 30s | `RECENT_SESSIONS_MS` | |
| Next routine | 60s | `ROUTINE_MS` | |
| Schedules | 60s with the event stream up, 30s without it, 5s while one is running | `SCHEDULES_STREAMING_MS`, `SCHEDULES_IDLE_MS`, `SCHEDULES_ACTIVE_MS` | `GET /schedules/events` says when a run starts and ends; the poll picks up the next run the scheduler works out afterwards. A finished run is also followed by one read, at most one per `MIN_POLL_MS`, never while another read is out or the app is not in front, and only for a timed schedule, since rule fires share the stream. The Pond takes no stream permit for it, so a stream that ends is opened again, after 5s doubling to 60s (`SCHEDULES_STREAM_RETRY_MS`, `SCHEDULES_STREAM_RETRY_MAX_MS`). |
| Rules | 30s | `RULES_MS` | The Pond has no event stream for rules. |
| Household counts | 60s | `HOUSEHOLD_MS` | |
| Profiles, models | 60s | `PROFILES_MS`, `MODELS_MS` | |
| Weather | 10 min | `WEATHER_MS` | The Pond caches it for 15 min, so asking more often only re-reads that cache. |
| Member | 5 min | `MEMBER_MS` | An attribution changes only when a pairing code says so. |
| Home clock | 60s | `CLOCK_MS` | Moves the greeting and the countdowns with the time. |

With Home in front that comes to about 15 requests a minute.

**A poll is quiet.** It never shows a spinner, and on failure it keeps what is on screen rather than replacing it with an error or a dash. A first load, or a refresh somebody asked for, still reports its failure, and the connection banner reports whether the Pond is reachable at all. For the household, `mergeHousehold()` keeps each figure a failed read did not return and takes every one it did, including a real zero and a real "nobody has claimed this device".

**A poll never undoes what you just did.** A poll is slower than a tap. One that read a lamp as off just before you switched it on would land afterwards and switch it back off on screen. `mergePower()` keeps any device changed at or after the poll began. The mark is set on the tap and again when the tap's own read-back lands, since a poll in flight began before that too. A deleted device could come back the same way, so `listPollStillCurrent()` ignores a device list if the list changed after the poll began, and that stamp moves again once the server answers.

## How this is tested

The reads live in plain async functions that take the client as an argument, `readHousehold(client)`, rather than inside the hooks. That lets the whole behaviour be tested with a fake client and no renderer: partial failure, an older Pond's 405, and a Pond that tried and failed. It is what defeated a provider-level test earlier. The hooks set state only in the promise's callback, which is also what `react-hooks/set-state-in-effect` asks for.

The loop is tested with fake timers (`view-models/__tests__/live.test.ts`): no overlap, the floor, a failing read keeping its cadence, and **a stopped loop leaving nothing scheduled**. That last one is pinned directly because the top-of-tick guard would otherwise hide an orphaned timer. Each rule was checked by breaking it on purpose: counting a failed read as zero fails two tests, and treating the 405 as a failure fails two others. On Home, a greeting stuck on "morning", the bug as reported at 22:40, fails the afternoon and evening tests. The "no location configured" test first passed for the wrong reason, because its disabled weather carried no temperature to leak, so it now carries one on purpose.

## Known gaps

- **Names need a profile.** With no household profiles, or a pairing code not bound to one, there is no name to show, and that is correct.
- **A repeating schedule runs in UTC.** The Pond registers every repeat with `Job::new_async`, which fires in UTC whatever zone the schedule names; the zone moves only the `next_run` it reports. So `deviceTimeZone()` goes with a one-off only, whose firing instant the Pond does work out in that zone, and a repeat is sent without one, so its `next_run` is when it really fires. A repeat's cron is therefore UTC: 07:00 in Nairobi is hour 4. The fix is the Pond's, `Job::new_async_tz`. A schedule made on the desktop keeps whatever zone it was given there.
