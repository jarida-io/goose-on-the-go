import { assertPondTrust, pondTrustFailed } from './pond-trust';
import { normalizeHttpsUrl } from '@/models/connection';
/**
 * PondApiClient — HTTP client for goose-in-a-pond.
 *
 * Implements the GIAP ↔ GOTG handshake protocol:
 *   1. handshakeInit  — POST /api/v1/handshake/init     → challenge
 *   2. pair           — runs init + verify with a 6-digit code
 *   3. handshakeRefresh                                 → fresh tokens
 *
 * The active session token is automatically attached to every request as
 * `Authorization: Bearer <token>`. On 401, the client tries one refresh
 * before bubbling the error up to the caller.
 */

import { concat, fromBase64, hmacSha256, toHex, utf8 } from './hmac';
import { timeoutSignal } from './http';
import type {
  ActivityResponse,
  ActivitySummary,
  CommissionDeviceRequest,
  CommissionDeviceResponse,
  CreateDeviceRequest,
  Device,
  DeviceStatePatch,
  EventCategory,
  Extension,
  LogEntry,
  MarketplaceExtension,
  MatterStatus,
  MemoryFragment,
  ModelActiveRoles,
  ModelCapabilities,
  ModelEntry,
  ModelMemoryStatus,
  OAuthProvider,
  Profile,
  Schedule,
  ScheduleRun,
  SessionMessage,
  SessionSummary,
  ToolCallResult,
  UpdateDeviceRequest,
  UsageSummary,
} from './types';

/**
 * A non-2xx response, carrying the pieces a caller needs to react properly —
 * chiefly the status and, on a 429, how long the server asked us to wait.
 * Without `retryAfterSecs` a caller can only guess, and guessing badly is how
 * a client ends up hammering an endpoint it has already been throttled on.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly retryAfterSecs: number | null;

  constructor(message: string, status: number, retryAfterSecs: number | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfterSecs = retryAfterSecs;
  }

  /** True when retrying later could plausibly succeed. */
  get isRetryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

/** Parse a `Retry-After` header. Only the delta-seconds form is used here. */
function parseRetryAfter(res: Response): number | null {
  const raw = res.headers.get('Retry-After');
  if (!raw) return null;
  const secs = Number(raw.trim());
  return Number.isFinite(secs) && secs >= 0 ? secs : null;
}

export interface HandshakeResponse {
  accepted: boolean;
  session_token: string | null;
  refresh_token?: string | null;
  expires_at?: string | null;
  hostname: string;
  server_version: string;
  capabilities: string[];
  rejection_reason: string | null;
}

interface ChallengeResponse {
  challenge_id: string;
  challenge: string; // base64
  expires_at: string;
}

/** How long to wait for /health before calling the Pond unreachable. */
const HEALTH_TIMEOUT_MS = 3_000;

/** Default ceiling for an ordinary request. A Pond on the LAN is close by. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Matter commissioning gets its own, far longer budget: the server allows itself
 * 180s for the radio work, so anything shorter here would abandon a commission
 * that was still going to succeed.
 */
const COMMISSION_TIMEOUT_MS = 190_000;

/**
 * Read a response body, tolerating the ones that have none.
 *
 * DELETE and the action routes answer 204, and `res.json()` throws on an empty
 * body — which would have turned every successful delete into an error the
 * caller had to special-case.
 */
async function parseBody<T>(res: Response): Promise<T | undefined> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (text.length === 0) return undefined;
  return JSON.parse(text) as T;
}


export class PondApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private refreshToken: string | null = null;
  /** Called after a refresh succeeds so the caller can re-persist the pair. */
  private onTokensRotated: ((session: string, refresh: string) => void) | null = null;
  /** The refresh every concurrent 401 waits on, rather than each starting its own. */
  private refreshInFlight: Promise<HandshakeResponse | null> | null = null;

  private recovery: (() => Promise<string | null>) | null = null;
  private identityEpoch = 0;
  setRecovery(recover: (() => Promise<string | null>) | null) { this.recovery = recover; }
  invalidateIdentity() { this.identityEpoch++; this.token = null; this.refreshToken = null; }

  constructor(baseUrl = 'https://127.0.0.1:4443') {
    this.baseUrl = normalizeHttpsUrl(baseUrl);
  }

  setBaseUrl(url: string) {
    this.baseUrl = normalizeHttpsUrl(url);
  }

  setToken(token: string | null) {
    this.token = token;
  }

  setRefreshToken(token: string | null) {
    this.refreshToken = token;
  }

  setOnTokensRotated(cb: ((session: string, refresh: string) => void) | null) {
    this.onTokensRotated = cb;
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    const epoch = this.identityEpoch;
    await assertPondTrust(new URL(url).origin);
    if (epoch !== this.identityEpoch) throw new Error('Pond profile changed');
    const headers = new Headers(init.headers);
    headers.set('X-Pond-Transport', '1');
    const response = await fetch(url, { ...init, headers, redirect: 'error',
      signal: init.signal ?? timeoutSignal(REQUEST_TIMEOUT_MS) });
    if (epoch !== this.identityEpoch) throw new Error('Pond profile changed');
    if (response.status >= 300 && response.status < 400) throw new Error('Pond redirect rejected');
    return response;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  /**
   * Probe the server's unauthenticated /health route.
   *
   * Never throws: an unreachable Pond is an expected state here, not an error,
   * so callers get `ok: false` rather than a rejection to handle.
   */
  async health(): Promise<{ ok: boolean; latencyMs: number; trustFailure?: boolean }> {
    const start = Date.now();
    try {
      const res = await this.send(`${this.baseUrl}/api/v1/health`, {
        headers: {},
        signal: timeoutSignal(HEALTH_TIMEOUT_MS),
      });
      return { ok: res.ok, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start, trustFailure: await pondTrustFailed(this.baseUrl).catch(() => true) };
    }
  }

  /** Phase 1: ask the server for a fresh challenge. */
  async handshakeInit(input: {
    clientId: string;
    clientType?: string;
    clientVersion?: string;
  }): Promise<ChallengeResponse> {
    const res = await this.send(`${this.baseUrl}/api/v1/handshake/init`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        client_id: input.clientId,
        client_type: input.clientType ?? 'gotg',
        client_version: input.clientVersion ?? '1.0.0',
      }),
    });
    if (!res.ok) {
      throw new ApiError(
        `handshake/init failed: ${res.status}`,
        res.status,
        parseRetryAfter(res),
      );
    }
    return (await res.json()) as ChallengeResponse;
  }

  /** Phase 2: prove possession of the pairing code. */
  async handshakeVerify(input: {
    challengeId: string;
    mac: string;
    deviceName?: string;
  }): Promise<HandshakeResponse> {
    const res = await this.send(`${this.baseUrl}/api/v1/handshake/verify`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        challenge_id: input.challengeId,
        mac: input.mac,
        device_name: input.deviceName ?? null,
      }),
    });
    if (!res.ok) {
      throw new ApiError(
        `handshake/verify failed: ${res.status}`,
        res.status,
        parseRetryAfter(res),
      );
    }
    return (await res.json()) as HandshakeResponse;
  }

  /**
   * Run the full two-phase pairing. On success the session+refresh tokens
   * are stored on this client (use {@link setOnTokensRotated} to persist).
   */
  async pair(input: {
    clientId: string;
    pairingCode: string;
    deviceName?: string;
  }): Promise<HandshakeResponse> {
    const epoch = this.identityEpoch;
    const init = await this.handshakeInit({ clientId: input.clientId });
    const challenge = fromBase64(init.challenge);
    const message = concat(challenge, utf8(input.clientId));
    const mac = toHex(hmacSha256(utf8(input.pairingCode), message));
    const resp = await this.handshakeVerify({
      challengeId: init.challenge_id,
      mac,
      deviceName: input.deviceName,
    });
    if (epoch !== this.identityEpoch) throw new Error('Pond profile changed');
    if (resp.accepted && resp.session_token) {
      this.token = resp.session_token;
      this.refreshToken = resp.refresh_token ?? null;
      if (resp.refresh_token && this.onTokensRotated) {
        this.onTokensRotated(resp.session_token, resp.refresh_token);
      }
    }
    return resp;
  }

  /** Exchange the stored refresh token for a fresh pair. */
  async handshakeRefresh(): Promise<HandshakeResponse | null> {
    if (!this.refreshToken) return null;
    const epoch = this.identityEpoch;
    const res = await this.send(`${this.baseUrl}/api/v1/handshake/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: this.refreshToken }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as HandshakeResponse;
    if (epoch !== this.identityEpoch) throw new Error('Pond profile changed');
    if (body.accepted && body.session_token) {
      this.token = body.session_token;
      this.refreshToken = body.refresh_token ?? null;
      if (body.refresh_token && this.onTokensRotated) {
        this.onTokensRotated(body.session_token, body.refresh_token);
      }
    }
    return body;
  }

  /** Revoke the current session token on the server. */
  async handshakeRevoke(): Promise<void> {
    if (!this.token) return;
    await this.send(`${this.baseUrl}/api/v1/handshake/revoke`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ token: this.token }),
    });
    this.token = null;
    this.refreshToken = null;
  }

  /**
   * Wrapper around `fetch` that attaches the bearer token and transparently
   * refreshes once on 401. Returns the parsed JSON body.
   *
   * Concurrent 401s share one refresh. Without that, a screen firing several
   * requests at once on a stale token would send a refresh per request, and
   * every one but the first would present an already-rotated refresh token —
   * turning one recoverable expiry into a forced re-pair.
   */
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!path.startsWith('/api/') || path.startsWith('//')) throw new Error('Invalid Pond API path');
    const epoch = this.identityEpoch;
    const doFetch = () =>
      this.send(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...this.headers(), ...(init.headers ?? {}) },
        signal: init.signal ?? timeoutSignal(REQUEST_TIMEOUT_MS),
      });

    let res: Response;
    try { res = await doFetch(); }
    catch (error) {
      if (init.signal?.aborted || epoch !== this.identityEpoch || !this.recovery) throw error;
      const recovered = await this.recovery();
      if (!recovered || epoch !== this.identityEpoch || !['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase())) throw error;
      this.setBaseUrl(recovered);
      res = await doFetch();
    }
    if (res.status === 401 && this.refreshToken) {
      const refreshed = await this.refreshOnce();
      if (refreshed?.accepted) res = await doFetch();
    }
    if (!res.ok) {
      // Message format unchanged — existing logs stay readable.
      throw new ApiError(
        `${init.method ?? 'GET'} ${path} → ${res.status}`,
        res.status,
        parseRetryAfter(res),
      );
    }
    return (await parseBody<T>(res)) as T;
  }

  /** Used by SSE without starting a competing token rotation. */
  async refreshAuthentication(): Promise<boolean> { return !!(await this.refreshOnce())?.accepted; }

  /** Coalesce concurrent refreshes into the single in-flight attempt. */
  private refreshOnce(): Promise<HandshakeResponse | null> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.handshakeRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  // ── Devices and Matter ──────────────────────────────────────

  /** `GET /devices`. The server wraps the list in an envelope; callers get the list. */
  async listDevices(): Promise<Device[]> {
    const res = await this.request<{ devices: Device[] } | Device[]>('/api/v1/devices');
    return Array.isArray(res) ? res : res.devices;
  }

  registerDevice(req: CreateDeviceRequest): Promise<Device> {
    return this.post<Device>('/api/v1/devices', req);
  }

  updateDevice(id: string, req: UpdateDeviceRequest): Promise<Device> {
    return this.put<Device>(`/api/v1/devices/${encodeURIComponent(id)}`, req);
  }

  /**
   * `DELETE /devices/{id}`. The server refuses bridged Matter endpoints — ids
   * shaped `matter-<node>-<endpoint>` — because one node is not one device.
   */
  deleteDevice(id: string): Promise<void> {
    return this.del<void>(`/api/v1/devices/${encodeURIComponent(id)}`);
  }

  /**
   * `POST /devices/commission`. Accepts a QR payload (`MT:…`), an 11/21-digit
   * manual code, or a bare 8-digit passcode.
   *
   * The setup code is a credential — never log the request. The server budgets
   * 180s for this, so it gets its own longer timeout rather than the default.
   */
  commissionDevice(req: CommissionDeviceRequest): Promise<CommissionDeviceResponse> {
    return this.request<CommissionDeviceResponse>('/api/v1/devices/commission', {
      method: 'POST',
      body: JSON.stringify(req),
      signal: timeoutSignal(COMMISSION_TIMEOUT_MS),
    });
  }

  matterStatus(): Promise<MatterStatus> {
    return this.get<MatterStatus>('/api/v1/matter/status');
  }

  /**
   * Actuate a device.
   *
   * There is no REST control route. Actuation goes through the LLM-free MCP
   * dispatch path, which is deny-by-default: `DIRECT_DISPATCH_ALLOWLIST` on the
   * server permits `set_device_state` and `get_device_state` and little else, so
   * this is the only shape that works.
   */
  setDeviceState(deviceId: string, patch: DeviceStatePatch): Promise<ToolCallResult> {
    return this.post<ToolCallResult>('/api/v1/tools/invoke', {
      server: 'giap-device-control',
      tool: 'set_device_state',
      args: { device_id: deviceId, ...patch },
    });
  }

  /**
   * Read a device's current state.
   *
   * The counterpart to the above, and the reason it exists: `is_online` is
   * reachability, not power. Labelling a button from it is what once offered
   * "Turn on" to a contact sensor.
   */
  getDeviceState(deviceId: string): Promise<ToolCallResult> {
    return this.post<ToolCallResult>('/api/v1/tools/invoke', {
      server: 'giap-device-control',
      tool: 'get_device_state',
      args: { device_id: deviceId },
    });
  }

  // ── Sessions ────────────────────────────────────────────────

  async listSessions(): Promise<SessionSummary[]> {
    const res = await this.request<{ sessions: SessionSummary[] } | SessionSummary[]>(
      '/api/v1/sessions',
    );
    return Array.isArray(res) ? res : res.sessions;
  }

  getSession(id: string): Promise<SessionSummary> {
    return this.get<SessionSummary>(`/api/v1/sessions/${encodeURIComponent(id)}`);
  }

  async listSessionMessages(id: string, limit?: number): Promise<SessionMessage[]> {
    const q = limit ? `?limit=${limit}` : '';
    const res = await this.request<{ messages: SessionMessage[] } | SessionMessage[]>(
      `/api/v1/sessions/${encodeURIComponent(id)}/messages${q}`,
    );
    return Array.isArray(res) ? res : res.messages;
  }

  deleteSession(id: string): Promise<void> {
    return this.del<void>(`/api/v1/sessions/${encodeURIComponent(id)}`);
  }

  usageSummary(): Promise<UsageSummary> {
    return this.get<UsageSummary>('/api/v1/usage/summary');
  }

  // ── Memory ──────────────────────────────────────────────────

  async listMemories(limit?: number): Promise<MemoryFragment[]> {
    const q = limit ? `?limit=${limit}` : '';
    const res = await this.request<{ memories: MemoryFragment[] } | MemoryFragment[]>(
      `/api/v1/memories${q}`,
    );
    return Array.isArray(res) ? res : res.memories;
  }

  addMemory(content: string, tags?: string[]): Promise<MemoryFragment> {
    return this.post<MemoryFragment>('/api/v1/memories', { content, tags });
  }

  deleteMemory(id: string): Promise<void> {
    return this.del<void>(`/api/v1/memories/${encodeURIComponent(id)}`);
  }

  // ── Models ──────────────────────────────────────────────────

  async listModels(): Promise<ModelEntry[]> {
    const res = await this.request<{ models: ModelEntry[] } | ModelEntry[]>('/api/v1/models');
    return Array.isArray(res) ? res : res.models;
  }

  modelCapabilities(): Promise<ModelCapabilities> {
    return this.get<ModelCapabilities>('/api/v1/models/capabilities');
  }

  activeModelRoles(): Promise<ModelActiveRoles> {
    return this.get<ModelActiveRoles>('/api/v1/models/active-roles');
  }

  modelMemoryStatus(): Promise<ModelMemoryStatus> {
    return this.get<ModelMemoryStatus>('/api/v1/models/memory-status');
  }

  activateModel(provider: string, name: string): Promise<void> {
    return this.post<void>(
      `/api/v1/models/${encodeURIComponent(provider)}/${encodeURIComponent(name)}/activate`,
      {},
    );
  }

  // ── Schedules ───────────────────────────────────────────────

  async listSchedules(): Promise<Schedule[]> {
    const res = await this.request<{ schedules: Schedule[] } | Schedule[]>('/api/v1/schedules');
    return Array.isArray(res) ? res : res.schedules;
  }

  createSchedule(req: Omit<Schedule, 'id'>): Promise<Schedule> {
    return this.post<Schedule>('/api/v1/schedules', req);
  }

  deleteSchedule(id: string): Promise<void> {
    return this.del<void>(`/api/v1/schedules/${encodeURIComponent(id)}`);
  }

  pauseSchedule(id: string): Promise<void> {
    return this.post<void>(`/api/v1/schedules/${encodeURIComponent(id)}/pause`, {});
  }

  resumeSchedule(id: string): Promise<void> {
    return this.post<void>(`/api/v1/schedules/${encodeURIComponent(id)}/resume`, {});
  }

  runScheduleNow(id: string): Promise<void> {
    return this.post<void>(`/api/v1/schedules/${encodeURIComponent(id)}/run-now`, {});
  }

  async listScheduleRuns(id: string, limit = 20): Promise<ScheduleRun[]> {
    const res = await this.request<{ runs: ScheduleRun[] } | ScheduleRun[]>(
      `/api/v1/schedules/${encodeURIComponent(id)}/runs?limit=${limit}`,
    );
    return Array.isArray(res) ? res : res.runs;
  }

  // ── Logs and activity ───────────────────────────────────────

  async listLogs(params?: { limit?: number; level?: string }): Promise<LogEntry[]> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.level) qs.set('level', params.level);
    const q = qs.toString();
    const res = await this.request<{ logs: LogEntry[] } | LogEntry[]>(
      `/api/v1/logs${q ? `?${q}` : ''}`,
    );
    return Array.isArray(res) ? res : res.logs;
  }

  listActivity(params?: {
    limit?: number;
    since?: string;
    category?: EventCategory;
    session_id?: string;
  }): Promise<ActivityResponse> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.since) qs.set('since', params.since);
    if (params?.category) qs.set('category', params.category);
    if (params?.session_id) qs.set('session_id', params.session_id);
    const q = qs.toString();
    return this.get<ActivityResponse>(`/api/v1/activity${q ? `?${q}` : ''}`);
  }

  activitySummary(): Promise<ActivitySummary> {
    return this.get<ActivitySummary>('/api/v1/activity/summary');
  }

  // ── Extensions and the marketplace ──────────────────────────

  async listExtensions(): Promise<Extension[]> {
    const res = await this.request<{ extensions: Extension[] } | Extension[]>(
      '/api/v1/extensions',
    );
    return Array.isArray(res) ? res : res.extensions;
  }

  setExtensionEnabled(name: string, enabled: boolean): Promise<void> {
    return this.put<void>(`/api/v1/extensions/${encodeURIComponent(name)}`, { enabled });
  }

  async listMarketplace(): Promise<MarketplaceExtension[]> {
    const res = await this.get<{ extensions: MarketplaceExtension[] }>('/api/v1/marketplace');
    return res.extensions;
  }

  installMarketplaceExtension(id: string): Promise<void> {
    return this.post<void>(`/api/v1/marketplace/${encodeURIComponent(id)}/install`, {});
  }

  // ── Secrets and OAuth ───────────────────────────────────────

  /**
   * The names of the secrets the pond holds, never their values. The client is
   * deliberately incapable of reading one back: it stores references, and the
   * server keeps the material.
   */
  async listSecretKeys(): Promise<string[]> {
    const res = await this.get<{ keys: string[] }>('/api/v1/secrets');
    return res.keys;
  }

  setSecret(key: string, value: string): Promise<void> {
    return this.put<void>(`/api/v1/secrets/${encodeURIComponent(key)}`, { value });
  }

  deleteSecret(key: string): Promise<void> {
    return this.del<void>(`/api/v1/secrets/${encodeURIComponent(key)}`);
  }

  async listOAuthProviders(): Promise<OAuthProvider[]> {
    const res = await this.get<{ providers: OAuthProvider[] }>('/api/v1/oauth/providers');
    return res.providers;
  }

  oauthStatus(providerId: string): Promise<{ connected: boolean }> {
    return this.get<{ connected: boolean }>(
      `/api/v1/oauth/status/${encodeURIComponent(providerId)}`,
    );
  }

  // ── Profiles ────────────────────────────────────────────────

  async listProfiles(): Promise<Profile[]> {
    const res = await this.get<{ profiles: Profile[] }>('/api/v1/profiles');
    return res.profiles;
  }

  createProfile(displayName: string, avatarEmoji?: string): Promise<Profile> {
    return this.post<Profile>('/api/v1/profiles', {
      display_name: displayName,
      avatar_emoji: avatarEmoji,
    });
  }

  deleteProfile(id: string): Promise<void> {
    return this.del<void>(`/api/v1/profiles/${encodeURIComponent(id)}`);
  }

  // ── Verb helpers ────────────────────────────────────────────

  private get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }

  private put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
  }

  private del<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

/** Singleton instance */
export const api = new PondApiClient();
