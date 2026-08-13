/**
 * Two-phase pairing handshake with the pond server (GIAP #93).
 *
 * 1. POST /api/v1/handshake/init    → server mints a challenge for client_id
 * 2. POST /api/v1/handshake/verify  → client submits
 *    hex(HMAC-SHA256(pairing_code, challenge_bytes || client_id))
 *    and receives session + refresh tokens.
 *
 * The pairing code itself never goes over the wire.
 */

import * as Crypto from 'expo-crypto';

import type { PairingPayload } from '@/models/pairing';
import { timeoutSignal } from '@/services/http';

const API_PREFIX = '/api/v1';
const REQUEST_TIMEOUT_MS = 8000;

export interface PairResult {
  sessionToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  hostname: string;
}

export interface ClientInfo {
  clientId: string;
  clientVersion: string;
  deviceName: string | null;
}

// ─── HMAC-SHA256 (expo-crypto only exposes plain digests) ───

const BLOCK_SIZE = 64;

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(
    await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data as Uint8Array<ArrayBuffer>),
  );
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function hmacSha256(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const normalizedKey = key.length > BLOCK_SIZE ? await sha256(key) : key;
  const ipad = new Uint8Array(BLOCK_SIZE).fill(0x36);
  const opad = new Uint8Array(BLOCK_SIZE).fill(0x5c);
  normalizedKey.forEach((byte, i) => {
    ipad[i] ^= byte;
    opad[i] ^= byte;
  });
  const inner = await sha256(concat(ipad, message));
  return sha256(concat(opad, inner));
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Handshake ───

async function post<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}${API_PREFIX}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: timeoutSignal(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Server responded ${res.status} on ${path}`);
  }
  return res.json();
}

/**
 * Runs the full init → verify pairing flow against the server in `payload`.
 * Resolves with session tokens, or rejects with the server's rejection reason.
 */
export async function pairDevice(
  payload: PairingPayload,
  client: ClientInfo,
): Promise<PairResult> {
  const challenge = await post<{ challenge_id: string; challenge: string }>(
    payload.serverUrl,
    '/handshake/init',
    {
      client_id: client.clientId,
      client_type: 'gotg',
      client_version: client.clientVersion,
    },
  );

  const encoder = new TextEncoder();
  const mac = await hmacSha256(
    encoder.encode(payload.code),
    concat(base64ToBytes(challenge.challenge), encoder.encode(client.clientId)),
  );

  const verify = await post<{
    accepted: boolean;
    session_token: string | null;
    refresh_token: string | null;
    expires_at: string | null;
    hostname: string;
    rejection_reason: string | null;
  }>(payload.serverUrl, '/handshake/verify', {
    challenge_id: challenge.challenge_id,
    mac: bytesToHex(mac),
    device_name: client.deviceName,
  });

  if (!verify.accepted || !verify.session_token) {
    throw new Error(
      verify.rejection_reason === 'invalid_mac'
        ? 'The pairing code didn’t match — it may have expired. Refresh the QR code on desktop and try again.'
        : (verify.rejection_reason ?? 'The server rejected the pairing request.'),
    );
  }

  return {
    sessionToken: verify.session_token,
    refreshToken: verify.refresh_token,
    expiresAt: verify.expires_at,
    hostname: verify.hostname,
  };
}
