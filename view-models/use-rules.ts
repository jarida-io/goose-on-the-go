/**
 * Rules — sensor-triggered automations (issue #14).
 *
 * The Pond has no event stream for rules, so this is a poll. There is no
 * run-now either: a rule fires when a reading matches it, and pretending to
 * fire one by hand would skip the very condition that makes it a rule.
 *
 * Behind the same Developer toggle as schedules.
 */

import { useCallback, useRef, useState } from 'react';

import { useServer } from '@/providers/server-provider';
import { ApiError, api } from '@/services/api-client';
import i18n from '@/services/i18n';
import type { Rule, RuleRequest } from '@/services/types';
import { SAMPLE_RULES } from '@/models/schedule';
import { describeScheduleError } from './use-schedules';
import { useLive } from './use-live';

/** A rule changes when somebody edits one, which is rarely. */
export const RULES_MS = 30_000;

export interface UseRules {
  data: { rules: Rule[] };
  loading: boolean;
  error: string | null;
  actions: {
    refresh: () => Promise<void>;
    /** Resolves to why the Pond refused it, or null once it exists. */
    create: (req: RuleRequest) => Promise<string | null>;
    setPaused: (rule: Rule, paused: boolean) => Promise<void>;
  };
}

export function useRules(): UseRules {
  const { hydrated, isScreenReal } = useServer();
  const real = isScreenReal('schedule');

  const [rules, setRules] = useState<Rule[]>(() => (real ? [] : SAMPLE_RULES));
  const [loading, setLoading] = useState(real);
  const [error, setError] = useState<string | null>(null);

  // The Developer toggle swapping the source; see useSchedules.
  const [source, setSource] = useState(real);
  if (source !== real) {
    setSource(real);
    setRules(real ? [] : SAMPLE_RULES);
    setLoading(real);
    setError(null);
  }

  const loadedFrom = useRef<boolean | null>(null);
  const changes = useRef(0);

  const load = useCallback(
    async (loud: boolean) => {
      if (!real) return;
      if (loud) {
        setLoading(true);
        setError(null);
      }
      const startedAt = changes.current;
      try {
        const list = await api.listRules();
        if (startedAt === changes.current) setRules(list);
        loadedFrom.current = real;
        setError(null);
      } catch (e) {
        if (loud || loadedFrom.current !== real) setError(describeScheduleError(e));
        else console.warn('[rules] refresh failed; showing the last result', e instanceof ApiError ? e.status : 'network');
      } finally {
        setLoading(false);
      }
    },
    [real],
  );

  const refresh = useCallback(() => load(true), [load]);

  useLive(() => load(false), RULES_MS, hydrated && real);

  const create = useCallback(
    async (req: RuleRequest) => {
      if (!real) {
        changes.current += 1;
        setRules((current) => [...current, mockRule(req)]);
        return null;
      }
      try {
        const created = await api.createRule(req);
        changes.current += 1;
        setRules((current) => [...current, created]);
        return null;
      } catch (e) {
        return describeScheduleError(e) ?? i18n.t('schedule.errors.createFailed');
      }
    },
    [real],
  );

  const setPaused = useCallback(
    async (rule: Rule, paused: boolean) => {
      changes.current += 1;
      setRules((current) => current.map((r) => (r.id === rule.id ? { ...r, paused } : r)));
      if (!real) return;
      try {
        await (paused ? api.pauseRule(rule.id) : api.resumeRule(rule.id));
      } catch (e) {
        changes.current += 1;
        setRules((current) => current.map((r) => (r.id === rule.id ? { ...r, paused: rule.paused } : r)));
        setError(describeScheduleError(e));
      }
    },
    [real],
  );

  return { data: { rules }, loading, error, actions: { refresh, create, setPaused } };
}

function mockRule(req: RuleRequest): Rule {
  return {
    id: `mock-${Date.now()}`,
    name: req.name,
    paused: false,
    currently_running: false,
    created_at: new Date().toISOString(),
    last_fired: null,
    cooldown_secs: req.cooldown_secs ?? 60,
    source: req.source,
    condition: req.condition,
    actions: req.actions,
  };
}
