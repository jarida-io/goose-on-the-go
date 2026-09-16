/**
 * Rules ViewModel
 * Fetches/mutates sensor-triggered automations on the paired Pond desktop.
 * No SSE endpoint exists for rules — polling only.
 */

import { useCallback, useEffect, useState } from 'react';

import { api } from '@/services/api-client';
import { useServer } from '@/providers/server-provider';
import type { RuleInput, RuleView } from '@/models/rule';

const POLL_MS = 30_000;

interface RulesState {
  rules: RuleView[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  create: (input: RuleInput) => Promise<RuleView>;
  update: (id: string, input: RuleInput) => Promise<RuleView>;
  remove: (id: string) => Promise<void>;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
}

export function useRules(): RulesState {
  const { online, token } = useServer();
  const [rules, setRules] = useState<RuleView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    if (!online || !token) {
      setRules([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRules(await api.listRules());
    } catch (err) {
      setRules([]);
      setError(err instanceof Error ? err.message : 'Could not load automations from the Pond desktop.');
    } finally {
      setLoading(false);
    }
  }, [online, token]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  useEffect(() => {
    if (!online || !token) return;
    const interval = setInterval(fetchRules, POLL_MS);
    return () => clearInterval(interval);
  }, [online, token, fetchRules]);

  const create = useCallback(async (input: RuleInput) => {
    const created = await api.createRule(input);
    setRules((prev) => [...prev, created]);
    return created;
  }, []);

  const update = useCallback(async (id: string, input: RuleInput) => {
    const updated = await api.updateRule(id, input);
    setRules((prev) => prev.map((r) => (r.id === id ? updated : r)));
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api.deleteRule(id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const pause = useCallback(async (id: string) => {
    await api.pauseRule(id);
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, paused: true } : r)));
  }, []);

  const resume = useCallback(async (id: string) => {
    await api.resumeRule(id);
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, paused: false } : r)));
  }, []);

  return { rules, loading, error, refetch: fetchRules, create, update, remove, pause, resume };
}
