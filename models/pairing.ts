/**
 * Pairing payload — decoded from the QR code shown on Goose In A Pond desktop.
 *
 * Desktop encodes: pond://pair?host=<hostname>.local&port=<port>&code=<6-digit>
 * The code is a short-lived secret proved via the two-phase handshake
 * (see services/handshake.ts) — it is never sent over the wire.
 */

export interface PairingPayload {
  /** Base URL of the pond server, e.g. http://gooses-mac.local:4000 */
  serverUrl: string;
  /** Hostname the hub is advertised as (for display) */
  host: string;
  /** Single-use 6-digit pairing code */
  code: string;
}

export class InvalidPairingCodeError extends Error {
  constructor() {
    super('This QR code isn’t a valid Goose In A Pond pairing code.');
    this.name = 'InvalidPairingCodeError';
  }
}

/** Parses raw QR code text into a pairing payload. Throws `InvalidPairingCodeError` if malformed. */
export function parsePairingPayload(raw: string): PairingPayload {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new InvalidPairingCodeError();
  }

  const host = url.searchParams.get('host');
  const port = url.searchParams.get('port');
  const code = url.searchParams.get('code');
  if (url.protocol !== 'pond:' || !host || !port || !code) {
    throw new InvalidPairingCodeError();
  }

  return { serverUrl: `http://${host}:${port}`, host, code };
}
