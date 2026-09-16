/**
 * ServerProvider — stores server connection state for the desktop companion link.
 *
 * Provides `serverUrl`, `online`, and `token` along with their setters.
 * No actual network calls — that responsibility belongs to a future service layer.
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

interface ServerContextValue {
  /** Base URL of the companion server */
  serverUrl: string;
  /** Whether the server is currently reachable */
  online: boolean;
  /** Auth token for server communication (null = unauthenticated) */
  token: string | null;
  setServerUrl: (url: string) => void;
  setToken: (token: string | null) => void;
  /** Manually toggle online state (will be driven by health-check later) */
  setOnline: (online: boolean) => void;
}

const ServerContext = createContext<ServerContextValue | null>(null);

export function ServerProvider({ children }: PropsWithChildren) {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [online, setOnline] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  // Sync the shared API client singleton SYNCHRONOUSLY whenever serverUrl/token
  // change, rather than via a reactive useEffect — an effect-based sync races
  // consumer hooks that gate on `online && token` from context: React fires a
  // descendant's effects (e.g. a view-model's fetch-on-mount effect) before an
  // ancestor's own effects in the same commit, so a hook could see truthy
  // `online`/`token` from context and call `api.listSchedules()` before this
  // provider's own sync effect had run, sending the request with no token yet
  // attached. Calling api.setBaseUrl/setToken inline, before the state update
  // that consumers react to, closes that window entirely.
  const handleSetServerUrl = useCallback((url: string) => {
    const normalized = url.replace(/\/+$/, ''); // strip trailing slashes
    api.setBaseUrl(normalized);
    setServerUrl(normalized);
  }, []);

  const handleSetToken = useCallback((t: string | null) => {
    api.setToken(t);
    setToken(t);
  }, []);

  // Restore a previously-paired desktop on app launch.
  useEffect(() => {
    (async () => {
      const [storedUrl, storedToken] = await Promise.all([
        Storage.get('serverUrl'),
        Storage.get('token'),
      ]);
      if (storedUrl && storedToken) {
        handleSetServerUrl(storedUrl);
        handleSetToken(storedToken);
        setOnline(true);
      }
    })();
  }, [handleSetServerUrl, handleSetToken]);

  const value = useMemo<ServerContextValue>(
    () => ({
      serverUrl,
      online,
      token,
      setServerUrl: handleSetServerUrl,
      setToken: handleSetToken,
      setOnline,
    }),
    [serverUrl, online, token, handleSetServerUrl, handleSetToken],
  );

  return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>;
}

/**
 * Access server connection state.
 * Must be called within a `<ServerProvider>`.
 */
export function useServer(): ServerContextValue {
  const ctx = useContext(ServerContext);
  if (!ctx) {
    throw new Error('useServer must be used within a <ServerProvider>');
  }
  return ctx;
}
