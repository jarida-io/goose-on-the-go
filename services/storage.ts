/**
 * Typed AsyncStorage wrapper for persistent key-value storage.
 *
 * AsyncStorage is unencrypted. Nothing sensitive belongs here — tokens and any
 * other credential go through `services/secure-storage.ts`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  serverUrl: '@goose/server-url',
  connectionProfile: '@goose/connection-profile',
  lastScreen: '@goose/last-screen',
  settings: '@goose/settings',
  devScreenModes: '@goose/dev-screen-modes',
} as const;

/**
 * Keys written by builds that predate secure token storage.
 *
 * Nothing reads or writes these any more, but removing the key from `KEYS` does
 * not remove the value from a device that already has one: an install that ran
 * an older build still holds a plaintext bearer token that nothing would ever
 * clear. This list exists so `purgeLegacyStorage()` can delete them.
 */
const LEGACY_KEYS = [
  // Session token, held in the clear before it moved to the Keychain /
  // EncryptedSharedPreferences in services/secure-storage.ts.
  '@goose/token',
] as const;

type StorageKey = keyof typeof KEYS;

/**
 * Delete anything an earlier build left behind in plaintext.
 *
 * Safe to call on every launch: `multiRemove` on absent keys is a no-op, so this
 * costs one AsyncStorage round trip and needs no "have I migrated yet" flag —
 * which would itself be a thing that can go wrong.
 */
export async function purgeLegacyStorage(): Promise<void> {
  await AsyncStorage.multiRemove([...LEGACY_KEYS]);
}

export const Storage = {
  async get(key: StorageKey): Promise<string | null> {
    return AsyncStorage.getItem(KEYS[key]);
  },

  async set(key: StorageKey, value: string): Promise<void> {
    return AsyncStorage.setItem(KEYS[key], value);
  },

  async remove(key: StorageKey): Promise<void> {
    return AsyncStorage.removeItem(KEYS[key]);
  },

  async getJSON<T>(key: StorageKey): Promise<T | null> {
    const raw = await AsyncStorage.getItem(KEYS[key]);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  async setJSON<T>(key: StorageKey, value: T): Promise<void> {
    return AsyncStorage.setItem(KEYS[key], JSON.stringify(value));
  },
};
