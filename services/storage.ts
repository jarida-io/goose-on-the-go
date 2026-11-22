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
  themePreference: '@goose/theme-preference',
  /** The accent colour the whole app is drawn in. A preference of this phone, never sent to the Pond. */
  accentPreference: '@goose/accent-preference',
  /** Whether this phone plays haptic feedback. A preference of the phone, not of the Pond. */
  hapticsEnabled: '@goose/haptics-enabled',
  /** Whether this phone keeps its notification stream open in the background (Android). Not a secret. */
  stayConnected: '@goose/stay-connected',
  replyNotices: '@goose/reply-notices',
  /** Whether this phone tells Goose where it is with each message. Not a place: on or off. */
  phonePlace: '@goose/phone-place',
  onboardingDone: '@goose/onboarding-done',
  chatHistoryView: '@goose/chat-history-view',
  remoteOfferDismissed: '@goose/remote-offer-dismissed',
  /** When the Pond will drop remote access unless the phone is seen at home. Not a secret. */
  remoteLapsesAt: '@goose/remote-lapses-at',
  /** The pin of the Pond whose admin key this phone keeps behind its biometrics. Not the key. */
  adminKeyFor: '@goose/admin-key-for',
  /** The same for the mock Pond, whose key is kept in a slot of its own. */
  adminKeyForMock: '@goose/admin-key-for-mock',
  /** The model each job had before its last change, by model id, so it can be switched back to. */
  lastWorkingModels: '@goose/last-working-models',
  /** The order of Home's widgets: how this phone's owner arranged it, so it outlives a Pond. */
  homeLayout: '@goose/home-layout',
  /** Whether From your Pond is folded to its first suggestion on Home, as this phone's owner left it. */
  homeIdeasCollapsed: '@goose/home-ideas-collapsed',
  /** What the paired Pond said it can do, with its pin. Not a secret. */
  pondCapabilities: '@goose/pond-capabilities',
  /** The story reader's text size, a preference of this phone. */
  readerTextSize: '@goose/reader-text-size',
  /** The order the member put their interests in on My Goose; the Pond keeps no order. */
  interestOrder: '@goose/interest-order',
  /** Which of My Goose's following groups the member folded away. */
  followingFolded: '@goose/following-folded',
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
 * Families of keys: one record per id under a shared prefix, for data that
 * grows with use rather than with the app. Each record is a key of its own, so
 * writing one never rewrites the rest.
 */
const FAMILIES = {
  toolCards: '@goose/tool-cards/',
  /** Owner setup in progress, by paired profile: the Pond cannot be asked for profile preferences until it is done. */
  setupDrafts: '@goose/setup-drafts/',
  /** What owner setup left for later, by paired profile: shown on Home until done or put away. */
  setupChecklist: '@goose/setup-checklist/',
  /** Home's offer of the setup interview, put away, by member: Assistant notes still offers it. */
  interviewOffer: '@goose/interview-offer/',
  /** Which library pictures were sent to a Pond, by Pond address, so none is sent twice. Ids only. */
  captureSync: '@goose/capture-sync/',
} as const;

type StorageFamily = keyof typeof FAMILIES;

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

function parse<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** One family's records, by id. */
export function storageFamily(family: StorageFamily) {
  const prefix = FAMILIES[family];
  return {
    async ids(): Promise<string[]> {
      const keys = await AsyncStorage.getAllKeys();
      return keys.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
    },

    async getJSON<T>(id: string): Promise<T | null> {
      return parse<T>(await AsyncStorage.getItem(prefix + id));
    },

    /** Several at once; an id with nothing readable is absent from the map. */
    async getManyJSON<T>(ids: string[]): Promise<Map<string, T>> {
      const found = new Map<string, T>();
      if (ids.length === 0) return found;
      for (const [key, raw] of await AsyncStorage.multiGet(ids.map((id) => prefix + id))) {
        const value = parse<T>(raw);
        if (value !== null) found.set(key.slice(prefix.length), value);
      }
      return found;
    },

    async setJSON<T>(id: string, value: T): Promise<void> {
      return AsyncStorage.setItem(prefix + id, JSON.stringify(value));
    },

    async remove(ids: string[]): Promise<void> {
      if (ids.length > 0) await AsyncStorage.multiRemove(ids.map((id) => prefix + id));
    },

    /** Every record in the family, for a sign-out that keeps nothing of the household. */
    async clear(): Promise<void> {
      await this.remove(await this.ids());
    },
  };
}
