/** Rule types — sensor-triggered automations (kept distinct from Schedule; see models/schedule.ts) */

import type { TriggerAction, TriggerCondition, TriggerSource } from './trigger';

export interface RuleView {
  id: string;
  name: string;
  paused: boolean;
  currently_running: boolean;
  created_at: string;
  last_fired: string | null;
  cooldown_secs: number;
  source: TriggerSource;
  condition?: TriggerCondition;
  actions: TriggerAction[];
}

export interface RuleInput {
  id?: string;
  name: string;
  source: TriggerSource;
  condition?: TriggerCondition;
  actions: TriggerAction[];
  cooldown_secs?: number;
}
