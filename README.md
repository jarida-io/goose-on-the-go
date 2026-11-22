<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/goose-logo-dark.png">
    <img src="assets/brand/goose-logo.png" alt="Goose On The Go" width="120" />
  </picture>

  # Goose On The Go

  **Your Pond, in your pocket**

  The phone app for [Goose In A Pond](https://github.com/jarida-io/goose-in-a-pond), the household
  assistant that runs on hardware you own. iOS and Android, built with Expo and React Native, drawn
  with [Jarida Ink](https://github.com/jarida-io/ink).

  [![Friend of the AAIF](https://img.shields.io/badge/friend%20of%20the-AAIF-5D23C2)](https://aaif.io)
  [![Expo SDK 57](https://img.shields.io/badge/Expo%20SDK-57-000020.svg)](https://docs.expo.dev)
  [![React Native 0.86](https://img.shields.io/badge/React%20Native-0.86-61DAFB.svg)](https://reactnative.dev)
  [![Platform](https://img.shields.io/badge/platform-iOS%20%7C%20Android-lightgrey)](#getting-started)

  [Website](https://pond.jarida.io/#showcase) · [Goose In A Pond](https://github.com/jarida-io/goose-in-a-pond) · [Documentation](#documentation)

</div>

<p align="center">
  <img src="docs/images/home.webp" alt="Home greeting Amina, with Ask Goose, the next routine and the weather in Nairobi" width="200">
  <img src="docs/images/conversation.webp" alt="A conversation where Goose sets a Saturday reminder to water the tomatoes" width="200">
  <img src="docs/images/schedule.webp" alt="The Schedule tab with a one-off timer and the weekday Morning Briefing" width="200">
  <img src="docs/images/pair.webp" alt="Pairing: three fingerprint groups to match against the Pond's own screen" width="200">
  <br>
  <sub>Current builds, paired with a demo household's Pond running Gemma 4 E4B.</sub>
</p>

---

## What it does

Every answer the app shows comes from the household's own Pond: goose and a local model on a box at
home. The phone holds no model and needs no cloud account; it is a window onto the Pond, kept
private by the pairing.

| | |
|---|---|
| **Pairing** | CPace, a password-authenticated key exchange. The password is the Pond's six-digit pairing code, a code the Pond says aloud, or the 11 digits on its printed setup card, and it never crosses the network |
| **A pinned connection** | After pairing, every request goes over HTTPS to the certificate the phone pinned. No certificate authority, no account, nothing to sign up for |
| **Setting up a new Pond** | Over Bluetooth: the phone finds a Pond with no screen, pairs with it, and hands it the Wi-Fi details over an encrypted channel |
| **Away from home** | An embedded tailnet node reaches the Pond from anywhere, with no VPN profile to install. A household's own ngrok account is the other option |
| **Chat** | Every reply streams, and the tools the Pond's goose calls show as chips and cards in the conversation |
| **My Goose** | What Goose holds for you: news and digests, ideas and goals, to-dos, notes, saved items, web watches and question cards |
| **Schedule** | Routines on a clock and automations that fire on an event, each with a run-now button and an on/off switch |
| **Memories** | What the Pond remembers about each member, to edit or forget, and a button to have Goose tidy them up |
| **Home** | Matter devices and adding new ones, rooms, cameras, faces and camera automations, music and the weather |
| **Voice** | Teach Goose your voice in five sentences, so the Pond knows who is speaking. On Android, Goose can be the phone's assistant, woken with "Hey Goose" |
| **Notifications** | Server-sent events while the app is open, a push wake-up when it is not, and a catch-up on return |

### Navigation

Five tabs: **Home**, **Chat**, **My Goose**, **Schedule** and **You**. The bar floats over the
screens and contracts to one button as you scroll. Everything else opens on a stack from those
tabs; [docs/NAVIGATION.md](docs/NAVIGATION.md) has the map.

---

## How it talks to the Pond

```
phone                                              Pond
  │  New Pond, over Bluetooth: hello → CPace → sealed Wi-Fi join
  │  Pairing:  POST /api/v1/handshake/pake/init, /pake/verify   (CPace, protocol 3)
  │  Then:     HTTPS on :4443, the Pond's public key pinned     (the PondTls native module)
  │  Away:     the same HTTPS, through the embedded tailnet node (pondnet)
```

The details, and why each choice was made, are in [docs/PINNED_HTTPS.md](docs/PINNED_HTTPS.md).
What each screen reads from the Pond is in [docs/POND-DATA.md](docs/POND-DATA.md).

---

## Architecture

MVVM with React hooks:

```
Views (screens)      app/(tabs)/, app/(stack)/, app/(onboarding)/
ViewModels (hooks)   view-models/
Models (types)       models/
Services             services/   API client, CPace, Bluetooth, remote access, i18n
Native               plugins/ (config plugins), native/ (pondnet, pondear)
```

The UI kit is [Jarida Ink](https://github.com/jarida-io/ink) (`@jarida/ink`). Screens import it
through `components/ui/ink.tsx`, so every control gets the same haptics. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/VIEW-LAYER.md](docs/VIEW-LAYER.md) and
[docs/COMPONENT-GUIDE.md](docs/COMPONENT-GUIDE.md).

---

## Getting started

```bash
npm install
npm run build:network            # the embedded network node, from the Goose In A Pond checkout beside this one
npx expo prebuild --platform android --clean
npx expo run:android             # build and install a development build, once
npx expo start                   # then serve the JavaScript to it
```

`expo-dev-client` is a dependency, so `npx expo start` serves a development build, not Expo Go.
Rebuild only when native code, a config plugin or `app.json` changes. For iOS, use
`npx expo run:ios`.

A clone does not carry everything a build needs:

| Needed | Where it comes from |
|---|---|
| `google-services.json` | Firebase, for Android push. Gitignored; Android builds fail without it |
| `native/pondnet/pondnet.aar`, `Pondnet.xcframework` | `npm run build:network`, from the Goose In A Pond checkout next to this one. Prebuild fails without them |
| The phone's wake word | `npm run build:ear` |
| JDK 17 and the Android NDK | React Native's Gradle plugin builds against Java 17; the NDK downloads on the first build |

To work in Expo Go against a Pond over plain HTTP, or to reach Metro over Wi-Fi rather than USB,
see [docs/development.md](docs/development.md).

### Checks

```bash
npm test                  # jest
npm run lint              # eslint
npx tsc --noEmit          # types
npm run audit             # npm audit, failing on high
npm run check:prebuild    # the native projects prebuild cleanly
```

Releases are `npm run build`; version and build numbers are in [docs/RELEASING.md](docs/RELEASING.md).

---

## Documentation

| Document | For |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | The MVVM layers and how the app finds its Pond |
| [Navigation](docs/NAVIGATION.md) | Tabs, stacks and every route |
| [Pinned HTTPS](docs/PINNED_HTTPS.md) | TLS pinning, CPace, setup cards, roaming and pondnet |
| [Pond data](docs/POND-DATA.md) | What each screen reads from the Pond |
| [My Goose hub](docs/MY-GOOSE-HUB.md) | The contract between the Pond and the phone for My Goose |
| [Home screen](docs/HOME-SCREEN.md) | The Home board |
| [Memories](docs/MEMORIES.md) | The Memories routes and fields |
| [Notifications](docs/NOTIFICATIONS.md) | The three delivery paths |
| [Assistant](docs/ASSISTANT.md) | Android's assistant role, the voice overlay and "Hey Goose" |
| [ngrok tunnel](docs/NGROK_TUNNEL.md) | Reaching the Pond through the household's own ngrok account |
| [Remote access measurement](docs/remote-access-measurement.md) | The test plan for remote access in the background |
| [Component guide](docs/COMPONENT-GUIDE.md) | Ink primitives and patterns |
| [View layer](docs/VIEW-LAYER.md) | Theme, icons, strings, haptics, and how the app writes |
| [Design system](docs/DESIGN-SYSTEM.md) | The tokens in `constants/` |
| [Internationalisation](docs/I18N.md) | Copy rules and the lint that enforces them |
| [Development](docs/development.md) | Development build or Expo Go, and troubleshooting |
| [Testing](docs/TESTING.md) | Commands and what to test |
| [Releasing](docs/RELEASING.md) and [Android signing](docs/ANDROID-SIGNING.md) | Version numbers, the iOS signing team, and the upload key |
| [Privacy screen](docs/PRIVACY-SCREEN.md) and [data safety](docs/DATA-SAFETY.md) | The evidence behind each privacy claim, and the store forms |
| [Licences](docs/LICENSES.md) | The documents the app shows, and the open-source notices |
| [Phone context](docs/PHONE-CONTEXT.md) | Proposal: what the phone could share with its Pond |
| [Privacy policy](docs/PRIVACY.md) and [terms](docs/TERMS.md) | Drafts, not yet published |

---

## Tech stack

| Layer | Technology |
|---|---|
| App | Expo SDK 57, Expo Router, React Native 0.86 (New Architecture), React 19 with the React Compiler |
| Language | TypeScript, strict |
| UI | [Jarida Ink](https://github.com/jarida-io/ink), react-native-reanimated, react-native-svg, Quicksand |
| Pairing and trust | CPace (ristretto255, SHA-512), the PondTls native module for pinning |
| Networking | pondnet (Go, gomobile): an embedded tailnet node |
| Tests | jest with jest-expo |

---

## A friend of the AAIF

Goose On The Go is a friend of the [Agentic AI Foundation (AAIF)](https://aaif.io). It is the phone
side of Goose In A Pond, where [goose](https://github.com/aaif-goose/goose) runs every turn and
every tool is a [Model Context Protocol](https://modelcontextprotocol.io) server; the app shows those
tool calls as they happen. It is an independent project; the AAIF does not host it.

---

## Sponsor

<table>
  <tr>
    <td align="center" width="260">
      <a href="https://spiral.xyz">
        <img src="docs/images/sponsors/spiral-logo.svg" alt="spiral.xyz" width="64" /><br/>
        <strong>spiral.xyz</strong>
      </a>
      <br/>
      <sub>A Block initiative for the public good, funding open-source bitcoin and AI</sub>
    </td>
  </tr>
</table>

Goose On The Go is sponsored by [spiral.xyz](https://spiral.xyz). Interested in supporting the
project? Write to [info@jarida.io](mailto:info@jarida.io).

---

## Licence

There is no licence file yet, so the code is not yet under an open-source licence. The app ships
the open-source notices for the libraries it uses, generated by `scripts/open-source-notices.cjs`;
see [docs/LICENSES.md](docs/LICENSES.md).

---

<div align="center">
  <a href="https://jarida.io"><img src="assets/brand/jarida-logo-purple.png" alt="Jarida" width="140" /></a>
  <br/>
  <sub>Built by the <a href="https://jarida.io">Jarida Open Source Community</a> · Nairobi, Kenya</sub>
</div>
