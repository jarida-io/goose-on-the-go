/**
 * SecureStorage — the only place a credential is allowed to be persisted.
 *
 * Session and refresh tokens go to the iOS Keychain / Android
 * EncryptedSharedPreferences via `expo-secure-store`, never to AsyncStorage.
 * AsyncStorage is unencrypted, so a token there is readable by anything with
 * filesystem access to the app's sandbox — a rooted or jailbroken device, or a
 * backup extraction.
 *
 * `expo-secure-store` is a hard dependency (package.json, and a plugin in
 * app.json). It is imported statically and deliberately has no fallback: a
 * missing native module raises, rather than silently downgrading token storage
 * to plaintext. Silence is the failure mode worth preventing here — the app
 * would look fine and the tokens would be in the clear.
 *
 * Web is the exception, and holds tokens in memory only. There is no keychain in
 * a browser, and the alternatives (localStorage, AsyncStorage) are exactly what
 * this module exists to avoid. Tokens therefore do not survive a reload there.
 * That is acceptable because web is a development preview, not a shipping
 * target; see `docs/TESTING.md`.
 *
 * On iOS the pairing is the one item kept readable while the phone is locked,
 * after it has been unlocked once since starting. A push wake runs exactly then,
 * and with the Keychain's default it could not read the pairing to pull the
 * alert. The Keychain only applies that setting when an item is created, so the
 * pairing lives in its own Keychain service, is moved there the next time it is
 * written, and the old copy is removed only once the new one is saved.
 */

import { NativeModules, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEYS = {
  pondIdentity: 'goose.pondIdentity',
  sessionToken: 'goose.sessionToken',
  refreshToken: 'goose.refreshToken',
  /** Stable per-install identifier used as `client_id` in every handshake. */
  installId: 'goose.installId',
  /**
   * The Pond's signed grant to read its status from the remote-access coordinator while the Pond
   * cannot answer (`services/pond-status.ts`). It reveals only whether the Pond is up.
   */
  pondStatusGrant: 'goose.pondStatusGrant',
} as const;

export type SecureKey = keyof typeof KEYS;

const isWeb = Platform.OS === 'web';

/** Keys a background task must read while the phone is locked. See the module comment. */
const READABLE_WHEN_LOCKED: ReadonlySet<SecureKey> = new Set(['pondIdentity']);
const LOCKED_READ_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: 'goose.afterFirstUnlock',
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

function lockedReadable(key: SecureKey): boolean {
  return Platform.OS === 'ios' && READABLE_WHEN_LOCKED.has(key);
}

/** Web-only, deliberately not persisted. See the module comment. */
const ephemeral = new Map<string, string>();

let warnedAboutWeb = false;
function warnOnceOnWeb(): void {
  if (warnedAboutWeb || !__DEV__) return;
  warnedAboutWeb = true;
  // eslint-disable-next-line no-console
  console.warn(
    '[secure-storage] Running on web: tokens are held in memory only and will ' +
      'not survive a reload. A browser has no keychain, and writing them to ' +
      'localStorage would defeat the point. Pair again after reloading.',
  );
}

/** Kept apart from `KEYS`: read only behind the phone's own biometrics, never alongside the tokens. */
const ADMIN_KEYS = { pond: 'goose.adminKey', mock: 'goose.adminKey.mock' } as const;

/** Whose key a slot holds: the paired Pond's, or the Developer toggle's mock Pond's. */
export type AdminKeySlot = keyof typeof ADMIN_KEYS;

function adminKeyOptions(prompt?: string): SecureStore.SecureStoreOptions {
  return {
    requireAuthentication: true,
    authenticationPrompt: prompt,
    // Never in a backup or on another phone, and only while this one has a passcode.
    keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  };
}

/**
 * Android's own store for the admin key (plugins/pond-keyguard/PondKeyguard.kt): sealed by a
 * Keystore key that opens after a strong biometric or the phone's PIN, pattern or password.
 * expo-secure-store asks for a strong biometric alone, and a Galaxy's face unlock is not one, so
 * those phones offered a fingerprint and nothing else. Absent outside a native Android build.
 */
interface PondKeyguardModule {
  available(): boolean;
  has(slot: AdminKeySlot): boolean;
  save(slot: AdminKeySlot, secret: string, title: string): Promise<void>;
  read(slot: AdminKeySlot, title: string): Promise<string | null>;
  forget(slot: AdminKeySlot): Promise<void>;
}

function keyguard(): PondKeyguardModule | null {
  if (Platform.OS !== 'android') return null;
  return (NativeModules.PondKeyguard as PondKeyguardModule | undefined) ?? null;
}

/** A key kept before Android's own store existed: still opens, with a fingerprint, until it moves. */
async function readLegacy(prompt: string, slot: AdminKeySlot): Promise<string | null> {
  return SecureStore.getItemAsync(ADMIN_KEYS[slot], adminKeyOptions(prompt));
}

/**
 * This phone's own key to My Pond, kept only when the member chooses to, and readable only after the
 * phone's check: Face ID or a fingerprint on iOS, a fingerprint or the screen lock on Android. A new
 * face or finger invalidates it. Web cannot hold it at all.
 */
export const AdminKeyKeychain = {
  available(): boolean {
    if (isWeb) return false;
    const native = keyguard();
    try {
      return native ? native.available() === true : SecureStore.canUseBiometricAuthentication() === true;
    } catch {
      return false;
    }
  },

  async save(key: string, prompt: string, slot: AdminKeySlot): Promise<void> {
    if (isWeb) throw new Error('A browser cannot keep the admin key');
    const native = keyguard();
    if (native) {
      await native.save(slot, key, prompt);
      // The fingerprint-only copy, if one was kept before, would only ever be read in its place.
      await SecureStore.deleteItemAsync(ADMIN_KEYS[slot], adminKeyOptions()).catch(() => undefined);
      return;
    }
    // Updating a kept item asks for biometrics on iOS; a fresh one is written without asking.
    await SecureStore.deleteItemAsync(ADMIN_KEYS[slot], adminKeyOptions()).catch(() => undefined);
    await SecureStore.setItemAsync(ADMIN_KEYS[slot], key, adminKeyOptions(prompt));
  },

  /**
   * Asks for the phone's check. Null when nothing is kept or the system invalidated it; throws on a
   * refusal. On Android a key kept the old way is opened with a fingerprint once and moved to the
   * store that also takes the screen lock, which asks once more; if that second check is declined,
   * the old copy stays and opens as before.
   */
  async read(prompt: string, slot: AdminKeySlot): Promise<string | null> {
    if (isWeb) return null;
    const native = keyguard();
    if (!native) return readLegacy(prompt, slot);
    if (native.has(slot)) return native.read(slot, prompt);
    const key = await readLegacy(prompt, slot);
    if (key !== null) {
      await AdminKeyKeychain.save(key, prompt, slot).catch((e: unknown) => {
        console.warn('[secure-storage] the admin key stays in its fingerprint-only store', e);
      });
    }
    return key;
  },

  async forget(slot: AdminKeySlot): Promise<void> {
    if (isWeb) return;
    await keyguard()?.forget(slot);
    await SecureStore.deleteItemAsync(ADMIN_KEYS[slot], adminKeyOptions());
  },
};

export const SecureStorage = {
  async get(key: SecureKey): Promise<string | null> {
    if (isWeb) {
      warnOnceOnWeb();
      return ephemeral.get(KEYS[key]) ?? null;
    }
    if (lockedReadable(key)) {
      // Not moved yet: the copy written before this setting existed.
      return (await SecureStore.getItemAsync(KEYS[key], LOCKED_READ_OPTIONS)) ?? SecureStore.getItemAsync(KEYS[key]);
    }
    return SecureStore.getItemAsync(KEYS[key]);
  },

  async set(key: SecureKey, value: string): Promise<void> {
    if (isWeb) {
      warnOnceOnWeb();
      ephemeral.set(KEYS[key], value);
      return;
    }
    if (lockedReadable(key)) {
      await SecureStore.setItemAsync(KEYS[key], value, LOCKED_READ_OPTIONS);
      // Only now that the new copy is saved; a stale one left here would never be read again anyway.
      await SecureStore.deleteItemAsync(KEYS[key]).catch(() => undefined);
      return;
    }
    return SecureStore.setItemAsync(KEYS[key], value);
  },

  async remove(key: SecureKey): Promise<void> {
    if (isWeb) {
      ephemeral.delete(KEYS[key]);
      return;
    }
    if (lockedReadable(key)) await SecureStore.deleteItemAsync(KEYS[key], LOCKED_READ_OPTIONS);
    return SecureStore.deleteItemAsync(KEYS[key]);
  },
};
