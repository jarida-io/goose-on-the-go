import { loadPairedProfile, commitPairedProfile, type PondIdentity as Identity, type SavedPond as Saved } from '@/services/paired-profile';
/** Owns the saved identity, staged local pairing, and shared endpoint recovery. */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Storage, purgeLegacyStorage } from '@/services/storage';
import { SecureStorage } from '@/services/secure-storage';
import { api, PondApiClient, type HandshakeResponse } from '@/services/api-client';
import { ConnectionManager, type ConnectionSnapshot } from '@/services/connection-manager';
import { configurePondTrust, PondTrustError } from '@/services/pond-trust';
import { findPondByHost } from '@/services/discovery';
import { parseConnectionProfile, validPin, isLocalPairingUrl, type ConnectionProfile } from '@/models/connection';
import i18n from '@/services/i18n';

interface PairOptions { clientId: string; pairingCode: string; deviceName?: string }
interface ServerContextValue {
  serverUrl: string; online: boolean; token: string | null; refreshToken: string | null;
  connectionState: ConnectionSnapshot['state'];
  checkHealth: () => Promise<boolean>;
  recover: () => Promise<string | null>;
  stagePairing: (profile: ConnectionProfile, pin: string) => Promise<void>;
  cancelPairing: () => Promise<void>;
  pair: (opts: PairOptions) => Promise<HandshakeResponse>;
  signOut: () => Promise<void>;
  /** Per-screen mock/real backend flags (dev only) — see MIGRATION_SCREENS. */
  screenModes: ScreenModes;
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
 * mock branch left would be a switch that does nothing.
 *
 * Nothing enforces this list: each view-model has to call `isScreenReal`
 * itself, so a screen can read "Real" here while its hook still returns mock
 * data because it never asked.
 */
export const MIGRATION_SCREENS = [
  'chat',
  'voice',
  'memory',
  'integrations',
  'schedule',
  'logs',
] as const;

export type MigrationScreen = (typeof MIGRATION_SCREENS)[number];

type ScreenModes = Record<MigrationScreen, boolean>;

const DEFAULT_SCREEN_MODES: ScreenModes = MIGRATION_SCREENS.reduce(
  (acc, screen) => ({ ...acc, [screen]: false }),
  {} as ScreenModes,
);

const ServerContext = createContext<ServerContextValue | null>(null);
const trust = (urls: string[], pin: string) => configurePondTrust(urls.map((url) => ({ url, pin })));
const probe = async (url: string) => {
  const result = await new PondApiClient(url).health();
  if (result.trustFailure) throw new PondTrustError();
  return result.ok;
};

export function ServerProvider({ children }: PropsWithChildren) {
  const [screenModes, setScreenModes] = useState<ScreenModes>(DEFAULT_SCREEN_MODES);
  const [hydrated, setHydrated] = useState(false);
  const [snapshot, setSnapshot] = useState<ConnectionSnapshot>({ state: 'unpaired', url: null });
  const [identity, setIdentity] = useState<Identity | null>(null);
  const saved = useRef<Saved | null>(null);
  const staged = useRef<{ profile: ConnectionProfile; pin: string; client: PondApiClient } | null>(null);
  const operation = useRef(0);
  const committing = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  const environment = useRef({ cellular: false, active: AppState.currentState === 'active' });
  const manager = useMemo(() => new ConnectionManager({
    probe, trust,
    discover: async (host, port) => (await findPondByHost(host, port))?.url ?? null,
    changed: (next) => {
      console.info('[connection]', next.state);
      setSnapshot(next);
      if (next.url) api.setBaseUrl(next.url);
    },
  }), []);

  const restore = useCallback(async () => {
    const current = saved.current;
    await manager.configure(current?.profile ?? null, current?.identity.pin ?? '');
    if (!mounted.current) return;
    if (current) {
      api.setToken(current.identity.session);
      api.setRefreshToken(current.identity.refresh);
      setIdentity(current.identity);
      manager.environment(environment.current.cellular, environment.current.active);
    } else setIdentity(null);
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
      environment.current.cellular = state.type === 'cellular';
      if (!staged.current) manager.environment(environment.current.cellular, environment.current.active);
    });
    const appSub = AppState.addEventListener('change', (state) => {
      environment.current.active = state === 'active';
      if (!staged.current) manager.environment(environment.current.cellular, environment.current.active);
    });
    api.setRecovery(manager.recover);
    void (async () => {
      try {
        await purgeLegacyStorage();
        const loaded = await loadPairedProfile();
        if (cancelled || staged.current) return;
        if (loaded.saved) {
          saved.current = loaded.saved;
          await restore();
        } else await manager.configure(null, '', loaded.upgrade);
      } catch {
        console.warn('[connection] saved profile could not be loaded');
        setSnapshot({ state: 'upgrade', url: null });
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    api.setOnTokensRotated((session, refresh) => {
      const current = saved.current;
      if (!current || staged.current) return;
      const next = { ...current.identity, session, refresh };
      saved.current = { ...current, identity: next };
      setIdentity(next);
      void SecureStorage.set('pondIdentity', JSON.stringify(next)).catch(() => {
        console.warn('[connection] rotated credentials could not be saved');
        setSnapshot({ state: 'disconnected', url: null });
      });
    });
    return () => {
      cancelled = true; mounted.current = false; invalidateOperation();
      networkSub(); appSub.remove(); manager.environment(false, false);
      api.setRecovery(null); api.setOnTokensRotated(null);
    };
  }, [manager, restore, invalidateOperation]);

  // Address updates remain non-secret and tied to the saved secure identity.
  useEffect(() => {
    const current = saved.current;
    const profile = manager.savedProfile;
    if (!current || !profile || staged.current || !snapshot.url) return;
    saved.current = { ...current, profile };
    void Storage.set('connectionProfile', JSON.stringify({ [current.identity.id]: profile })).catch(() => {
      console.warn('[connection] updated addresses could not be saved');
    });
  }, [snapshot, manager]);

  const stagePairing = useCallback(async (rawProfile: ConnectionProfile, pin: string) => {
    await committing.current?.catch(() => undefined);
    const profile = parseConnectionProfile(rawProfile);
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
      const found = await findPondByHost(profile.host, profile.port);
      if (op !== operation.current) throw new Error(i18n.t('pairing.failed'));
      if (found && isLocalPairingUrl(found.url) && !candidates.includes(found.url)) candidates.push(found.url);
      await trust(candidates, pin);
      let trustRejected = false;
      for (const url of candidates) {
        if (op !== operation.current) throw new Error(i18n.t('pairing.failed'));
        let verified = false;
        try { verified = await probe(url); } catch (error) { if (error instanceof PondTrustError) trustRejected = true; }
        if (verified) {
          if (op !== operation.current) throw new Error(i18n.t('pairing.failed'));
          staged.current = { profile: { ...profile, localUrls: candidates }, pin, client: new PondApiClient(url) };
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

  const pair = useCallback(async (opts: PairOptions) => {
    const pending = staged.current;
    const op = operation.current;
    if (!pending) throw new Error(i18n.t('pairing.lan'));
    const net = await NetInfo.fetch();
    if (!['wifi', 'ethernet'].includes(net.type)) throw new Error(i18n.t('pairing.lan'));
    if (op !== operation.current) throw new Error(i18n.t('pairing.failed'));
    const resp = await pending.client.pair(opts);
    if (op !== operation.current) throw new Error(i18n.t('pairing.failed'));
    if (resp.accepted && resp.session_token) {
      const next: Identity = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, pin: pending.pin,
        session: resp.session_token, refresh: resp.refresh_token ?? null };
      // Write addresses first, retaining the previous entry until the atomic secure commit.
      const previous = saved.current;
      const commit = (async () => {
        await commitPairedProfile(previous, { identity: next, profile: pending.profile });
        saved.current = { identity: next, profile: pending.profile };
        staged.current = null;
        await restore();
      })();
      committing.current = commit;
      try { await commit; } finally { if (committing.current === commit) committing.current = null; }
    }
    return resp;
  }, [restore]);

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
    // Production has no way to flip these, so it never pays to read them.
    (screen: MigrationScreen) => (__DEV__ ? screenModes[screen] : false),
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

  const signOut = useCallback(async () => {
    await committing.current?.catch(() => undefined);
    await api.handshakeRevoke().catch(() => console.warn('[connection] remote revocation unavailable'));
    operation.current++; staged.current = null; saved.current = null;
    api.invalidateIdentity(); setIdentity(null);
    await SecureStorage.remove('pondIdentity');
    await SecureStorage.remove('sessionToken'); await SecureStorage.remove('refreshToken');
    await Storage.remove('connectionProfile'); await Storage.remove('serverUrl');
    await manager.configure(null);
  }, [manager]);
  const checkHealth = useCallback(async () => !!await manager.recover(), [manager]);
  const value = useMemo<ServerContextValue>(() => ({
    serverUrl: snapshot.url ?? '', online: !!snapshot.url, token: identity?.session ?? null,
    refreshToken: identity?.refresh ?? null, connectionState: snapshot.state,
    hydrated, screenModes, isScreenReal, setScreenMode,
    checkHealth, recover: manager.recover, stagePairing, cancelPairing, pair, signOut,
  }), [snapshot, identity, hydrated, screenModes, isScreenReal, setScreenMode, checkHealth, manager, stagePairing, cancelPairing, pair, signOut]);
  return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>;
}
export function useServer(): ServerContextValue {
  const context = useContext(ServerContext);
  if (!context) throw new Error('useServer must be used within a ServerProvider');
  return context;
}
