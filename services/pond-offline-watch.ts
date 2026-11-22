/**
 * Telling the household, with the app closed, that the Pond has gone offline and why.
 *
 * The connection strip says why the Pond cannot be reached (`services/pond-status.ts`), but only
 * on a screen somebody has open. A power cut or a dead home line overnight reached nobody: the
 * Pond cannot send a notice while it is down. So the OS runs this check in the background, no
 * more often than every 15 minutes (Android WorkManager, iOS BGTaskScheduler, through
 * expo-background-task; a phone saving battery runs it less often). It asks the remote-access
 * coordinator with the grant the Pond signed for this phone and, the first time it hears of an
 * outage, puts one notification in the shade. Each outage is told once, keyed by when the coordinator says it began.
 *
 * Nothing is said while the app is open: the strip says it there. Nothing is said after the Pond
 * returns either: the Pond's own `pond_lost_power` or `pond_lost_internet` notice says how long it
 * was out. A restart says nothing; it is over before the next check.
 *
 * Defined at module scope and imported from `index.ts`, like the push wake-up task, because the
 * OS starts the bundle with no screen to run it.
 */

import { AppState, Platform } from 'react-native';

import i18n from '@/services/i18n';
import { pondOfflineReason, type CoordinatorPondStatus, type PondOfflineReason } from '@/models/pond-status';
import { pondOfflineWords } from '@/view-models/connection-words';

import { presentLocally } from './local-notifications';
import { loadPairedProfile } from './paired-profile';
import { askCoordinator } from './pond-status';
import { Storage } from './storage';

export const OFFLINE_WATCH_TASK = 'giap-pond-offline-watch';
/** The shortest gap the OS is asked for between checks; it may wait longer. */
const EVERY_MINUTES = 15;

type TaskManagerModule = typeof import('expo-task-manager');
type BackgroundTaskModule = typeof import('expo-background-task');

/** A native module, or null in a build made before it was added: the watch is off, the app runs. */
function load<T>(name: 'expo-task-manager' | 'expo-background-task'): T | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (name === 'expo-task-manager' ? require('expo-task-manager') : require('expo-background-task')) as T;
  } catch {
    console.warn(`[offline-watch] ${name} is not in this build: the Pond offline watch is off until the app is rebuilt`);
    return null;
  }
}

const Tasks = load<TaskManagerModule>('expo-task-manager');
const Background = load<BackgroundTaskModule>('expo-background-task');

function supported(): boolean {
  return !!Tasks && !!Background && (Platform.OS === 'android' || Platform.OS === 'ios');
}

/** What to tell, once per outage: the key it is told under and the words. Null for nothing to tell. */
export function offlineNotice(status: CoordinatorPondStatus, now: number): { key: string; why: PondOfflineReason } | null {
  const why = pondOfflineReason(status, now);
  if (!why || why.kind === 'restarting') return null;
  // The coordinator's own time, not this phone's reading of it, which moves with clock drift.
  return { key: `${why.kind}:${status.since}`, why };
}

/** What one check did, for its log line and the task's result. */
export type WatchOutcome = 'app_open' | 'unpaired' | 'no_answer' | 'nothing_wrong' | 'already_told' | 'told' | 'not_shown';

/** One check. Never throws. */
export async function checkPondOffline(now: number = Date.now()): Promise<WatchOutcome> {
  if (AppState.currentState === 'active') return 'app_open';
  const { saved } = await loadPairedProfile();
  if (!saved) return 'unpaired';
  const status = await askCoordinator(saved.identity.pin, now);
  if (!status) return 'no_answer';
  const notice = offlineNotice(status, now);
  if (!notice) return 'nothing_wrong';
  if ((await Storage.get('pondOfflineTold').catch(() => null)) === notice.key) return 'already_told';
  const shown = await presentLocally({
    id: `pond-offline-${notice.key}`,
    target: 'local',
    category: 'alert',
    title: i18n.t('connection.why.notificationTitle'),
    body: pondOfflineWords(notice.why, now),
    timestamp: new Date(now).toISOString(),
    data: { kind: 'pond_offline' },
  });
  if (!shown) return 'not_shown';
  await Storage.set('pondOfflineTold', notice.key).catch(() => {
    console.warn('[offline-watch] could not remember the outage it told; it may be told again');
  });
  return 'told';
}

if (supported() && Tasks && Background) {
  const { Success, Failed } = Background.BackgroundTaskResult;
  Tasks.defineTask(OFFLINE_WATCH_TASK, async () => {
    try {
      const outcome = await checkPondOffline();
      console.info('[offline-watch] checked', { kind: 'pond_offline_watch', outcome });
      return outcome === 'not_shown' ? Failed : Success;
    } catch (e) {
      console.warn('[offline-watch] check failed', { kind: 'pond_offline_watch', error: String(e) });
      return Failed;
    }
  });
}

/**
 * Ask the OS to run the check, if it is not already asked. Call while the Pond answers and this
 * phone holds a status grant: without one there is nobody to ask. Never throws.
 */
export async function startPondOfflineWatch(): Promise<boolean> {
  if (!supported() || !Tasks || !Background) return false;
  try {
    if (await Tasks.isTaskRegisteredAsync(OFFLINE_WATCH_TASK)) return true;
    const status = await Background.getStatusAsync();
    if (status !== Background.BackgroundTaskStatus.Available) {
      console.warn('[offline-watch] the OS does not run background tasks for this app', { kind: 'pond_offline_watch', status });
      return false;
    }
    await Background.registerTaskAsync(OFFLINE_WATCH_TASK, { minimumInterval: EVERY_MINUTES });
    console.info('[offline-watch] started', { kind: 'pond_offline_watch', minutes: EVERY_MINUTES });
    return true;
  } catch (e) {
    console.warn('[offline-watch] could not start', { kind: 'pond_offline_watch', error: String(e) });
    return false;
  }
}
