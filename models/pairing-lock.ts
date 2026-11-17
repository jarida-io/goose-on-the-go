// The pairing lock: a Pond that holds a new phone until its main member lets it in. What the
// phone is told while it waits, and what a paired member sees of the lock in Devices.

import { count, list, record, text, textOrNull, time } from './me-read';

/** A phone's place in the queue: what it shows to come back for its answer. In memory only, never logged. */
export interface HeldPairing {
  requestId: string;
  claimSecret: string;
  /** When the Pond stops holding the request. */
  expiresAt: string;
  /** What the Pond said it can do when it took the request: its answer to the claim does not say again. */
  capabilities?: string[];
}

/** The request in a held verify's answer, or null when it carries none this phone can come back with. */
export function readHeldPairing(raw: unknown): HeldPairing | null {
  const r = record(raw);
  const requestId = text(r?.request_id);
  const claimSecret = typeof r?.claim_secret === 'string' ? r.claim_secret : '';
  if (!requestId || !claimSecret) return null;
  return { requestId, claimSecret, expiresAt: text(r?.expires_at) };
}

/** The refusal a held pairing arrives as, and the one for a Pond with too many phones waiting. */
export const APPROVAL_REQUIRED = 'approval_required';
export const PAIRING_REQUESTS_FULL = 'pairing_requests_full';

/** How long the phone keeps asking, when the Pond's own deadline cannot be read. */
export const HELD_FALLBACK_MS = 10 * 60_000;

/** When a held request runs out, by this phone's clock. */
export function heldUntil(held: HeldPairing, now: number): number {
  const at = Date.parse(held.expiresAt);
  return Number.isNaN(at) ? now + HELD_FALLBACK_MS : at;
}

export interface PairingLock {
  /** The household's choice. */
  locked: boolean;
  /** Whether the lock is holding: it holds only while its main member could still answer or recover. */
  enforced: boolean;
  ownerProfileId: string | null;
  hasRecoveryPin: boolean;
  ownerHasAPhone: boolean;
  minPinDigits: number;
  /** Whether this phone may change the lock and answer the phones that wait. */
  canChange: boolean;
}

export const MAX_PIN_DIGITS = 12;
const DEFAULT_MIN_PIN_DIGITS = 6;

export function readPairingLock(raw: unknown): PairingLock | null {
  const r = record(raw);
  if (!r || typeof r.locked !== 'boolean') return null;
  const min = count(r.min_pin_digits);
  return {
    locked: r.locked,
    enforced: r.enforced === true,
    ownerProfileId: textOrNull(r.owner_profile_id),
    hasRecoveryPin: r.has_recovery_pin === true,
    ownerHasAPhone: r.owner_has_a_phone === true,
    minPinDigits: min >= 1 && min <= MAX_PIN_DIGITS ? min : DEFAULT_MIN_PIN_DIGITS,
    canChange: r.can_change === true,
  };
}

/** A recovery PIN the Pond would take: digits only, six to twelve of them. */
export function isRecoveryPin(pin: string, minDigits = DEFAULT_MIN_PIN_DIGITS): boolean {
  return /^\d+$/.test(pin) && pin.length >= minDigits && pin.length <= MAX_PIN_DIGITS;
}

/**
 * Where a new PIN typed twice stands: `ready` once both match and the PIN is valid; `mismatch` once
 * the second entry is as long as the first and differs, so a slip is caught before it is saved;
 * `pending` while either is still being typed.
 */
export type PinConfirmation = 'pending' | 'mismatch' | 'ready';

export function pinConfirmation(pin: string, again: string, minDigits = DEFAULT_MIN_PIN_DIGITS): PinConfirmation {
  if (again.length >= pin.length && again.length > 0 && again !== pin) return 'mismatch';
  return isRecoveryPin(pin, minDigits) && again === pin ? 'ready' : 'pending';
}

/** What is typed into a PIN field, kept to digits and to the longest PIN there is. */
export function pinDigits(typed: string): string {
  return typed.replace(/\D/g, '').slice(0, MAX_PIN_DIGITS);
}

/** Why a lock that is on is not holding, or null when it holds or is off. */
export type LockGap = 'no_main_member' | 'no_phone_or_pin';

export function lockGap(lock: PairingLock): LockGap | null {
  if (!lock.locked || lock.enforced) return null;
  return lock.ownerProfileId ? 'no_phone_or_pin' : 'no_main_member';
}

/** A phone waiting to be let in. */
export interface PairingRequest {
  id: string;
  deviceName: string;
  clientType: string;
  /** The member its pairing code named, when it named one. */
  profileId: string | null;
  createdAt: string | null;
  expiresAt: string | null;
}

export function readPairingRequests(raw: unknown): PairingRequest[] {
  return list(record(raw)?.requests).flatMap((item) => {
    const r = record(item);
    const id = text(r?.id);
    if (!r || !id) return [];
    return [
      {
        id,
        deviceName: text(r.device_name),
        clientType: text(r.client_type),
        profileId: textOrNull(r.profile_id),
        createdAt: time(r.created_at),
        expiresAt: time(r.expires_at),
      },
    ];
  });
}
