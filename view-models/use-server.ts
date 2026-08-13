/**
 * Server ViewModel
 * Server health check and connection management.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

import { timeoutSignal } from '@/services/http';

interface ServerHealth {
  online: boolean;
  latencyMs: number | null;
  uptime: string | null;
}

export function useServerHealth(serverUrl: string) {
  const [health, setHealth] = useState<ServerHealth>({
    online: false,
    latencyMs: null,
    uptime: null,
  });
  const [checking, setChecking] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkHealth = useCallback(async () => {
    setChecking(true);
    try {
      const start = Date.now();
      const res = await fetch(`${serverUrl}/health`, { signal: timeoutSignal(3000) });
      const latency = Date.now() - start;
      if (res.ok) {
        setHealth({ online: true, latencyMs: latency, uptime: null });
      } else {
        setHealth({ online: false, latencyMs: null, uptime: null });
      }
    } catch {
      setHealth({ online: false, latencyMs: null, uptime: null });
    } finally {
      setChecking(false);
    }
  }, [serverUrl]);

  // Poll every 30s
  useEffect(() => {
    checkHealth();
    intervalRef.current = setInterval(checkHealth, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkHealth]);

  return { health, checking, checkHealth };
}
