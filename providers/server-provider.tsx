import { rememberCapabilities } from '@/services/pond-capabilities';
import { loadPairedProfile, commitPairedProfile, type PondIdentity as Identity, type SavedPond as Saved } from '@/services/paired-profile';
/** Owns the saved identity, staged local pairing, and shared endpoint recovery. */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { forgetAllCards } from '@/services/card-cache';
import { forgetPondImages } from '@/services/pond-images';
import { forgetLongTasks } from '@/services/long-task-cache';
import { forgetKeptAdminKey } from '@/services/kept-admin-key';
import { forgetPushRegistration } from '@/services/push-token';
import { forgetAllThreads } from '@/services/chat-threads';
import { Storage, purgeLegacyStorage, storageFamily } from '@/services/storage';
import { SecureStorage } from '@/services/secure-storage';
import { ApiError, api, PondApiClient, type HandshakeResponse, type PairingClaim, type PairingRecovery, type SpokenCode } from '@/services/api-client';
import type { HeldPairing } from '@/models/pairing-lock';
import type { PakeCredential } from '@/services/cpace';
import { ConnectionManager, type ConnectionSnapshot } from '@/services/connection-manager';
import { PondTrustError } from '@/services/pond-trust';
import { probePond as probe, trustPond as trust } from '@/services/pond-session';
import { findPondAt, findPondByHost } from '@/services/discovery';
import { parseConnectionProfile, tunnelChange, validPin, isInsecureDevOrigin, isLocalPairingUrl, type ConnectionOutage, type ConnectionProfile } from '@/models/connection';
import i18n from '@/services/i18n';
import { stayConnectedEnabled } from '@/services/background-connection';
import { cancelRemoteAccess, pauseRemoteAccess, remoteNodeRunning, restoreRemoteAccess, resumeRemoteAccess } from '@/services/remote-access';
import { getInstallId } from '@/services/install-id';
import { canBeat, HEARTBEAT_MS } from '@/services/heartbeat';

const NUMERIC_HOST = /^\d{1,3}(\.\d{1,3}){3}$/;

interface PairOptions { clientId: string; pairingCode: string; credential?: PakeCredential; deviceName?: string }
interface ServerContextValue {
  serverUrl: string; online: boolean; token: string | null; refreshToken: string | null;
  /** The pin of the Pond this phone is paired with, so a setup channel can tell it is the same Pond. */
  pairedPin: string | null;
  /** Keep a pair a device resume over the setup channel rotated; the old refresh token no longer works. */
  keepRotatedTokens: (session: string, refresh: string) => void;
  connectionState: ConnectionSnapshot['state'];
  /** What is known about a connection that is not working: failed checks, why, the next one, the last answer. */
  connectionOutage: ConnectionOutage | null;
  /**
   * Every address this phone has for its Pond: the one in use first, then the saved home addresses,
   * most recently found first. Empty with no pairing.
   */
  pondUrls: string[];
  checkHealth: () => Promise<boolean>;
  /**
   * Re-select an endpoint. `quiet` suppresses the "Reconnecting" announcement,
   * for callers whose failure is not evidence the transport is down.
   */
  recover: (quiet?: boolean) => Promise<string | null>;
  /** Re-select an endpoint now, skipping the automatic back-off: for a person who asked. */
  retryNow: () => Promise<string | null>;
  /**
   * Try an address the paired Pond was seen announcing, checked under its saved pin and kept only
   * if it answers. Resolves to the address now in use, or null when nothing answered.
   */
  tryAddress: (url: string) => Promise<string | null>;
  /** Announce that the Pond has stopped recognising this phone. Terminal. */
  revoke: () => void;
  profileId: string;
  /** Whether a pairing is stored, including while another pairing is being staged over it. */
  paired: boolean;
  remoteEnabled: boolean;
  keepLocalOnly: () => Promise<void>;
  setRemoteEndpoint: (url: string, control: string, current: () => void) => Promise<void>;
  stagePairing: (profile: ConnectionProfile, pin: string) => Promise<void>;
  cancelPairing: () => Promise<void>;
  pair: (opts: PairOptions) => Promise<HandshakeResponse>;
  /**
   * Come back for a pairing the staged Pond's lock is holding. One it has let in is kept exactly
   * as `pair` keeps an accepted one. Rejects with no staged Pond, off Wi-Fi, or with no answer.
   */
  claimPairing: (held: HeldPairing) => Promise<PairingClaim>;
  /** The same, let in by the Pond's recovery PIN rather than by its main member. */
  recoverPairing: (held: HeldPairing, pin: string) => Promise<PairingRecovery>;
  /**
   * Keep a pairing the setup channel made: its pin proven by CPace over BLE, its tokens opened from
   * the sealed answer, its address from `wifi_join`. Nothing is probed first, since the phone may not
   * be on the Pond's network yet, and losing the tokens would leave a claimed Pond nobody holds.
   */
  adoptPairing: (profile: ConnectionProfile, pin: string, resp: HandshakeResponse) => Promise<void>;
  /** Ask the staged Pond to read a pairing code aloud; it answers only a phone on its own network. */
  requestSpokenCode: () => Promise<SpokenCode>;
  /**
   * Ask the Pond to release this phone, then forget it here. Resolves once both are done, and also
   * when the Pond refuses the session outright (it has already let this phone go). Rejects, with
   * the pairing kept, on any other failure: an `ApiError` when the Pond answered but did not
   * release it, anything else when the Pond could not be reached.
   */
  unpair: () => Promise<void>;
  /**
   * Forget the Pond on this phone only, without telling it: for a Pond that cannot be reached and
   * may never be again. The Pond still lists this phone until someone removes it there. Callers
   * must have asked first; this is never a silent fallback for `unpair`.
   */
  forgetLocally: () => Promise<void>;
  /** Per-screen mock/real backend flags (dev only) — see MIGRATION_SCREENS. */
  screenModes: ScreenModes;
  /** The screen's toggle in dev, its default in a release build — see `resolveScreenReal`. */
  isScreenReal: (screen: MigrationScreen) => boolean;
  setScreenMode: (screen: MigrationScreen, useReal: boolean) => void;
  /**
   * Whether the stored base URL and tokens have been read back yet.
   *
   * Hydration is async, so a view-model that fetches on mount would otherwise
   * race trust restoration and issue an unauthenticated request,
   * fail, and — with nothing to re-trigger it — stay failed for the session.
   */
  hydrated: boolean;
}

/**
 * Screens whose data-fetching hook can still be switched between mock data and
 * the real PondApiClient (issue #21).
 *
 * `devices` was on this list and is not any more: #30 wired the Devices and
 * Home tabs to the Pond's real device list unconditionally, as #28 did for
 * models, profiles and recent conversations. A toggle for a screen with no
 * mock branch left would be a switch that does nothing. `voice` went the same
 * way when the unused listening overlay was deleted, and `integrations` when
 * the Extensions screen was wired to `/extensions` and `/marketplace` (#92).
 *
 * `webSearch` is on it for the opposite reason: it was written against a
 * contract, ahead of any Pond that serves `/api/v1/web-search`, so the mock is
 * what lets the screen be built and looked at before there is one to ask.
 *
 * Nothing enforces this list: each view-model has to call `isScreenReal`
 * itself, so a screen can read "Real" here while its hook still returns mock
 * data because it never asked.
 */
export const MIGRATION_SCREENS = [
  'chat',
  'memory',
  'schedule',
  'logs',
  'webSearch',
  'settings',
  'agents',
  'pond',
  'voice',
  'myGoose',
] as const;

export type MigrationScreen = (typeof MIGRATION_SCREENS)[number];

export type ScreenModes = Record<MigrationScreen, boolean>;

/**
 * Which screens start on the real Pond, and so the ones a release build sends
 * there: it has no toggle to flip.
 *
 * A screen belongs here once its wiring has been run against a Pond rather
 * than against a test. `chat` earned it: `POST /api/v1/chat` is implemented,
 * and the only reason it ever needed a toggle was that it was not.
 *
 * `webSearch` is here without having earned it that way: it has not yet been run
 * against a Pond that serves the routes. It starts real anyway, because its mock
 * answers "saved" to any key, and a release build showing a key as stored when
 * nothing reached the Pond is worse than a screen that says the Pond cannot do
 * this. Flip it to mock in the Developer screen to work without a Pond.
 *
 * `logs` earned it the way `chat` did: `/activity`, `/activity/summary`,
 * `/logs`, `/logs/export` and `/telemetry/*` are all served, to any paired
 * token, and the shapes in services/types.ts are checked against the Pond's.
 * Its mock showed a release build a made-up household's day as if it were
 * this one's.
 */
// `settings` starts real for the same reason: a release build must never show a change as saved when
// nothing reached the Pond. The mock exists to build and look at the menus without one.
// `schedule` starts real because its wiring has been checked against the Pond's own routes: the
// `/schedules` and `/rules` shapes in `services/types.ts` are the scheduler's types as serialised,
// and a paired phone's token reaches every one of them. On mock, a release build showed two sample
// schedules where the household's own should be, and an edit made there reached nothing. The same
// key covers the Automations tab, which reads `/rules`.
// `memory` earned it the way `chat` did: every call it makes (list, save, reword, re-tier, forget,
// and the consolidation stream and its stop) was checked against the Pond's routes and serde types,
// and a paired phone's token reaches all of them. On mock, a release build showed four sample
// memories as the household's, and "Tidy up now" could never run, since nothing could flip it.
// `agents` starts real as `webSearch` does, ahead of a Pond that serves all of it: on a Pond without
// the prefill routes the screens say so, where the mock would show a made-up household's agents.
// `pond` (My Pond) starts real for the same reason: a Pond without `/admin` says so, where the mock
// would offer to delete a made-up Pond's files.
// `voice` (room voice, the Voice agent and Voice Match) starts real as `agents` does: a Pond without
// the routes says so, where the mock would show a made-up household's voices.
// `myGoose` (the hub's `/me` routes) starts real as `agents` does: a Pond without `/me/hub` keeps the
// older My Goose, where the mock would show a made-up member's news, to-dos and cart.
const REAL_BY_DEFAULT: readonly MigrationScreen[] = ['chat', 'logs', 'webSearch', 'settings', 'schedule', 'memory', 'agents', 'pond', 'voice', 'myGoose'];

export const DEFAULT_SCREEN_MODES: ScreenModes = MIGRATION_SCREENS.reduce(
  (acc, screen) => ({ ...acc, [screen]: REAL_BY_DEFAULT.includes(screen) }),
  {} as ScreenModes,
);

/**
 * Whether a screen talks to the Pond or to its mock data.
 *
 * In dev it is the screen's toggle. A release build has no way to flip one —
 * the Developer screen redirects outside `__DEV__` — so there it is the
 * screen's default, and the toggles are not read at all. It is not a blanket
 * `false`: that answer left a release build's chat on the mock reply while
 * `REAL_BY_DEFAULT` said real.
 *
 * Handed `isDev` rather than reading `__DEV__`, because every test runs with
 * `__DEV__` true and could not otherwise reach the release answer.
 */
export function resolveScreenReal(
  screen: MigrationScreen,
  { isDev, screenModes, defaults }: { isDev: boolean; screenModes: ScreenModes; defaults: ScreenModes },
): boolean {
  return isDev ? screenModes[screen] : defaults[screen];
}

const ServerContext = createContext<ServerContextValue | null>(null);
/**
 * Last working route per Pond, for the life of the process. Module scope on purpose: Android
 * recreates the activity on a return to the app, React remounts this provider and builds a new
 * ConnectionManager, and this is what lets it carry on with the route it had.
 */
const rememberedRoutes = new Map<string, ConnectionSnapshot>();

export function ServerProvider({ children }: PropsWithChildren) {
  const [screenModes, setScreenModes] = useState<ScreenModes>(DEFAULT_SCREEN_MODES);
  const [hydrated, setHydrated] = useState(false);
  const [snapshot, setSnapshot] = useState<ConnectionSnapshot>({ state: 'unpaired', url: null });
  const [identity, setIdentity] = useState<Identity | null>(null);
  const saved = useRef<Saved | null>(null);
  // Mirrors whether `saved` holds a pairing, for render. Set wherever that changes.
  const [hasPairing, setHasPairing] = useState(false);
  // Mirrors whether the saved profile reaches the Pond from outside, for render. Set by `restore`.
  const [remoteEnabled, setRemoteEnabled] = useState(false);
  const staged = useRef<{ profile: ConnectionProfile; pin: string; client: PondApiClient } | null>(null);
  const operation = useRef(0);
  const committing = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  const tokenWrite = useRef<Promise<void>>(Promise.resolve());
  const environment = useRef({ cellular: false, active: AppState.currentState === 'active' });
  const manager = useMemo(() => new ConnectionManager({
    probe, trust, routes: rememberedRoutes, remoteReady: remoteNodeRunning,
    discover: async (host, port) => (await findPondByHost(host, port))?.url ?? null,
    changed: (next) => {
      console.info('[connection]', next.state);
      setSnapshot(next);
      if (next.url) api.setBaseUrl(next.url);
    },
  }), []);

  const restore = useCallback(async () => {
    const current = saved.current;
    const remote = current?.profile.remoteAccess;
    try { await restoreRemoteAccess(current?.identity.id ?? '', remote?.mode === 'embedded' ? remote.controlUrl : ''); }
    catch { console.warn('[remote] saved transport unavailable; local access remains enabled'); }
    await manager.configure(current?.profile ?? null, current?.identity.pin ?? '');
    if (!mounted.current) return;
    setRemoteEnabled(remote?.mode === 'embedded');
    if (current) {
      api.setToken(current.identity.session);
      api.setRefreshToken(current.identity.refresh);
      setIdentity(current.identity);
      manager.environment(environment.current.cellular, environment.current.active);
    } else setIdentity(null);
  }, [manager]);

  /**
   * The node lives in this process and nothing holds the process up, so coming back to the
   * foreground is the first chance we get to notice it is gone. Probing alone cannot see
   * this: a dead node and an unreachable Pond look identical from the HTTP side.
   */
  const resumeTransport = useCallback(async () => {
    const current = saved.current;
    const remote = current?.profile.remoteAccess;
    if (!current || remote?.mode !== 'embedded') return;
    try {
      // Re-probe only when the transport actually changed underneath us.
      if (await resumeRemoteAccess(current.identity.id, remote.controlUrl)) await manager.recover();
    } catch {
      console.warn('[remote] transport could not be restarted on resume; local access remains enabled');
    }
  }, [manager]);

  /**
   * Drop this phone's pairing locally, without asking the Pond to release it.
   *
   * unpair tells the Pond first and deliberately keeps the pairing when that
   * call fails, so a failed sign-out can be retried. Revocation is the opposite
   * situation: the Pond has already stopped recognising this phone, so there is
   * nothing to tell it and nothing to retry. Holding dead credentials only means
   * every later request fails the same way, and the remote-access setup keeps
   * enrolling nodes against an identity the Pond will not accept.
   */
  const forgetPairing = useCallback(async () => {
    // Stopping the remote transport also ends the foreground service that carries it.
    await cancelRemoteAccess().catch(() => undefined);
    await restoreRemoteAccess('', '').catch(() => undefined);
    operation.current++; staged.current = null; saved.current = null; setHasPairing(false); setRemoteEnabled(false);
    api.invalidateIdentity(); setIdentity(null);
    await tokenWrite.current.catch(() => undefined);
    await SecureStorage.remove('pondIdentity');
    await SecureStorage.remove('sessionToken'); await SecureStorage.remove('refreshToken');
    // Its grant to ask the coordinator about this Pond: about this Pond, and wrong for the next one.
    await SecureStorage.remove('pondStatusGrant');
    await Storage.remove('connectionProfile'); await Storage.remove('serverUrl');
    // When this Pond would drop remote access: a date about it, and wrong for the next one.
    await Storage.remove('remoteLapsesAt');
    // The tool cards kept from its conversations are the household's too.
    await forgetAllCards().catch(() => undefined);
    // So are owner setup's unfinished answers and what it left on Home for later.
    await storageFamily('setupDrafts').clear().catch(() => undefined);
    await storageFamily('setupChecklist').clear().catch(() => undefined);
    // So are the pictures its cameras showed, held in memory while their list scrolled.
    forgetPondImages();
    forgetLongTasks();
    // A key to My Pond opens only the Pond this phone has just left.
    await forgetKeptAdminKey().catch(() => undefined);
    // The next Pond has never been given this phone's push token, even though it has not changed.
    forgetPushRegistration();
    // So are the conversations and drafts held in memory.
    forgetAllThreads();
    await manager.configure(null);
  }, [manager]);

  const cancelPairing = useCallback(async () => {
    await committing.current?.catch(() => undefined);
    operation.current++;
    if (!staged.current) return;
    staged.current = null;
    api.invalidateIdentity();
    await restore();
  }, [restore]);

  const invalidateOperation = useCallback(() => { operation.current++; }, []);
  // A refresh over HTTPS and a device resume over the setup channel both rotate the pair: the old refresh token is dead.
  const keepRotated = useCallback((session: string, refresh: string) => {
    const current = saved.current;
    if (!current || staged.current) return;
    const next = { ...current.identity, session, refresh };
    saved.current = { ...current, identity: next };
    setIdentity(next);
    tokenWrite.current = tokenWrite.current.then(() => SecureStorage.set('pondIdentity', JSON.stringify(next))).catch(() => {
      console.warn('[connection] rotated credentials could not be saved');
      setSnapshot({ state: 'disconnected', url: null });
    });
  }, []);
  const keepRotatedTokens = useCallback((session: string, refresh: string) => {
    api.setToken(session);
    api.setRefreshToken(refresh);
    keepRotated(session, refresh);
  }, [keepRotated]);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    NetInfo.configure({ useNativeReachability: true, reachabilityShouldRun: () => false, shouldFetchWiFiSSID: false });
    let networkKey = '';
    const networkSub = NetInfo.addEventListener((state) => {
      const address = state.details && 'ipAddress' in state.details ? state.details.ipAddress : '';
      const key = `${state.type}:${state.isConnected}:${address}`;
      if (key === networkKey) return;
      networkKey = key;
      // Android reports no network for a moment between Wi-Fi and cellular. Probing then can
      // only fail, and announced "disconnected" for a second on every switch; the network that
      // follows raises its own event. A network that stays gone is reported by the next request.
      if (state.isConnected === false) return;
      environment.current.cellular = state.type === 'cellular';
      if (!staged.current) manager.environment(environment.current.cellular, environment.current.active);
    });
    const appSub = AppState.addEventListener('change', (state) => {
      environment.current.active = state === 'active';
      if (staged.current) return;
      manager.environment(environment.current.cellular, environment.current.active);
      if (state === 'active') void resumeTransport();
      // The background stream reaches a Pond away from home through the node, so it stays up for it.
      else if (state === 'background' && !stayConnectedEnabled()) void pauseRemoteAccess();
    });
    api.setRecovery(manager.recover);
    api.setAuthRevoked(() => {
      manager.revoke();
      // Unregistering the phone on the Pond should end the session here too. The
      // tab layout redirects to pairing as soon as there is no profile, so
      // clearing is all this has to do -- the user lands on a fresh pair rather
      // than on a screen whose every request will fail.
      //
      // Not while a pairing is being staged: that flow owns the identity and has
      // its own cancellation.
      if (!staged.current) {
        void forgetPairing().catch(() => console.warn('[connection] revoked pairing could not be cleared'));
      }
    });
    void (async () => {
      try {
        // Best effort: a store that cannot delete the old plaintext keys must not keep a
        // valid pairing from loading.
        try { await purgeLegacyStorage(); } catch { console.warn('[storage] could not purge legacy plaintext keys'); }
        const loaded = await loadPairedProfile();
        if (cancelled || staged.current) return;
        if (loaded.saved) {
          saved.current = loaded.saved;
          setHasPairing(true);
          await restore();
        } else await manager.configure(null, '', loaded.upgrade);
      } catch {
        console.warn('[connection] saved profile could not be loaded');
        setSnapshot({ state: 'upgrade', url: null });
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    api.setOnTokensRotated(keepRotated);
    // A refresh says again what the Pond can do, so a phone paired before it said keeps up.
    api.setOnCapabilities((capabilities) => {
      const pin = saved.current?.identity.pin;
      if (pin) void rememberCapabilities(pin, capabilities);
    });
    return () => {
      cancelled = true; mounted.current = false; invalidateOperation();
      networkSub(); appSub.remove(); manager.environment(false, false);
      api.setRecovery(null); api.setOnTokensRotated(null); api.setOnCapabilities(null);
    };
  }, [manager, restore, invalidateOperation, resumeTransport, forgetPairing, keepRotated]);

  /**
   * Keep this phone's row in the Pond's device registry fresh while the app is open.
   *
   * The Pond derives `is_online` from `last_seen` against a five-minute threshold
   * and has a heartbeat route that nothing was calling, so a paired phone aged out
   * of its own device list and described itself as offline while in use.
   *
   * Two minutes, which is well inside that threshold and far outside anything the
   * per-IP rate limit cares about -- thirty requests an hour against a budget that
   * a runaway listener once spent in seconds. A missed beat is dropped rather than
   * retried: the next one is already scheduled, and a retry loop against a
   * rate-limited Pond is the failure this interval exists to stay clear of.
   *
   * Foreground only. When the app is not running the phone genuinely is not
   * reachable through it, and saying so is the honest answer rather than a
   * convenient one.
   *
   * Keyed on the resolved URL as well as the identity. The identity loads before
   * the connection manager has reached the Pond, and the first version beat at
   * that moment -- at the client's default address, while requiring an AppState
   * a cold start had not reported yet -- so the beat a launch exists to send went
   * nowhere, and the card stayed offline until the interval came round. The
   * conditions are in `canBeat`, where they are tested.
   */
  const reachedUrl = snapshot.url;
  useEffect(() => {
    if (!identity || !reachedUrl) return;
    let stopped = false;
    const beat = () => {
      if (stopped || !canBeat({ paired: true, pairing: !!staged.current, url: reachedUrl, appState: AppState.currentState })) return;
      void getInstallId()
        .then((id) => api.deviceHeartbeat(id))
        .catch((e: unknown) => {
          // Dropped, not retried: the next beat is already scheduled. But not silent -- a beat
          // that always fails looks exactly like one that never fires.
          console.warn('[heartbeat] not delivered', e instanceof ApiError ? e.status : 'network');
        });
    };
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') beat(); });
    return () => { stopped = true; clearInterval(timer); sub.remove(); };
  }, [identity, reachedUrl]);

  // Address updates remain non-secret and tied to the saved secure identity.
  useEffect(() => {
    const current = saved.current;
    const profile = manager.savedProfile;
    if (!current || !profile || staged.current || !snapshot.url) return;
    saved.current = { ...current, profile };
    void Storage.set('connectionProfile', JSON.stringify({ [current.identity.profileKey ?? current.identity.id]: profile })).catch(() => {
      console.warn('[connection] updated addresses could not be saved');
    });
  }, [snapshot, manager]);

  const stagePairing = useCallback(async (rawProfile: ConnectionProfile, pin: string) => {
    await committing.current?.catch(() => undefined);
    await cancelRemoteAccess();
    const profile = parseConnectionProfile({ ...rawProfile, remoteAccess: { mode: 'local' } });
    if (!profile || !validPin(pin) || !profile.localUrls.every(isLocalPairingUrl)) throw new Error(i18n.t('pairing.invalid'));
    const op = ++operation.current;
    const net = await NetInfo.fetch();
    if (op !== operation.current) throw new Error(i18n.t('pairing.failed'));
    if (!['wifi', 'ethernet'].includes(net.type)) throw new Error(i18n.t('pairing.lan'));
    api.invalidateIdentity(); setIdentity(null);
    manager.environment(false, false);
    staged.current = { profile, pin, client: new PondApiClient(profile.localUrls[0]) };
    try {
      await manager.configure(null);
      if (op !== operation.current) throw new Error(i18n.t('pairing.failed'));
      await trust(profile.localUrls, pin);
      if (op !== operation.current) throw new Error(i18n.t('pairing.failed'));
      const candidates = [...profile.localUrls];
      // A numeric host names no machine, so rediscovery after the Pond's lease changes
      // could never find it again. Ask the network which Pond answers at that address
      // and keep its advertised name instead.
      const numericHost = NUMERIC_HOST.test(profile.host);
      // A plaintext development Pond is not advertised (mDNS names only HTTPS), and the
      // Expo Go it exists for has no mDNS module, so there is nothing to look up.
      const found = profile.localUrls.every(isInsecureDevOrigin)
        ? null
        : numericHost
          ? await findPondAt(profile.host, profile.port, 3_000)
          : await findPondByHost(profile.host, profile.port);
      if (op !== operation.current) throw new Error(i18n.t('pairing.failed'));
      const host = numericHost && found?.hostname ? found.hostname : profile.host;
      if (found && isLocalPairingUrl(found.url) && !candidates.includes(found.url)) candidates.push(found.url);
      await trust(candidates, pin);
      let trustRejected = false;
      for (const url of candidates) {
        if (op !== operation.current) throw new Error(i18n.t('pairing.failed'));
        let verified = false;
        try { verified = await probe(url); } catch (error) { if (error instanceof PondTrustError) trustRejected = true; }
        if (verified) {
          if (op !== operation.current) throw new Error(i18n.t('pairing.failed'));
          staged.current = { profile: { ...profile, host, localUrls: candidates }, pin, client: new PondApiClient(url) };
          return;
        }
      }
      if (trustRejected) throw new PondTrustError();
      throw new Error(i18n.t('pairing.lan'));
    } catch (error) {
      if (op === operation.current) { staged.current = null; await restore(); }
      throw error;
    }
  }, [manager, restore]);

  /** Keep a pairing the staged Pond accepted: its tokens and addresses saved, then the app restored onto it. */
  const keepStaged = useCallback(async (pending: NonNullable<typeof staged.current>, resp: HandshakeResponse) => {
    if (!resp.session_token) return;
    const next: Identity = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, pin: pending.pin,
      session: resp.session_token, refresh: resp.refresh_token ?? null };
    // Write addresses first, retaining the previous entry until the atomic secure commit.
    const previous = saved.current;
    const commit = (async () => {
      await tokenWrite.current;
      saved.current = await commitPairedProfile(previous, { identity: next, profile: pending.profile });
      void rememberCapabilities(next.pin, resp.capabilities);
      setHasPairing(true);
      staged.current = null;
      await restore();
    })();
    committing.current = commit;
    try { await commit; } finally { if (committing.current === commit) committing.current = null; }
  }, [restore]);

  const pair = useCallback(async (opts: PairOptions) => {
    const pending = staged.current;
    const op = operation.current;
    if (!pending) throw new Error(i18n.t('pairing.lan'));
    const net = await NetInfo.fetch();
    if (!['wifi', 'ethernet'].includes(net.type)) throw new Error(i18n.t('pairing.lan'));
    if (op !== operation.current) throw new Error(i18n.t('pairing.failed'));
    // The staged pin is what this connection is pinned to, and it goes into the
    // CPace channel identifier: the Pond runs the exchange under its own pin, so
    // one that arrived over mDNS or a QR and is not the Pond's ends in a visible
    // failure rather than a pair with the wrong Pond.
    const resp = await pending.client.pair({ ...opts, channelBinding: pending.pin });
    if (op !== operation.current) throw new Error(i18n.t('pairing.failed'));
    if (resp.accepted && resp.session_token) await keepStaged(pending, resp);
    return resp;
  }, [keepStaged]);

  /** The staged Pond, for a phone coming back for a pairing its lock holds: on Wi-Fi, and still the same attempt. */
  const heldAt = useCallback(async () => {
    const pending = staged.current;
    if (!pending) throw new Error(i18n.t('pairing.lan'));
    const net = await NetInfo.fetch();
    if (!['wifi', 'ethernet'].includes(net.type)) throw new Error(i18n.t('pairing.lan'));
    return pending;
  }, []);

  const claimPairing = useCallback(async (held: HeldPairing) => {
    const op = operation.current;
    const pending = await heldAt();
    const claim = await pending.client.claimPairingRequest(held);
    if (op !== operation.current) throw new Error(i18n.t('pairing.failed'));
    if (claim.status === 'paired') await keepStaged(pending, claim.response);
    return claim;
  }, [heldAt, keepStaged]);

  const recoverPairing = useCallback(async (held: HeldPairing, pin: string) => {
    const op = operation.current;
    const pending = await heldAt();
    const answer = await pending.client.recoverPairingRequest(held, pin);
    if (op !== operation.current) throw new Error(i18n.t('pairing.failed'));
    if (answer.status === 'paired') await keepStaged(pending, answer.response);
    return answer;
  }, [heldAt, keepStaged]);

  const adoptPairing = useCallback(async (rawProfile: ConnectionProfile, pin: string, resp: HandshakeResponse) => {
    await committing.current?.catch(() => undefined);
    await cancelRemoteAccess();
    const profile = parseConnectionProfile({ ...rawProfile, remoteAccess: { mode: 'local' } });
    if (!profile || !validPin(pin) || !profile.localUrls.every(isLocalPairingUrl) || !resp.accepted || !resp.session_token) {
      throw new Error(i18n.t('pairing.invalid'));
    }
    operation.current++;
    staged.current = null;
    api.invalidateIdentity();
    const next: Identity = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, pin,
      session: resp.session_token, refresh: resp.refresh_token ?? null };
    const previous = saved.current;
    const commit = (async () => {
      await tokenWrite.current;
      saved.current = await commitPairedProfile(previous, { identity: next, profile });
      void rememberCapabilities(next.pin, resp.capabilities);
      setHasPairing(true);
      await restore();
    })();
    committing.current = commit;
    try { await commit; } finally { if (committing.current === commit) committing.current = null; }
  }, [restore]);

  const requestSpokenCode = useCallback(async () => {
    const pending = staged.current;
    if (!pending) throw new Error(i18n.t('pairing.lan'));
    const net = await NetInfo.fetch();
    if (!['wifi', 'ethernet'].includes(net.type)) throw new Error(i18n.t('pairing.lan'));
    return pending.client.requestSpokenCode();
  }, []);

  /**
   * Persisted dev toggles, read once on mount.
   *
   * `setScreenMode` awaits this same promise before writing, so a toggle
   * flipped before the read lands cannot persist a snapshot that is missing
   * every other screen's saved value.
   */
  const loadScreenModes = useRef<Promise<ScreenModes | null> | undefined>(undefined);
  useEffect(() => {
    if (!__DEV__) return;
    loadScreenModes.current = Storage.getJSON<ScreenModes>('devScreenModes');
    void loadScreenModes.current.then((saved) => {
      if (saved) setScreenModes((prev) => ({ ...prev, ...saved }));
    });
  }, []);

  /** Latest modes, readable synchronously so back-to-back toggles compose. */
  const screenModesRef = useRef(screenModes);
  useEffect(() => {
    screenModesRef.current = screenModes;
  }, [screenModes]);

  const isScreenReal = useCallback(
    (screen: MigrationScreen) =>
      resolveScreenReal(screen, { isDev: __DEV__, screenModes, defaults: DEFAULT_SCREEN_MODES }),
    [screenModes],
  );

  const setScreenMode = useCallback((screen: MigrationScreen, useReal: boolean) => {
    setScreenModes((prev) => ({ ...prev, [screen]: useReal }));
    void (async () => {
      await loadScreenModes.current;
      await Storage.setJSON('devScreenModes', {
        ...screenModesRef.current,
        [screen]: useReal,
      });
    })();
  }, []);

  const unpair = useCallback(async () => {
    await committing.current?.catch(() => undefined);
    await cancelRemoteAccess();
    // Preserve the authenticated transport until the Pond has durably accepted revocation.
    // Failure keeps the pairing available for an explicit retry -- except when the Pond
    // refuses the session outright, which means it is already gone there and a retry can
    // only fail the same way.
    try {
      await api.handshakeRevoke();
      console.info('[unpair] kind=released');
    } catch (e) {
      if (!(e instanceof ApiError && (e.status === 401 || e.status === 403))) throw e;
      console.info('[unpair] kind=already_released status=', e.status);
    }
    await forgetPairing();
  }, [forgetPairing]);
  const forgetLocally = useCallback(async () => {
    await committing.current?.catch(() => undefined);
    await forgetPairing();
    console.info('[unpair] kind=forgotten_locally');
  }, [forgetPairing]);
  const updateRemoteProfile = useCallback(async (url: string | null, control: string, check: () => void) => {
    await committing.current?.catch(() => undefined);
    const current = saved.current;
    if (!current || staged.current) throw new Error(i18n.t('connection.unpaired'));
    const profile = parseConnectionProfile({ ...current.profile,
      ...(url ? { remoteUrl: url } : {}),
      remoteAccess: url ? { mode: 'embedded', controlUrl: control } : { mode: 'local' },
    });
    if (!profile) throw new Error(i18n.t('remote.failed'));
    const op = operation.current;
    const commit = (async () => {
      check();
      api.invalidateIdentity(); setIdentity(null); manager.environment(false, false);
      try {
        await tokenWrite.current;
        await manager.configure(profile, current.identity.pin);
        // Native trust and the allowlisted proxy must prove the same Pond before saving opt-in.
        if (url && !await probe(url)) throw new Error(i18n.t('remote.failed'));
        check();
        if (op !== operation.current || staged.current) throw new Error(i18n.t('remote.cancelled'));
        saved.current = await commitPairedProfile(current, { identity: current.identity, profile });
      } finally { await restore(); }
    })();
    committing.current = commit;
    try { await commit; } finally { if (committing.current === commit) committing.current = null; }
  }, [manager, restore]);
  /**
   * Save or drop the Pond's tunnel address, learned while home. Serialised with the other
   * profile writes; the manager is re-pointed only after the new profile is durable.
   */
  const learnTunnel = useCallback(async (tunnelUrl: string | undefined) => {
    await committing.current?.catch(() => undefined);
    const current = saved.current;
    if (!current || staged.current) return;
    const base: ConnectionProfile = { ...current.profile };
    delete base.tunnelUrl;
    const profile = parseConnectionProfile({ ...base, ...(tunnelUrl ? { tunnelUrl } : {}) });
    if (!profile) return;
    const commit = (async () => {
      saved.current = await commitPairedProfile(current, { identity: current.identity, profile });
      await manager.configure(profile, current.identity.pin);
      manager.environment(environment.current.cellular, environment.current.active);
    })();
    committing.current = commit;
    try {
      await commit;
      console.info('[connection] tunnel address', { kind: tunnelUrl ? 'tunnel_learned' : 'tunnel_dropped' });
    } catch (error) {
      console.warn('[connection] could not save the tunnel address; asking again on the next home connection', error);
    } finally { if (committing.current === commit) committing.current = null; }
  }, [manager]);
  // The tunnel's address is only given with a valid token, and it changes each time the Pond
  // restarts its tunnel, so the phone asks every time it reaches the Pond at home.
  useEffect(() => {
    if (snapshot.state !== 'local' || !identity) return;
    let live = true;
    void api.systemInfo().then((info) => {
      const current = saved.current;
      if (!live || !current || staged.current) return;
      const change = tunnelChange(current.profile.tunnelUrl, info.tunnel_address);
      if (change) void learnTunnel(change.tunnelUrl);
    }).catch(() => { /* Asked again on the next home connection. */ });
    return () => { live = false; };
  }, [snapshot.state, snapshot.url, identity, learnTunnel]);
  const setRemoteEndpoint = useCallback((url: string, control: string, check: () => void) =>
    updateRemoteProfile(url, control, check), [updateRemoteProfile]);
  const keepLocalOnly = useCallback(async () => {
    await cancelRemoteAccess();
    await updateRemoteProfile(null, '', () => undefined);
  }, [updateRemoteProfile]);
  const checkHealth = useCallback(async () => !!await manager.recover(), [manager]);
  const value = useMemo<ServerContextValue>(() => ({
    serverUrl: snapshot.url ?? '', online: !!snapshot.url, token: identity?.session ?? null,
    refreshToken: identity?.refresh ?? null, pairedPin: identity?.pin ?? null, keepRotatedTokens, connectionState: snapshot.state,
    connectionOutage: snapshot.outage ?? null,
    pondUrls: [...new Set([...(snapshot.url ? [snapshot.url] : []), ...(manager.savedProfile?.localUrls ?? [])])],
    profileId: identity?.id ?? '', paired: hasPairing, remoteEnabled,
    keepLocalOnly, hydrated, screenModes, isScreenReal, setScreenMode,
    checkHealth, setRemoteEndpoint, recover: manager.recover, retryNow: manager.retryNow, tryAddress: manager.tryAddress, revoke: manager.revoke.bind(manager), stagePairing, cancelPairing, pair, claimPairing, recoverPairing, adoptPairing, requestSpokenCode, unpair, forgetLocally,
  }), [snapshot, identity, hasPairing, remoteEnabled, hydrated, screenModes, isScreenReal, setScreenMode, checkHealth, setRemoteEndpoint, keepLocalOnly, keepRotatedTokens, manager, stagePairing, cancelPairing, pair, claimPairing, recoverPairing, adoptPairing, requestSpokenCode, unpair, forgetLocally]);
  return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>;
}
export function useServer(): ServerContextValue {
  const context = useContext(ServerContext);
  if (!context) throw new Error('useServer must be used within a ServerProvider');
  return context;
}

/**
 * The server context where there is one. The assistant overlay renders its own root, outside the
 * app's ServerProvider, so a hook it shares with the app must not require one.
 */
export function useOptionalServer(): ServerContextValue | null {
  return useContext(ServerContext);
}
