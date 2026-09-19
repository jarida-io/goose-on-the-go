/** Native trust must be ready before any request containing a Pond credential. */
import { NativeModules, Platform } from 'react-native';
import i18n from './i18n';
import { normalizeHttpsUrl, validPin } from '@/models/connection';

export interface TrustEntry { url: string; pin: string }
let entries: TrustEntry[] = [];
let configuring: Promise<void> = Promise.resolve();

export function configurePondTrust(next: TrustEntry[]): Promise<void> {
  const normalized = next.map(({ url, pin }) => ({ url: normalizeHttpsUrl(url), pin }));
  if (normalized.some((e) => !validPin(e.pin))) return Promise.reject(new Error(i18n.t('connection.trust')));
  const apply = async () => {
    if (!['android', 'ios'].includes(Platform.OS) || !NativeModules.PondTls) {
      entries = [];
      if (next.length) throw new Error(i18n.t('connection.unsupported'));
      return;
    }
    await NativeModules.PondTls.configure(normalized);
    entries = normalized;
  };
  configuring = configuring.catch(() => undefined).then(apply);
  return configuring;
}

export async function assertPondTrust(url: string): Promise<void> {
  await configuring;
  const origin = normalizeHttpsUrl(url);
  if (!entries.some((e) => e.url === origin)) throw new Error(i18n.t('connection.trust'));
}

export class PondTrustError extends Error {
  constructor() { super(i18n.t('connection.trust')); this.name = 'PondTrustError'; }
}
export async function pondTrustFailed(url: string): Promise<boolean> {
  return !!await NativeModules.PondTls?.trustFailed?.(normalizeHttpsUrl(url));
}
