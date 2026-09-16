/**
 * PondApiClient — HTTP client for the paired Pond desktop server.
 * Mirrors the desktop client's interface; most endpoints are still stubs.
 */

import { timeoutSignal } from '@/services/http';
import type { Device, DeviceKind } from '@/models/device';
import type {
  Schedule,
  ScheduleRun,
  CreateScheduleInput,
  UpdateScheduleInput,
} from '@/models/schedule';
import type { RuleView, RuleInput } from '@/models/rule';

const API_PREFIX = '/api/v1';

interface DeviceWire {
  id: string;
  name: string;
  kind: string;
  room: string | null;
  on: boolean;
  detail: string | null;
}

function toDeviceKind(kind: string): DeviceKind {
  switch (kind) {
    case 'light':
    case 'thermostat':
    case 'lock':
    case 'speaker':
    case 'camera':
    case 'switch':
    case 'sensor':
      return kind;
    default:
      return 'other';
  }
}

export class PondApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl = 'http://127.0.0.1:4000') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  setToken(token: string | null) {
    this.token = token;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  async health(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: this.headers(),
        signal: timeoutSignal(3000),
      });
      return { ok: res.ok, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }

  /** Lists the smart-home devices registered on the paired Pond desktop. */
  async listDevices(): Promise<Device[]> {
    const res = await fetch(`${this.baseUrl}${API_PREFIX}/devices`, {
      headers: this.headers(),
      signal: timeoutSignal(5000),
    });
    if (!res.ok) {
      throw new Error(`Server responded ${res.status} while listing devices`);
    }
    const body: { devices: DeviceWire[] } = await res.json();
    return body.devices.map((d) => ({ ...d, kind: toDeviceKind(d.kind) }));
  }

  // — Schedules —

  async listSchedules(): Promise<Schedule[]> {
    const res = await fetch(`${this.baseUrl}${API_PREFIX}/schedules`, {
      headers: this.headers(),
      signal: timeoutSignal(5000),
    });
    if (!res.ok) {
      throw new Error(`Server responded ${res.status} while listing schedules`);
    }
    return res.json();
  }

  async listUpcomingSchedules(limit = 10): Promise<Schedule[]> {
    const res = await fetch(
      `${this.baseUrl}${API_PREFIX}/schedules/upcoming?limit=${limit}`,
      { headers: this.headers(), signal: timeoutSignal(5000) },
    );
    if (!res.ok) {
      throw new Error(`Server responded ${res.status} while listing upcoming schedules`);
    }
    return res.json();
  }

  async createSchedule(input: CreateScheduleInput): Promise<Schedule> {
    const res = await fetch(`${this.baseUrl}${API_PREFIX}/schedules`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(input),
      signal: timeoutSignal(5000),
    });
    if (!res.ok) {
      throw new Error(
        await this.parseErrorMessage(res, `Server responded ${res.status} while creating schedule`),
      );
    }
    return res.json();
  }

  async updateSchedule(id: string, patch: UpdateScheduleInput): Promise<Schedule> {
    const res = await fetch(`${this.baseUrl}${API_PREFIX}/schedules/${id}`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(patch),
      signal: timeoutSignal(5000),
    });
    if (!res.ok) {
      throw new Error(`Server responded ${res.status} while updating schedule ${id}`);
    }
    return res.json();
  }

  async deleteSchedule(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${API_PREFIX}/schedules/${id}`, {
      method: 'DELETE',
      headers: this.headers(),
      signal: timeoutSignal(5000),
    });
    if (!res.ok) {
      throw new Error(`Server responded ${res.status} while deleting schedule ${id}`);
    }
  }

  async pauseSchedule(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${API_PREFIX}/schedules/${id}/pause`, {
      method: 'POST',
      headers: this.headers(),
      signal: timeoutSignal(5000),
    });
    if (!res.ok) {
      throw new Error(`Server responded ${res.status} while pausing schedule ${id}`);
    }
  }

  async resumeSchedule(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${API_PREFIX}/schedules/${id}/resume`, {
      method: 'POST',
      headers: this.headers(),
      signal: timeoutSignal(5000),
    });
    if (!res.ok) {
      throw new Error(`Server responded ${res.status} while resuming schedule ${id}`);
    }
  }

  async runScheduleNow(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${API_PREFIX}/schedules/${id}/run-now`, {
      method: 'POST',
      headers: this.headers(),
      signal: timeoutSignal(5000),
    });
    if (!res.ok) {
      throw new Error(`Server responded ${res.status} while running schedule ${id}`);
    }
  }

  async getScheduleRuns(id: string, limit = 10): Promise<ScheduleRun[]> {
    const res = await fetch(
      `${this.baseUrl}${API_PREFIX}/schedules/${id}/runs?limit=${limit}`,
      { headers: this.headers(), signal: timeoutSignal(5000) },
    );
    if (!res.ok) {
      throw new Error(`Server responded ${res.status} while fetching runs for schedule ${id}`);
    }
    return res.json();
  }

  // — Rules —

  async listRules(): Promise<RuleView[]> {
    const res = await fetch(`${this.baseUrl}${API_PREFIX}/rules`, {
      headers: this.headers(),
      signal: timeoutSignal(5000),
    });
    if (!res.ok) {
      throw new Error(`Server responded ${res.status} while listing rules`);
    }
    return res.json();
  }

  async createRule(input: RuleInput): Promise<RuleView> {
    const res = await fetch(`${this.baseUrl}${API_PREFIX}/rules`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(input),
      signal: timeoutSignal(5000),
    });
    if (!res.ok) {
      throw new Error(
        await this.parseErrorMessage(res, `Server responded ${res.status} while creating rule`),
      );
    }
    return res.json();
  }

  async updateRule(id: string, input: RuleInput): Promise<RuleView> {
    const res = await fetch(`${this.baseUrl}${API_PREFIX}/rules/${id}`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(input),
      signal: timeoutSignal(5000),
    });
    if (!res.ok) {
      throw new Error(
        await this.parseErrorMessage(res, `Server responded ${res.status} while updating rule ${id}`),
      );
    }
    return res.json();
  }

  async deleteRule(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${API_PREFIX}/rules/${id}`, {
      method: 'DELETE',
      headers: this.headers(),
      signal: timeoutSignal(5000),
    });
    if (!res.ok) {
      throw new Error(`Server responded ${res.status} while deleting rule ${id}`);
    }
  }

  async pauseRule(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${API_PREFIX}/rules/${id}/pause`, {
      method: 'POST',
      headers: this.headers(),
      signal: timeoutSignal(5000),
    });
    if (!res.ok) {
      throw new Error(`Server responded ${res.status} while pausing rule ${id}`);
    }
  }

  async resumeRule(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${API_PREFIX}/rules/${id}/resume`, {
      method: 'POST',
      headers: this.headers(),
      signal: timeoutSignal(5000),
    });
    if (!res.ok) {
      throw new Error(`Server responded ${res.status} while resuming rule ${id}`);
    }
  }

  /** Reads `{error: string}` from a non-ok JSON body (e.g. rule validation messages), falling back otherwise. */
  private async parseErrorMessage(res: Response, fallback: string): Promise<string> {
    try {
      const body = await res.json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // not JSON — fall through
    }
    return fallback;
  }

  // Future endpoints:
  // async listSessions(): Promise<SessionSummary[]>
  // async getSession(id: string): Promise<Message[]>
  // async chat(sessionId: string, message: string): AsyncIterable<ChatEvent>
  // async listModels(): Promise<ModelEntry[]>
  // async getSettings(): Promise<AppSettings>
  // async updateSettings(patch: Partial<AppSettings>): Promise<void>
  // async listMemories(): Promise<MemoryFragment[]>
  // async addMemory(text: string): Promise<MemoryFragment>
  // etc.
}

/** Singleton instance */
export const api = new PondApiClient();
