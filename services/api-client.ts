/**
 * PondApiClient — mock API client for pond-server.
 * Mirrors the desktop client's interface; actual HTTP calls will be wired up later.
 */

import { timeoutSignal } from '@/services/http';

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

  // Future endpoints:
  // async listSessions(): Promise<SessionSummary[]>
  // async getSession(id: string): Promise<Message[]>
  // async chat(sessionId: string, message: string): AsyncIterable<ChatEvent>
  // async listModels(): Promise<ModelEntry[]>
  // async getSettings(): Promise<AppSettings>
  // async updateSettings(patch: Partial<AppSettings>): Promise<void>
  // async listDevices(): Promise<Device[]>
  // async listSchedules(): Promise<Schedule[]>
  // async listMemories(): Promise<MemoryFragment[]>
  // async addMemory(text: string): Promise<MemoryFragment>
  // etc.
}

/** Singleton instance */
export const api = new PondApiClient();
