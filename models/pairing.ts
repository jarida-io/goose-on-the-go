/**
 * Pairing payload — decoded from the QR code shown on Goose In A Pond desktop.
 *
 * Desktop encodes either a JSON object or a URL/URI whose query string
 * carries the same fields, so both are accepted:
 *   {"url":"http://192.168.1.5:4000","token":"...","name":"Jerry's Mac"}
 *   goosepond://pair?url=http://192.168.1.5:4000&token=...&name=...
 */

export interface PairingPayload {
  serverUrl: string;
  token: string;
  deviceName?: string;
}

export class InvalidPairingCodeError extends Error {
  constructor() {
    super('This QR code isn’t a valid Goose In A Pond pairing code.');
    this.name = 'InvalidPairingCodeError';
  }
}

function fromFields(get: (key: string) => string | null): PairingPayload {
  const serverUrl = get('url') ?? get('serverUrl');
  const token = get('token');
  if (!serverUrl || !token) {
    throw new InvalidPairingCodeError();
  }
  return {
    serverUrl: serverUrl.replace(/\/+$/, ''),
    token,
    deviceName: get('name') ?? get('deviceName') ?? undefined,
  };
}

/** Parses raw QR code text into a pairing payload. Throws `InvalidPairingCodeError` if malformed. */
export function parsePairingPayload(raw: string): PairingPayload {
  const trimmed = raw.trim();

  try {
    const json = JSON.parse(trimmed);
    return fromFields((key) => (typeof json[key] === 'string' ? json[key] : null));
  } catch {
    // Not JSON — fall through to URL parsing below.
  }

  try {
    const url = new URL(trimmed);
    return fromFields((key) => url.searchParams.get(key));
  } catch {
    throw new InvalidPairingCodeError();
  }
}
