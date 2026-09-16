/** Trigger types — shared by sensor-triggered schedules and rules */

export interface TriggerSource {
  kind: 'sensor' | 'camera' | 'device';
  device_id?: string;
  signal?: string;
}

export interface TriggerCondition {
  op?: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  value?: number;
  /** "HH:MM" local time window bounds */
  after?: string;
  before?: string;
}

export type TriggerAction =
  | { type: 'agent_prompt'; prompt: string }
  | { type: 'device_power'; device_id: string; on: boolean }
  | { type: 'notify'; title: string; body: string };
