/**
 * "Tell Goose where this phone is": the phone's place, by name, with each message from this app.
 *
 * Off until the person turns it on. While on, `api.streamChat` asks `phonePlaceForTurn` for a
 * place name ("Westlands, Nairobi") and sends it as the turn's `device_place`, so Goose can answer
 * "where am I?" with where the phone is, not only with home, where the Pond is. Only the name goes:
 * the coordinates are used here to find it and dropped. It is found again at most every
 * `PLACE_TTL_MS`, from a balanced fix, using a location grant the person gave when they turned the
 * switch on; it never prompts on its own. The Pond keeps it for that turn only.
 */

import * as Location from 'expo-location';

import { api } from './api-client';
import { readPhoneFix } from './home-location';
import { Storage } from './storage';

/** A place is reused for this long; walking across town takes longer. */
export const PLACE_TTL_MS = 5 * 60_000;

let enabled = false;
let cached: { name: string | null; at: number } | null = null;

export function phonePlaceEnabled(): boolean {
  return enabled;
}

/**
 * The Settings switch. On asks for location permission first and resolves whether it is on now;
 * a refusal leaves it off. Remembered on this phone.
 */
export async function savePhonePlacePreference(next: boolean): Promise<boolean> {
  if (next) {
    const held = await Location.getForegroundPermissionsAsync();
    const permission = held.granted ? held : await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      console.info('[phone-place] location not allowed; staying off', { kind: 'phone_place' });
      return false;
    }
  }
  enabled = next;
  cached = null;
  await Storage.set('phonePlace', next ? '1' : '0').catch(() => undefined);
  console.info('[phone-place] telling Goose where the phone is', { kind: 'phone_place', on: next });
  return next;
}

/** Read the remembered choice at launch, and hand the API client the place to send. Off by default. */
export async function loadPhonePlacePreference(): Promise<void> {
  const stored = await Storage.get('phonePlace').catch(() => null);
  enabled = stored === '1';
  api.setTurnPlace(phonePlaceForTurn);
}

/** The place to send with a turn, or undefined while off, unallowed or unknown. Never throws. */
export async function phonePlaceForTurn(): Promise<string | undefined> {
  if (!enabled) return undefined;
  if (cached && Date.now() - cached.at < PLACE_TTL_MS) return cached.name ?? undefined;
  const fix = await readPhoneFix(false, wider);
  // Only a named place is kept: an unnamed one falls back to the last known name if any.
  if (fix.kind !== 'fix' || !fix.name) return cached?.name ?? undefined;
  cached = { name: fix.name, at: Date.now() };
  return fix.name;
}

/** The locality and the town it is in ("Westlands, Nairobi"), or the one there is. */
export function wider(address: Location.LocationGeocodedAddress | undefined): string | null {
  const local = (address?.city || address?.district)?.trim() || null;
  const town = (address?.subregion || address?.region)?.trim() || null;
  if (!local) return town;
  return town && town !== local ? `${local}, ${town}` : local;
}
