// Whether My Pond is unlocked, shared by its first screen and every screen under it: any admin route that
// answers `admin_locked` returns the whole area to the lock, wherever it was asked from.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';

import { adminPasswordProblem, formatAdminPassword, normalizeAdminPassword, type AdminPasswordProblem } from '@/models/pond-admin';
import { useServer } from '@/providers/server-provider';
import { api } from '@/services/api-client';
import i18n from '@/services/i18n';
import { showSnackbar } from '@/services/snackbar';
import {
  canKeepAdminKey,
  forgetKeptAdminKey,
  isAdminKeyKeptFor,
  keepAdminKey,
  keptKeyIsLost,
  keptKeyWasCancelled,
  readKeptAdminKey,
} from '@/services/kept-admin-key';
import type { AdminStatus } from '@/services/types';
import { isMissingRoute } from './agents-source';
import { describeApiError, logFailure } from './describe-error';
import { adminRefusal, coolingSeconds, useAdminKeyPin, usePondAdminSource, type PondAdminSource } from './pond-admin-source';

export type AdminPhase =
  /** Nothing heard from the Pond yet. */
  | 'checking'
  | 'locked'
  | 'unlocked'
  /** No administrator card was ever made on this Pond. */
  | 'no_card'
  /** This phone is not a household member's, such as a guest's. */
  | 'members_only'
  /** A Pond built before My Pond. */
  | 'unsupported'
  /** The status could not be read and nothing was known before. */
  | 'unreachable';

export interface AdminGate {
  phase: AdminPhase;
  status: AdminStatus | null;
  /** When the Pond will hear the card again, by this phone's clock; null when it is not slowing guesses. */
  coolingUntil: number | null;
  /** Counts unlocks, so a screen that found itself locked reads again once it is open. */
  unlocks: number;
  /** A restart was asked for, which ends every unlock. Cleared by the next status the Pond answers. */
  restarting: boolean;
  /** This phone keeps its own key to this Pond, behind its biometrics; known without asking for them. */
  kept: boolean;
}

const INITIAL: AdminGate = { phase: 'checking', status: null, coolingUntil: null, unlocks: 0, restarting: false, kept: false };

/** The phases in which the admin routes are not worth asking. */
const CLOSED: readonly AdminPhase[] = ['locked', 'no_card', 'members_only', 'unsupported'];

export function isGateClosed(phase: AdminPhase): boolean {
  return CLOSED.includes(phase);
}

class GateStore {
  private state: AdminGate = INITIAL;
  private listeners = new Set<() => void>();
  /** Moves whenever this phone keeps a key, so a status asked before then cannot have it forgotten. */
  keyEpoch = 0;
  /** One biometric read at a time, however many screens under My Pond are showing the lock. */
  private readingKey = false;
  /** Locked by this phone's own Lock: the lock waits for a tap, or Face ID would open it again at once. */
  lockedByHand = false;

  get = () => this.state;

  /** This phone kept or forgot its key: a status asked before now must not overrule that. */
  keyChanged() {
    this.keyEpoch++;
  }

  /** Takes the one biometric read, or says no while another screen holds it. */
  claimKeyRead(): boolean {
    if (this.readingKey) return false;
    this.readingKey = true;
    return true;
  }

  releaseKeyRead() {
    this.readingKey = false;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  set(next: Partial<AdminGate>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((l) => l());
  }

  status(status: AdminStatus, now: number) {
    this.set({
      // A Pond with no card can still be open, unlocked by this phone's key.
      phase: status.unlocked ? 'unlocked' : status.card === 'missing' ? 'no_card' : 'locked',
      status,
      coolingUntil: status.retry_after ? now + status.retry_after * 1000 : null,
      restarting: false,
    });
  }

  /** This phone's own Lock: the lock then waits for a tap, or Face ID would open it again at once. */
  lockedHere() {
    this.lockedByHand = true;
    this.locked();
  }

  locked() {
    const status = this.state.status;
    this.set({ phase: 'locked', status: status ? { ...status, unlocked: false, expires_at: null } : null });
  }

  unlocked(expiresAt: string | null) {
    this.lockedByHand = false;
    const base: AdminStatus = this.state.status ?? {
      card: 'present',
      unlocked: true,
      expires_at: null,
      idle_minutes: 15,
      retry_after: null,
      key: false,
      keys: false,
    };
    this.set({
      phase: 'unlocked',
      status: { ...base, unlocked: true, expires_at: expiresAt, retry_after: null },
      coolingUntil: null,
      unlocks: this.state.unlocks + 1,
      restarting: false,
    });
  }

  /** An admin request was admitted, which renews the unlock on the Pond: the countdown starts again. */
  touched(now: number) {
    const status = this.state.status;
    if (this.state.phase !== 'unlocked' || !status) return;
    this.set({ status: { ...status, expires_at: new Date(now + status.idle_minutes * 60_000).toISOString() } });
  }
}

const stores = new Map<PondAdminSource, GateStore>();

function storeFor(source: PondAdminSource): GateStore {
  let store = stores.get(source);
  if (!store) {
    store = new GateStore();
    stores.set(source, store);
  }
  return store;
}

/** For tests: every gate starts unknown again. */
export function resetAdminGates(): void {
  stores.clear();
}

export interface UseAdminGate {
  gate: AdminGate;
  source: PondAdminSource;
  /** Reads `GET /admin/status`, which never renews the unlock. Resolves to whether the Pond answered. */
  readStatus: () => Promise<boolean>;
  /**
   * For a screen whose admin request failed: true when the failure moved the gate (locked, a guest's
   * phone, no card), so the screen shows the lock rather than an error of its own.
   */
  noteFailure: (e: unknown) => boolean;
  /** For a screen whose admin request succeeded, which renewed the unlock. */
  touch: () => void;
  /** This phone's Lock was taken; the lock then waits for a tap until the person leaves and comes back. */
  noteLocked: () => void;
  /** After asking the Pond to restart, which locks everyone. */
  noteRestart: () => void;
  /** Revokes this phone's key on the Pond as far as it can be reached, forgets it here, and locks. */
  forgetKept: () => Promise<void>;
}

export function useAdminGate(): UseAdminGate {
  const source = usePondAdminSource();
  const pin = useAdminKeyPin();
  const store = storeFor(source);
  const gate = useSyncExternalStore(store.subscribe, store.get, store.get);

  useEffect(() => {
    let live = true;
    const epoch = store.keyEpoch;
    void isAdminKeyKeptFor(pin).then((kept) => {
      if (live && epoch === store.keyEpoch) store.set({ kept });
    });
    return () => {
      live = false;
    };
  }, [pin, store]);

  const noteFailure = useCallback(
    (e: unknown) => {
      switch (adminRefusal(e)) {
        case 'admin_locked':
          store.locked();
          return true;
        case 'admin_members_only':
          store.set({ phase: 'members_only' });
          return true;
        case 'admin_card_missing':
          store.set({ phase: 'no_card' });
          return true;
        default:
          return false;
      }
    },
    [store],
  );

  const readStatus = useCallback(async () => {
    const epoch = store.keyEpoch;
    try {
      const status = await source.status();
      store.status(status, Date.now());
      // The Pond already revoked it: the card was rotated, or the phone removed or forgotten elsewhere.
      if (!status.key && (await isAdminKeyKeptFor(pin)) && epoch === store.keyEpoch) {
        await forgetKeptAdminKey(pin);
        store.set({ kept: false });
      }
      return true;
    } catch (e) {
      if (noteFailure(e)) return true;
      if (isMissingRoute(e)) store.set({ phase: 'unsupported' });
      else if (store.get().phase === 'checking') store.set({ phase: 'unreachable' });
      return false;
    }
  }, [noteFailure, pin, source, store]);

  const touch = useCallback(() => store.touched(Date.now()), [store]);
  const noteLocked = useCallback(() => store.lockedHere(), [store]);
  const noteRestart = useCallback(() => {
    store.locked();
    store.set({ restarting: true });
  }, [store]);

  const forgetKept = useCallback(async () => {
    store.keyChanged();
    // Revoking also locks this phone on the Pond; unreachable, it is at least asked to lock.
    await source.forgetKey().catch(() => source.lock().catch(() => undefined));
    await forgetKeptAdminKey(pin);
    store.set({ kept: false });
    store.locked();
  }, [pin, source, store]);

  return { gate, source, readStatus, noteFailure, touch, noteLocked, noteRestart, forgetKept };
}

/**
 * A screen under My Pond reads on each arrival and again after each unlock, and not while the area is
 * locked. The key changes with each unlock and is null while closed.
 */
export function useAdminLoad(load: () => Promise<void>, gate: AdminGate): void {
  const { hydrated } = useServer();
  const openKey = hydrated && !isGateClosed(gate.phase) ? gate.unlocks : null;
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useFocusEffect(
    useCallback(() => {
      if (openKey !== null) void loadRef.current();
    }, [openKey]),
  );
}

export interface UseAdminUnlock {
  /** What was typed, in the card's own groups: `XXXX-XXXX-XXXX-XXXX`. */
  password: string;
  /** Why the password cannot be sent yet; `empty` and `short` are not mistakes, only unfinished. */
  problem: AdminPasswordProblem | null;
  /** How many characters of the sixteen are in. */
  typed: number;
  unlocking: boolean;
  /** Seconds before the Pond hears the card again; zero when it is not cooling. */
  coolingSecs: number;
  /** Why the last unlock did not work, in words. */
  error: string | null;
  /** This phone keeps a key to this Pond, so My Pond can open with its Face ID or fingerprint. */
  kept: boolean;
  /** This phone can keep a key behind its biometrics, and this Pond keeps one for it; never on the web. */
  canKeep: boolean;
  /** This phone could keep a key, but its Pond keeps none yet: My Pond opens only with the card until it is updated. */
  keysAwaitPond: boolean;
  /** Keep a key after the card opens My Pond, so the next unlock needs only the phone's biometrics. */
  remember: boolean;
  setRemember: (on: boolean) => void;
  setPassword: (raw: string) => void;
  /** Resolves to whether My Pond is now unlocked. */
  unlock: () => Promise<boolean>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  /** Reads the kept key behind the phone's biometrics and opens with it. Resolves to whether it opened. */
  unlockWithKept: () => Promise<boolean>;
  forgetKept: () => Promise<void>;
}

/**
 * The lock's form, shared by My Pond and by any screen under it that finds itself locked. Arriving
 * locked with a kept key asks for the phone's biometrics once by itself, once per mount.
 */
export function useAdminUnlock(): UseAdminUnlock {
  const { gate, source, readStatus, noteFailure, touch, forgetKept } = useAdminGate();
  const pin = useAdminKeyPin();
  const store = storeFor(source);
  const [password, setPasswordState] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [remember, setRemember] = useState(true);
  const [biometrics] = useState(canKeepAdminKey);
  // Offered only once the Pond has said it keeps phone keys, or the switch would promise what it cannot do.
  const keys = gate.status?.keys;
  const canKeep = biometrics && pin !== null && keys === true;
  const keysAwaitPond = biometrics && pin !== null && keys === false;

  // A countdown on screen, not a poll: nothing is asked of the Pond while it runs.
  const until = gate.coolingUntil;
  useEffect(() => {
    if (until === null) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(() => {
      tick();
      if (Date.now() >= until) clearInterval(timer);
    }, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [until]);
  const coolingSecs = until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));

  const setPassword = useCallback((raw: string) => {
    setPasswordState(formatAdminPassword(raw));
    setError(null);
  }, []);

  const problem = adminPasswordProblem(password);

  /** Says why an unlock was refused, whether it was sent with the card or the kept key. */
  const explain = useCallback(
    (e: unknown) => {
      const code = adminRefusal(e);
      if (code === 'admin_cooling') {
        const wait = coolingSeconds(e);
        // The countdown says it; a sentence beside it would outlive the wait.
        store.set({ coolingUntil: Date.now() + (wait ?? 30) * 1000 });
      } else if (code === 'admin_password_rejected') {
        setError(i18n.t('myPond.lock.rejected'));
        // The Pond starts slowing guesses after a few; its status says when.
        void readStatus();
      } else if (code === 'admin_password_malformed') {
        setError(i18n.t('myPond.lock.malformed'));
      } else if (noteFailure(e)) {
        setError(null);
      } else if (isMissingRoute(e)) {
        store.set({ phase: 'unsupported' });
      } else {
        setError(describeApiError(e) ?? i18n.t('myPond.lock.failed'));
      }
    },
    [noteFailure, readStatus, store],
  );

  const forgetLocally = useCallback(async () => {
    await forgetKeptAdminKey(pin);
    store.set({ kept: false });
  }, [pin, store]);

  /** After the card opened My Pond. Nothing here can close it again: a refused save keeps nothing. */
  const keepKey = useCallback(
    async (keepFor: string) => {
      store.keyChanged();
      let key: string;
      try {
        key = await source.enroll();
      } catch (e) {
        // My Pond is open by now, so the lock's form is gone: the snackbar is where this can be said.
        logFailure('admin', 'enrolling a phone key failed', e);
        showSnackbar({ message: i18n.t(isMissingRoute(e) ? 'myPond.key.awaitsPond' : 'myPond.key.notKept') });
        return;
      }
      touch();
      try {
        await keepAdminKey(keepFor, key, i18n.t('myPond.key.savePrompt'));
        store.set({ kept: true });
        showSnackbar({ message: i18n.t('myPond.key.kept'), tone: 'success' });
      } catch (e) {
        // Enrolling replaced any older key on the Pond, so whatever was kept before no longer opens. The new
        // one is left there with no copy anywhere: it opens nothing, and revoking it would lock this phone too.
        await forgetLocally();
        if (!keptKeyWasCancelled(e)) {
          logFailure('admin', 'keeping the phone key failed', e);
          showSnackbar({ message: i18n.t('myPond.key.notKept') });
        }
      } finally {
        store.keyChanged();
      }
    },
    [forgetLocally, source, store, touch],
  );

  const unlock = useCallback(async () => {
    if (unlocking || adminPasswordProblem(password) !== null || coolingSecs > 0) return false;
    setUnlocking(true);
    setError(null);
    try {
      const answer = await source.unlock(normalizeAdminPassword(password));
      store.unlocked(answer.expires_at);
      setPasswordState('');
      if (remember && canKeep && pin) await keepKey(pin);
      return true;
    } catch (e) {
      explain(e);
      return false;
    } finally {
      setUnlocking(false);
    }
  }, [canKeep, coolingSecs, explain, keepKey, password, pin, remember, source, store, unlocking]);

  const unlockWithPin = useCallback(
    async (enteredPin: string) => {
      if (unlocking || !enteredPin.trim() || coolingSecs > 0) return false;
      setUnlocking(true);
      setError(null);
      try {
        const answer = await api.adminUnlockWithPin(enteredPin.trim());
        store.unlocked(answer.expires_at);
        if (remember && canKeep && pin) await keepKey(pin);
        return true;
      } catch (e) {
        explain(e);
        return false;
      } finally {
        setUnlocking(false);
      }
    },
    [canKeep, coolingSecs, explain, keepKey, pin, remember, store, unlocking],
  );

  const unlockWithKept = useCallback(async () => {
    if (!pin || unlocking || coolingSecs > 0 || !store.claimKeyRead()) return false;
    setUnlocking(true);
    setError(null);
    try {
      let key: string | null;
      try {
        key = await readKeptAdminKey(pin, i18n.t('myPond.key.prompt'));
      } catch (e) {
        if (keptKeyIsLost(e)) {
          await forgetLocally();
          setError(i18n.t('myPond.key.lost'));
        } else if (!keptKeyWasCancelled(e)) {
          setError(i18n.t('myPond.key.unreadable'));
        }
        return false;
      }
      if (key === null) {
        store.set({ kept: false });
        return false;
      }
      const answer = await source.unlockWithKey(key);
      store.unlocked(answer.expires_at);
      return true;
    } catch (e) {
      if (adminRefusal(e) === 'admin_key_rejected') {
        await forgetLocally();
        setError(i18n.t('myPond.key.rejected'));
        // A wrong key counts toward the Pond's slowing, as a wrong card does.
        void readStatus();
      } else {
        explain(e);
      }
      return false;
    } finally {
      store.releaseKeyRead();
      setUnlocking(false);
    }
  }, [coolingSecs, explain, forgetLocally, pin, readStatus, source, store, unlocking]);

  // Once per mount, so a refusal or a cancel leaves the lock on screen rather than asking again.
  const asked = useRef(false);
  const askRef = useRef(unlockWithKept);
  useEffect(() => {
    askRef.current = unlockWithKept;
  });
  const arrivedLocked = (gate.phase === 'locked' || gate.phase === 'no_card') && !gate.restarting;
  const cooling = coolingSecs > 0;
  useFocusEffect(
    useCallback(() => {
      if (asked.current || !gate.kept || !arrivedLocked || store.lockedByHand) return;
      asked.current = true;
      if (!cooling) void askRef.current();
    }, [arrivedLocked, cooling, gate.kept, store]),
  );
  // Leaving unmounts the lock, so the next arrival asks again. Not a focus cleanup: that also runs whenever
  // the navigation object changes, as it does when locking takes Lock out of the header.
  useEffect(
    () => () => {
      store.lockedByHand = false;
    },
    [store],
  );

  return {
    password,
    problem,
    typed: normalizeAdminPassword(password).length,
    unlocking,
    coolingSecs,
    error,
    kept: gate.kept,
    canKeep,
    keysAwaitPond,
    remember,
    setRemember,
    setPassword,
    unlock,
    unlockWithPin,
    unlockWithKept,
    forgetKept,
  };
}
