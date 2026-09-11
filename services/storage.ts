/**
 * Typed AsyncStorage wrapper for persistent key-value storage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  serverUrl: '@goose/server-url',
  token: '@goose/token',
  lastScreen: '@goose/last-screen',
  settings: '@goose/settings',
  devScreenModes: '@goose/dev-screen-modes',
} as const;

type StorageKey = keyof typeof KEYS;

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
