import { PondTrustError } from './pond-trust';
/** Shared, bounded endpoint selection for REST and foreground SSE. */
import type { ConnectionProfile, ConnectionState } from '@/models/connection';
import { normalizeHttpsUrl, isLocalPairingUrl } from '@/models/connection';

export interface ConnectionSnapshot { state: ConnectionState; url: string | null }
export interface ConnectionDependencies {
  probe: (url: string) => Promise<boolean>;
  discover: (host: string, port: number) => Promise<string | null>;
  trust: (urls: string[], pin: string) => Promise<void>;
  changed: (snapshot: ConnectionSnapshot) => void;
}
export class ConnectionManager {
  private profile: ConnectionProfile | null = null;
  private pin = '';
  private generation = 0;
  private active = true;
  private cellular = false;
  private flight: Promise<string | null> | null = null;
  private retryAfter = 0;
  private attempts = 0;
  private localRechecks = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  private snapshot: ConnectionSnapshot = { state: 'unpaired', url: null };
  constructor(private readonly deps: ConnectionDependencies) {}
  private publish(state: ConnectionState, url: string | null = null) {
    this.snapshot = { state, url };
    this.deps.changed(this.snapshot);
  }
  get current(): ConnectionSnapshot { return this.snapshot; }
  get savedProfile(): ConnectionProfile | null { return this.profile; }
  async configure(profile: ConnectionProfile | null, pin = '', upgrade = false): Promise<void> {
    this.clearTimer();
    this.generation++; this.flight = null; this.retryAfter = 0; this.attempts = 0; this.localRechecks = 0;
    this.profile = profile; this.pin = pin;
    this.publish(upgrade ? 'upgrade' : 'unpaired');
    await this.deps.trust(profile ? [...profile.localUrls, ...(profile.remoteUrl ? [profile.remoteUrl] : [])] : [], pin);
  }
  environment(cellular: boolean, active: boolean): void {
    this.cellular = cellular; this.active = active;
    this.clearTimer();
    this.generation++; this.flight = null; this.retryAfter = 0; this.attempts = 0; this.localRechecks = 0;
    if (!active) return;
    void this.recover();
  }
  recover = (quiet = false): Promise<string | null> => {
    if (!this.active || !this.profile) return Promise.resolve(null);
    if (this.flight) return this.flight;
    if (Date.now() < this.retryAfter) return Promise.resolve(null);
    this.clearTimer();
    let trustRejected = false;
    const generation = this.generation;
    const profile = this.profile;
    if (!quiet) this.publish('reconnecting');
    const current = () => generation === this.generation && this.active;
    const probe = async (url: string) => {
      try { return await this.deps.probe(url); }
      catch (error) { if (current() && error instanceof PondTrustError) trustRejected = true; return false; }
    };
    const work = async () => {
      try {
        const candidates = this.cellular ? [] : [...profile.localUrls];
        // Probe only configured endpoints, without a bearer header.
        for (const url of candidates) {
          if (!current()) return null;
          if (await probe(url)) {
            if (!current()) return null;
            this.clearTimer(); this.attempts = 0; this.localRechecks = 0; this.publish('local', url); return url;
          }
        }
        if (!this.cellular && current()) {
          const found = await this.deps.discover(profile.host, profile.port);
          if (!current()) return null;
          if (found && isLocalPairingUrl(found)) {
            const url = normalizeHttpsUrl(found);
            await this.deps.trust([...new Set([...profile.localUrls, url, ...(profile.remoteUrl ? [profile.remoteUrl] : [])])], this.pin);
            if (!current()) return null;
            if (await probe(url)) {
              if (!current()) return null;
              this.profile = { ...profile, localUrls: [...new Set([url, ...profile.localUrls])].slice(0, 8) };
              this.clearTimer(); this.attempts = 0; this.localRechecks = 0; this.publish('local', url); return url;
            }
          }
        }
        if (profile.remoteUrl && current() && await probe(profile.remoteUrl)) {
          if (!current()) return null;
          this.attempts = 0; this.publish('remote', profile.remoteUrl);
          // While on Wi-Fi, periodically reconsider LAN after a temporary local outage.
          // Stop after six unsuccessful passes; network/resume events reset this budget.
          if (!this.cellular && this.localRechecks++ < 6) {
            this.timer = setTimeout(() => { this.timer = null; if (current()) void this.recover(true); }, 30_000);
          }
          return profile.remoteUrl;
        }
      } catch {
        // Native TLS validation and discovery failures cannot change the saved pin.
      }
      if (current()) {
        this.retryAfter = Date.now() + Math.min(30_000, 1000 * 2 ** Math.min(this.attempts++, 5)) * (0.75 + Math.random() * 0.5);
        this.publish(trustRejected ? 'trust' : 'disconnected');
        if (this.attempts < 6) this.timer = setTimeout(() => { this.timer = null; if (current()) void this.recover(); }, Math.max(1, Math.ceil(this.retryAfter - Date.now())));
      }
      return null;
    };
    const flight = work().finally(() => { if (this.flight === flight) this.flight = null; });
    this.flight = flight;
    return flight;
  };
}
