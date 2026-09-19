import { normalizeHttpsUrl, validPin, type ConnectionProfile } from './connection';
import i18n from '@/services/i18n';

export interface PairingPayload {
  /** Base URL of the pond server, e.g. http://gooses-mac.local:4000 */
  serverUrl: string;
  pin: string;
  profile: ConnectionProfile;
  /**
   * The same server by its LAN address, when the QR carried one.
   *
   * Tried only after `serverUrl` fails to answer: the hostname is the better
   * one to keep, and an address baked into a QR goes stale on the next DHCP
   * lease.
   */
  fallbackUrl?: string;
  /**
   * The same server by its tailnet address, when the QR carried one.
   *
   * The only one of the three that still reaches the Pond from outside the
   * house, and the last to be tried: at home the LAN address is a direct hop
   * that needs no VPN running.
   */
  remoteUrl?: string;
  /** Hostname the hub is advertised as (for display) */
  host: string;
  /** Single-use 6-digit pairing code */
  code: string;
}

export class InvalidPairingCodeError extends Error {
  constructor() {
    super(i18n.t('pairing.invalid'));
    this.name = 'InvalidPairingCodeError';
  }
}

/**
 * Does this look like a Matter device's setup code rather than a pairing code?
 *
 * Two different QR codes are in play and they are easy to confuse: the Pond's
 * dashboard shows one to pair a phone, and every Matter device ships with one
 * to commission it. Scanning the device's code here is a reasonable mistake,
 * and "that is not a pairing code" is an unhelpful answer to it — the user is
 * holding a code that is perfectly valid somewhere else in the app.
 *
 * This recognises the shapes the Matter controller accepts: the `MT:` QR
 * payload, and the 11- or 21-digit manual codes printed beside it. It exists to
 * pick the right sentence, so it is deliberately loose — the controller remains
 * the authority on what actually decodes.
 */
export function looksLikeMatterSetupCode(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.startsWith('MT:')) return trimmed.length > 3;
  return /^\d{11}$|^\d{21}$/.test(trimmed.replace(/[\s-]/g, ''));
}

/** Parses raw QR code text into a pairing payload. Throws `InvalidPairingCodeError` if malformed. */
export function parsePairingPayload(raw: string): PairingPayload {
  try {
    const url = new URL(raw.trim());
    const params = url.searchParams;
    for (const field of ['v', 'scheme', 'host', 'port', 'code', 'pin', 'ip', 'ts']) {
      if (params.getAll(field).length > 1) throw new InvalidPairingCodeError();
    }
    const host = params.get('host') ?? '';
    const portText = params.get('port') ?? '';
    const port = Number(portText);
    const code = params.get('code') ?? '';
    const pin = params.get('pin') ?? '';
    if (url.protocol !== 'pond:' || url.hostname !== 'pair' || url.pathname || url.hash ||
        params.get('v') !== '2' || params.get('scheme') !== 'https' || !validPin(pin) ||
        !/^\d{6}$/.test(code) || !/^\d+$/.test(portText) || port < 1 || port > 65535) {
      throw new InvalidPairingCodeError();
    }
    const origin = (name: string) => {
      if (!/^[a-zA-Z0-9.:-]+$/.test(name)) throw new InvalidPairingCodeError();
      return normalizeHttpsUrl(`https://${name.includes(':') ? `[${name}]` : name}:${port}`);
    };
    const serverUrl = origin(host);
    const fallbackUrl = params.get('ip') ? origin(params.get('ip')!) : undefined;
    const remoteUrl = params.get('ts') ? origin(params.get('ts')!) : undefined;
    return { serverUrl, fallbackUrl, remoteUrl, host, code, pin,
      profile: { version: 2, host, port, localUrls: [...new Set([fallbackUrl, serverUrl].filter((u): u is string => !!u))], remoteUrl },
    };
  } catch { throw new InvalidPairingCodeError(); }
}
