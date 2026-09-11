/**
 * ServerProvider — stores server connection state for the desktop companion link,
 * plus per-screen dev toggles between mock data and the real PondApiClient.
 *
 * Provides `serverUrl`, `online`, and `token` along with their setters.
 * `online` is driven by a real `/health` check against `PondApiClient` rather
 * than a manual setter.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  setServerUrl: (url: string) => void;
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

  // Load persisted dev screen modes once on mount.
  useEffect(() => {
    Storage.getJSON<ScreenModes>('devScreenModes').then((saved) => {
      if (saved) setScreenModes((prev) => ({ ...prev, ...saved }));
    });
  }, []);

  const checkHealth = useCallback(async () => {
    const result = await api.health();
    setOnline(result.ok);
    return result.ok;
  }, []);

  // Re-check health whenever the server URL changes.
  useEffect(() => {
    checkHealth();
  }, [serverUrl, checkHealth]);

  const handleSetServerUrl = useCallback((url: string) => {
    const clean = url.replace(/\/+$/, ''); // strip trailing slashes
    api.setBaseUrl(clean);
    setServerUrlState(clean);
  }, []);

  useEffect(() => {
    api.setToken(token);
  }, [token]);

  const setScreenMode = useCallback((screen: MigrationScreen, useReal: boolean) => {
    setScreenModes((prev) => {
      const next = { ...prev, [screen]: useReal };
      Storage.setJSON('devScreenModes', next);
      return next;
    });
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
