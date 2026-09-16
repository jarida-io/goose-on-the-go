/** Schedule types — real pond-infra-scheduler backend shapes */

import type { TriggerAction, TriggerCondition, TriggerSource } from './trigger';

export type TaskKind =
  | { type: 'agent_prompt'; prompt: string }
  | { type: 'webhook'; webhook_url: string }
  | {
      type: 'sensor_trigger';
      source: TriggerSource;
      condition?: TriggerCondition;
      actions: TriggerAction[];
      cooldown_secs?: number;
    };

export interface Schedule {
  id: string;
  label: string;
  cron: string;
  fire_at: string | null;
  timezone: string;
  kind: TaskKind;
  paused: boolean;
  currently_running: boolean;
  last_run: string | null;
  next_run: string | null;
  created_at: string;
}

export interface ScheduleRun {
  id: string;
  schedule_id: string;
  status: 'running' | 'completed' | 'failed';
  result: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

export interface ScheduleResultEvent {
  schedule_id: string;
  schedule_label: string;
  run_id: string;
  status: 'running' | 'completed' | 'failed';
  result?: string | null;
  error?: string | null;
  duration_ms?: number | null;
}

export interface CreateScheduleInput {
  id?: string;
  name: string;
  cron: string;
  prompt?: string;
  timezone?: string;
  kind?: TaskKind;
  once?: boolean;
}

export interface UpdateScheduleInput {
  name?: string;
  cron?: string;
  timezone?: string;
  prompt?: string;
  fire_at?: string;
  once?: boolean;
}
