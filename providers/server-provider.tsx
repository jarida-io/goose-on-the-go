/**
 * ServerProvider — stores server connection state for the desktop companion link,
 * plus per-screen dev toggles between mock data and the real PondApiClient.
 *
 * Provides `serverUrl`, `online`, and `token` along with their setters.
 * `online` is driven by a real `/health` check against `PondApiClient` rather
 * than a manual setter. The automatic check only runs in dev builds — the
 * mock/real toggle it supports isn't reachable in production yet either.
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

import { api } from '@/services/api-client';
import { Storage } from '@/services/storage';

const DEFAULT_SERVER_URL = 'http://127.0.0.1:4000';

/**
 * Screens whose data-fetching hook can be independently switched to the real
 * PondApiClient as its backing endpoints land (see issues #9–#15). Kept as an
 * explicit list rather than a boolean so migration work lands screen by
 * screen instead of one coordinated cutover.
 *
 * There's no automatic enforcement tying this list to actual behavior: each
 * consuming view-model (e.g. use-chat.ts) must check `isScreenReal(screen)`
 * itself. A screen can be flagged "Real" here while its view-model still
 * silently returns mock data if it forgets to check.
 */
export const MIGRATION_SCREENS = [
  'chat',
  'devices',
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

interface ServerContextValue {
  /** Base URL of the companion server */
  serverUrl: string;
  /** Whether the server is currently reachable (from a real /health check) */
  online: boolean;
  /** Auth token for server communication (null = unauthenticated) */
  token: string | null;
  /** Sets the server URL and awaits a fresh /health check against it */
  setServerUrl: (url: string) => Promise<boolean>;
  setToken: (token: string | null) => void;
  /** Re-run the /health check against the current serverUrl */
  checkHealth: () => Promise<boolean>;

  /** Per-screen mock (false) vs. real-backend (true) mode */
  screenModes: ScreenModes;
  /** Whether a given screen's data-fetching hook should use the real API client */
  isScreenReal: (screen: MigrationScreen) => boolean;
  setScreenMode: (screen: MigrationScreen, useReal: boolean) => void;
}

const ServerContext = createContext<ServerContextValue | null>(null);

export function ServerProvider({ children }: PropsWithChildren) {
  const [serverUrl, setServerUrlState] = useState(DEFAULT_SERVER_URL);
  const [online, setOnline] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [screenModes, setScreenModes] = useState<ScreenModes>(DEFAULT_SCREEN_MODES);

  // Guards against an out-of-order response (e.g. two health checks in
  // flight at once) overwriting `online` with a stale result.
  const healthCheckSeqRef = useRef(0);
  const checkHealth = useCallback(async () => {
    const seq = ++healthCheckSeqRef.current;
    const result = await api.health();
    if (seq === healthCheckSeqRef.current) {
      setOnline(result.ok);
    }
    return result.ok;
  }, []);

  // Load persisted dev screen modes once on mount. `setScreenMode` awaits
  // this promise before persisting, so an early toggle (before this resolves)
  // can't clobber other screens' already-saved modes.
  const loadScreenModesRef = useRef<Promise<ScreenModes | null> | undefined>(undefined);
  useEffect(() => {
    loadScreenModesRef.current = Storage.getJSON<ScreenModes>('devScreenModes');
    loadScreenModesRef.current.then((saved) => {
      if (saved) setScreenModes((prev) => ({ ...prev, ...saved }));
    });
  }, []);

  // Mirrors `screenModes` for reading the latest value synchronously inside
  // `setScreenMode` (a ref, not the state itself, so a toggle right after
  // another one doesn't read a stale closure while the first is still
  // in flight).
  const screenModesRef = useRef(screenModes);
  useEffect(() => {
    screenModesRef.current = screenModes;
  }, [screenModes]);

  // Dev builds only — the toggle this drives isn't reachable in production.
  useEffect(() => {
    if (!__DEV__) return;
    checkHealth();
    // Only re-run for an explicit serverUrl change from outside setServerUrl
    // (e.g. a future pairing flow setting api's base URL directly is out of
    // scope today); setServerUrl itself already awaits its own check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSetServerUrl = useCallback(
    async (url: string) => {
      const clean = url.replace(/\/+$/, ''); // strip trailing slashes
      api.setBaseUrl(clean);
      setServerUrlState(clean);
      return checkHealth();
    },
    [checkHealth],
  );

  useEffect(() => {
    api.setToken(token);
  }, [token]);

  const setScreenMode = useCallback(async (screen: MigrationScreen, useReal: boolean) => {
    try {
      await loadScreenModesRef.current;
    } catch {
      // Storage read failed — nothing to merge in, proceed with current state.
    }
    const next = { ...screenModesRef.current, [screen]: useReal };
    screenModesRef.current = next;
    setScreenModes(next);
    Storage.setJSON('devScreenModes', next);
  }, []);

  const isScreenReal = useCallback(
    (screen: MigrationScreen) => screenModes[screen],
    [screenModes],
  );

  const value = useMemo<ServerContextValue>(
    () => ({
      serverUrl,
      online,
      token,
      setServerUrl: handleSetServerUrl,
      setToken,
      checkHealth,
      screenModes,
      isScreenReal,
      setScreenMode,
    }),
    [serverUrl, online, token, handleSetServerUrl, checkHealth, screenModes, isScreenReal, setScreenMode],
  );

  return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>;
}

/**
 * Access server connection state and dev migration toggles.
 * Must be called within a `<ServerProvider>`.
 */
export function useServer(): ServerContextValue {
  const ctx = useContext(ServerContext);
  if (!ctx) {
    throw new Error('useServer must be used within a <ServerProvider>');
  }
  return ctx;
}
