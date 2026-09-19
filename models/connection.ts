/** Non-secret endpoint metadata. The public-key pin is held in SecureStore. */
export interface ConnectionProfile {
  version: 2;
  host: string;
  port: number;
  localUrls: string[];
  remoteUrl?: string;
}
export type ConnectionState = 'trust' | 'unpaired' | 'upgrade' | 'reconnecting' | 'local' | 'remote' | 'disconnected';

export function validPin(pin: string): boolean {
  return /^sha256\/[A-Za-z0-9+/]{43}=$/.test(pin);
}

export function normalizeHttpsUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
      (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw new Error('Invalid HTTPS Pond origin');
  }
  return url.origin;
}

export function parseConnectionProfile(raw: unknown): ConnectionProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as ConnectionProfile;
  if (p.version !== 2 || typeof p.host !== 'string' || !p.host || !Number.isInteger(p.port) ||
      p.port < 1 || p.port > 65535 || !Array.isArray(p.localUrls) || !p.localUrls.length || p.localUrls.length > 8) return null;
  try {
    return { version: 2, host: p.host, port: p.port,
      localUrls: [...new Set(p.localUrls.map(normalizeHttpsUrl))],
      ...(p.remoteUrl ? { remoteUrl: normalizeHttpsUrl(p.remoteUrl) } : {}),
    };
  } catch { return null; }
}

/** The phone rejects known remote addresses; the server checks the actual source subnet. */
export function isLocalPairingUrl(url: string): boolean {
  const host = new URL(normalizeHttpsUrl(url)).hostname.toLowerCase();
  if (host === 'localhost' || host === '[::1]' || host.endsWith('.local')) return true;
  const parts = host.split('.').map(Number);
  if (parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    return parts[0] === 10 || parts[0] === 127 || (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
  }
  return !host.includes('.') && !host.includes(':') && /^[a-z0-9-]+$/.test(host);
}
