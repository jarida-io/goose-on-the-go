/** Remote access is contacted only after explicit user opt-in and local pairing. */
import { AppState, NativeModules } from 'react-native';
import { ApiError, api } from './api-client';
import { isLocalPairingUrl, normalizeHttpsUrl } from '@/models/connection';
import i18n from './i18n';
import { insecureDevMode } from './dev-mode';

/** Setup cannot proceed until the operator configures remote infrastructure. */
/**
 * The pond will not replace this device's enrollment.
 *
 * Raised only from the recovery request, where a 409 means something specific:
 * the coordinator still calls this device active, so superseding it would be a
 * way to take over a live enrollment rather than repair a broken one. Revoking
 * the old enrollment first is what makes it replaceable, and signing out is
 * what queues that.
 *
 * Distinct from the 409 that enrollment raises, which means the opposite --
 * already enrolled, use recovery. Sharing one message between them told the
 * user to press the button they had just pressed.
 */
export class RemoteReplacementUnavailableError extends Error {
  constructor() {
    super(i18n.t('remote.replacementBlocked'));
    this.name = 'RemoteReplacementUnavailableError';
  }
}

export class RemoteInfrastructureUnavailableError extends Error {
  constructor() { super(i18n.t('remote.unconfigured')); this.name = 'RemoteInfrastructureUnavailableError'; }
}

/**
 * `background` is set by Android's `PondNetwork.status()` while the platform refuses the
 * foreground service that keeps the node's network access in the background.
 */
type NativeStatus = { state: string; authUrl?: string; nodeKey?: string; machineKey?: string; addresses: string[]; background?: 'unavailable' };
let generation = 0;
let busy = false;
let pendingRecovery: { endpoint: string; id: string } | null = null;
/** The node `restoreRemoteAccess` last started, so a pause knows what to start again. */
let restored: { profileId: string; control: string } | null = null;
/** Whether the node is stopped because the app left the foreground. Any restore clears it. */
let paused = false;
async function cancelPendingRecovery(): Promise<void> {
  const pending = pendingRecovery; pendingRecovery = null;
  if (pending) await api.requestLocal(pending.endpoint, `/api/v1/remote-access/recovery/${pending.id}`, { method: 'DELETE' })
    .catch(() => console.warn('[remote] recovery cancellation could not reach Pond; approval will expire'));
}
export type RemoteProgress = 'approval' | 'review' | 'enrolling' | 'connecting' | 'enabled';
const native = () => {
  if (!NativeModules.PondTls?.beginRemote) throw new Error(i18n.t('remote.unsupported'));
  return NativeModules.PondTls;
};
function status(raw: string): NativeStatus {
  const value = JSON.parse(raw) as NativeStatus;
  if (typeof value.state !== 'string' || !Array.isArray(value.addresses)) {
    console.warn('[remote] native status was not the expected shape:', raw.slice(0, 200));
    throw new Error(i18n.t('remote.failed'));
  }
  return value;
}
export async function cancelRemoteAccess(): Promise<void> {
  generation++;
  if (!busy) return;
  await cancelPendingRecovery();
  await native().cancelRemote();
}
export async function disableRemoteAccess(): Promise<void> {
  generation++;
  // Turned off, it is no node to start again for a wake-up.
  restored = null;
  paused = false;
  await cancelPendingRecovery();
  await native().disableRemote();
}
/**
 * `mkey:` and the first sixteen hex digits of a machine key, grouped in fours: what the
 * Pond's review shows beside a recovery request, so the two screens can be compared.
 */
export function machineKeyPreview(machineKey: string): string {
  const hex = machineKey.replace(/^mkey:/, '').slice(0, 16);
  return `mkey:${hex.match(/.{1,4}/g)?.join(' ') ?? ''}`;
}

/**
 * Whether the Pond refused an enrollment because the record it holds for this phone is
 * revoked (or failed) under the very machine key the phone just sent.
 *
 * That is a lapse: the Pond revokes a phone not seen on the home network for 30 days,
 * and the coordinator keeps the revoked machine key as a tombstone it will never enrol
 * again. Every other 409 from enrollment means something else and is left to the caller.
 */
function isStaleIdentity(cause: unknown): boolean {
  return cause instanceof ApiError && cause.status === 409 && cause.detail === 'stale_identity';
}

/**
 * Enrol this phone's embedded node with the paired Pond's coordinator, from the home
 * network, and commit the tailnet endpoint the Pond reports once the node is running.
 *
 * A Pond that answers the enrollment with `stale_identity` revoked this node's identity
 * when its remote access lapsed. The node's directory is then erased through the native
 * `resetIdentity`, a node with fresh keys is started, and the enrollment is submitted
 * once more under the new machine key. A second `stale_identity` is reported, never
 * retried.
 */
export async function enableRemoteAccess(profileId: string, localUrl: string, progress: (value: RemoteProgress) => void,
  commit: (endpoint: string, control: string, current: () => void) => Promise<void>,
  /** `keyPreview` is what the Pond's review should show for this request. */
  recovery?: { onReview: (id: string, keyPreview: string) => void; pin?: string },
  /** When this device's remote access lapses if it does not come home. */
  onLapse?: (lapsesAt: string | null) => void): Promise<void> {
  // Remote access enrolls over the Pond's HTTPS listener and runs on pinned TLS; a
  // plaintext development bundle has neither, so it is unavailable rather than half-working.
  if (insecureDevMode) throw new Error(i18n.t('remote.unsupported'));
  if (busy) throw new Error(i18n.t('remote.busy'));
  if (!isLocalPairingUrl(localUrl)) throw new Error(i18n.t('pairing.lan'));
  const current = ++generation;
  busy = true;
  const check = () => {
    if (current !== generation || AppState.currentState !== 'active') throw new Error(i18n.t('remote.cancelled'));
  };
  let committed = false;
  try {
    check();
    const config = await api.requestLocal<{ enabled: boolean; controlUrl: string; lapsesAt?: string | null }>(localUrl, '/api/v1/remote-access/configuration');
    onLapse?.(config.lapsesAt ?? null);
    check();
    if (!config.controlUrl?.trim()) throw new RemoteInfrastructureUnavailableError();
    if (!config.enabled) { progress('approval'); throw new Error(i18n.t('remote.approval')); }
    const control = normalizeHttpsUrl(config.controlUrl);
    progress('enrolling');
    let state = status(await native().beginRemote(profileId, control));
    check();
    let submitted = false;
    let identityReset = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      check();
      if (state.state === 'Running') {
        progress('connecting');
        const info = await api.requestLocal<{ tailnet_address?: string; https_port?: number }>(localUrl, '/api/v1/system/info');
        check();
        const ip = info.tailnet_address?.split('.').map(Number);
        if (!ip || ip.length !== 4 || ip.some((n) => !Number.isInteger(n) || n < 0 || n > 255) || ip[0] !== 100 || ip[1] < 64 || ip[1] > 127 || !Number.isInteger(info.https_port) || info.https_port! < 1 || info.https_port! > 65535) {
          // Names both values: an IPv6-only tailnet address, or a missing port,
          // are indistinguishable from a malformed one in the message shown.
          console.warn('[remote] Pond reported an unusable tailnet endpoint:', JSON.stringify({ tailnet_address: info.tailnet_address, https_port: info.https_port }));
          throw new Error(i18n.t('remote.failed'));
        }
        // This address came from an authenticated request to the pinned local Pond.
        const endpoint = normalizeHttpsUrl(`https://${info.tailnet_address}:${info.https_port}`);
        check(); await commit(endpoint, control, check); committed = true;
        progress('enabled'); return;
      }
      if (state.authUrl && !submitted) {
        if (new URL(state.authUrl).origin !== control) {
          console.warn('[remote] node offered an authUrl for a different coordinator:', new URL(state.authUrl).origin, 'expected', control);
          throw new Error(i18n.t('remote.failed'));
        }
        submitted = true;
        // Never automatically replay this enrollment write after an ambiguous failure.
        const body = JSON.stringify({ authUrl: state.authUrl, nodeKey: state.nodeKey ?? '', machineKey: state.machineKey ?? '' });
        if (recovery) {
          const recoveryHeaders = recovery.pin ? { 'X-Recovery-Pin': recovery.pin } : undefined;
          const request = await api
            .requestLocal<{ id: string; approved?: boolean }>(localUrl, '/api/v1/remote-access/recovery', { method: 'POST', body, headers: recoveryHeaders })
            .catch((cause) => {
              if (cause instanceof ApiError && cause.status === 409) {
                throw new RemoteReplacementUnavailableError();
              }
              throw cause;
            });
          if (!/^[a-f0-9-]{36}$/.test(request.id)) throw new Error(i18n.t('remote.failed'));
          pendingRecovery = { endpoint: localUrl, id: request.id };
          let approved = request.approved === true;
          if (!approved) {
            check(); recovery.onReview(request.id, machineKeyPreview(state.machineKey ?? '')); progress('review');
            for (let reviewAttempt = 0; reviewAttempt < 24; reviewAttempt++) {
              check();
              const review = await api.requestLocal<{ approved: boolean }>(localUrl, `/api/v1/remote-access/recovery/${request.id}`);
              check();
              if (review.approved === true) { approved = true; break; }
              await new Promise<void>((resolve) => setTimeout(resolve, 5000));
            }
          }
          if (!approved) throw new Error(i18n.t('remote.reviewExpired'));
          check(); progress('enrolling');
          // Only the current, still-authenticated LAN phone can consume approval.
          await api.requestLocal(localUrl, `/api/v1/remote-access/recovery/${request.id}`, { method: 'POST' });
          pendingRecovery = null;
        } else {
          try {
            await api.requestLocal(localUrl, '/api/v1/remote-access/enrollment', { method: 'POST', body });
          } catch (cause) {
            if (!isStaleIdentity(cause)) throw cause;
            if (identityReset) {
              console.warn('[remote] Pond refused the fresh node identity as stale too; not enrolling again');
              throw new Error(i18n.t('remote.identityStale'));
            }
            // A refusal, not an ambiguous failure: nothing was enrolled, and the next write
            // carries a different machine key, so this is not a replay of the one above.
            console.warn('[remote] Pond holds this node identity as revoked; replacing it with fresh keys');
            identityReset = true;
            check(); await native().resetIdentity();
            check(); state = status(await native().beginRemote(profileId, control));
            submitted = false;
            // The fresh node is a new enrollment, so it gets the whole window.
            attempt = -1;
            continue;
          }
        }
        check();
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      check(); state = status(await native().remoteStatus());
    }
    console.warn('[remote] node did not reach Running within the enrollment window; last state:', state.state);
    throw new Error(i18n.t('remote.failed'));
  } finally {
    await cancelPendingRecovery();
    busy = false;
    if (!committed) await native().cancelRemote().catch(() => console.warn('[remote] transport restoration failed'));
  }
}

/**
 * Bring the embedded node back if it did not survive the app being backgrounded.
 *
 * The node runs inside the app process, and nothing holds that process up: there is no
 * foreground service on Android and no background mode on iOS. So returning to the
 * foreground is the first moment the app can discover the node is gone.
 *
 * Nothing used to ask. `AppState` reaches `ConnectionManager.environment`, which re-probes
 * HTTP endpoints, and probing cannot tell a dead node from an unreachable Pond -- it simply
 * retries a tailnet address that no longer routes, for as long as the user is prepared to
 * wait. `restoreRemoteAccess` was called only at mount and at sign-out.
 *
 * Returns whether the transport was restarted, so the caller can re-probe immediately
 * rather than wait for the next scheduled attempt. A resume onto a healthy node costs one
 * bridge call.
 */
export async function resumeRemoteAccess(profileId: string, control: string): Promise<boolean> {
  // Local-only profiles have no node, and an enrollment in flight is already driving the
  // transport and must not have it pulled from under it.
  if (!control || busy) return false;
  const bridge = NativeModules.PondTls;
  if (!bridge?.remoteStatus || !bridge.activateRemote) return false;
  let running = false;
  try {
    running = status(await bridge.remoteStatus()).state === 'Running';
  } catch {
    // An unreadable status is not evidence of health, and the costs are asymmetric: a
    // needless restart is a moment, a missed one is no remote access until the next launch.
    console.warn('[remote] node status unreadable on resume; restarting transport');
  }
  if (running) return false;
  await restoreRemoteAccess(profileId, control);
  return true;
}

/**
 * Whether remote access will pause once the app is in the background, because Android
 * refused the foreground service that holds the node's network access.
 *
 * The node itself is unaffected, so remote access still works while the app is open. Only
 * Android reports this; elsewhere, or with no readable status, the answer is false, since
 * nothing is known to be wrong. Reading the status also retries the service, so a check made
 * as the app returns to the foreground is the one most likely to clear it.
 */
export async function remoteBackgroundPaused(): Promise<boolean> {
  const bridge = NativeModules.PondTls;
  if (!bridge?.remoteStatus) return false;
  try {
    const paused = status(await bridge.remoteStatus()).background === 'unavailable';
    if (paused) console.warn('[remote] Android refused the background service; remote access pauses while the app is in the background');
    return paused;
  } catch {
    console.warn('[remote] node status unreadable; cannot tell whether background access is held');
    return false;
  }
}

/** How long a probe of the tailnet address waits for this phone's own node to come up. */
const NODE_START_BUDGET_MS = 10_000;

/**
 * Resolves once this phone's tailnet node is running, or with false when it is not within the
 * budget or `abandoned()` says the answer is no longer wanted.
 *
 * On a cold start the node takes seconds to come up, and until it does a request to the tailnet
 * address fails at once. Probing straight away therefore reported "Pond unavailable" for twelve
 * seconds on the A57 on 2026-10-05, and the backoff it set off delayed the connection further
 * after the node was ready. An unreadable status is treated as "not yet", never as running.
 */
export async function remoteNodeRunning(abandoned: () => boolean): Promise<boolean> {
  const bridge = NativeModules.PondTls;
  // No node to wait for on this platform or build: the probe itself decides.
  if (!bridge?.remoteStatus) return true;
  const deadline = Date.now() + NODE_START_BUDGET_MS;
  while (!abandoned()) {
    try {
      if (status(await bridge.remoteStatus()).state === 'Running') return true;
    } catch {
      // Not readable yet; keep waiting until the deadline.
    }
    if (Date.now() >= deadline) {
      console.warn('[remote] the tailnet node did not start within', NODE_START_BUDGET_MS, 'ms');
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

/** Restore transport before trust, credentials, health checks, or notification streams. */
export async function restoreRemoteAccess(profileId: string, control: string): Promise<void> {
  generation++;
  paused = false;
  await cancelPendingRecovery();
  if (!NativeModules.PondTls?.activateRemote) {
    if (control) throw new Error(i18n.t('remote.unsupported'));
    return;
  }
  await NativeModules.PondTls.activateRemote(profileId, control);
  restored = control ? { profileId, control } : null;
}

/**
 * Stop this phone's node while the app is in the background. On Android the node runs under a
 * foreground service of its own, and held all day it kept the radio and processor awake whether or
 * not anything was asked of the Pond. The pairing and the node's identity stay: `resumeRemoteAccess`
 * starts it again when the app returns, and `resumePausedRemoteAccess` for a push wake-up.
 *
 * Not during an enrollment, which is driving the node itself, and not on a build whose bridge has
 * no pause: iOS suspends the whole app in the background, node included. Never throws.
 */
export async function pauseRemoteAccess(): Promise<boolean> {
  const bridge = NativeModules.PondTls;
  if (busy || paused || !restored || !bridge?.pauseRemote) return false;
  try {
    await bridge.pauseRemote();
    paused = true;
    return true;
  } catch {
    console.warn('[remote] node could not be paused for the background; it keeps running');
    return false;
  }
}

/**
 * Start a node paused for the background and wait until it runs, so a push wake-up can reach a Pond
 * away from home. Resolves false when nothing was paused or it did not start. Never throws.
 */
export async function resumePausedRemoteAccess(): Promise<boolean> {
  if (!paused || !restored) return false;
  try {
    await restoreRemoteAccess(restored.profileId, restored.control);
  } catch {
    console.warn('[remote] paused node could not be started for a wake-up; trying local addresses');
    return false;
  }
  return remoteNodeRunning(() => false);
}
