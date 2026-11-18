// Plans and the things a member follows, what Goose made for each, and what it is working on now
// (pond docs/architecture/my-goose-hub.md, part 1a). Only the owner changes a plan; a member it is
// shared with reads it and answers its questions.

import { useCallback, useEffect, useRef, useState } from 'react';

import { stopBody, type Anchor, type AnchorFact, type RejectReason } from '@/models/anchors';
import { api } from '@/services/api-client';
import { confirm } from '@/services/haptics';
import i18n from '@/services/i18n';
import { showSnackbar } from '@/services/snackbar';
import type { NewAnchorWire } from '@/services/types';
import { hubAction, useHubRead } from './hub-read';

/** A plan moves when Goose finishes a step; quicker while something is being made for one. */
export const ANCHORS_MS = 2 * 60_000;
export const ANCHORS_WORKING_MS = 20_000;
/** One plan in front, with its job's steps moving. */
export const ANCHOR_RUNNING_MS = 5_000;

function working(anchors: readonly Anchor[]): boolean {
  return anchors.some((a) => a.job !== null);
}

export function useAnchors(enabled = true) {
  const read = useHubRead<Anchor[]>('anchors', () => api.anchors(), [], (list) => (working(list) ? ANCHORS_WORKING_MS : ANCHORS_MS), enabled);
  const { setData } = read;
  const [busy, setBusy] = useState<string | null>(null);

  const put = useCallback((anchor: Anchor) => setData((list) => (list.some((a) => a.id === anchor.id) ? list.map((a) => (a.id === anchor.id ? anchor : a)) : [anchor, ...list])), [setData]);

  /** The member's yes to a plan Goose offered: Goose starts on it. */
  const confirmAnchor = useCallback(
    async (anchor: Anchor) => {
      setBusy(anchor.id);
      const done = await hubAction('anchors', () => api.confirmAnchor(anchor.id));
      setBusy(null);
      if (!done) return false;
      put(done);
      void confirm();
      showSnackbar({ message: i18n.t('goose.plans.confirmed', { title: done.title }), tone: 'success' });
      return true;
    },
    [put],
  );

  /** Waves off a plan Goose offered: it fades, and comes back only if the member adds it. */
  const dismiss = useCallback(
    async (anchor: Anchor) => {
      let at = -1;
      setData((list) => {
        at = list.findIndex((a) => a.id === anchor.id);
        return list.filter((a) => a.id !== anchor.id);
      });
      const done = await hubAction('anchors', () => api.dismissAnchor(anchor.id).then(() => true));
      if (!done) {
        setData((list) => (list.some((a) => a.id === anchor.id) ? list : [...list.slice(0, Math.max(0, at)), anchor, ...list.slice(Math.max(0, at))]));
        return false;
      }
      showSnackbar({ message: i18n.t('goose.plans.dismissed'), tone: 'success' });
      return true;
    },
    [setData],
  );

  /** A plan the member adds: active at once. The same title answers with the plan already there. */
  const add = useCallback(
    async (body: NewAnchorWire) => {
      const done = await hubAction('anchors', () => api.addAnchor({ ...body, title: body.title.trim() }));
      if (!done) return null;
      put(done);
      void confirm();
      showSnackbar({ message: i18n.t('goose.plans.added', { title: done.title }), tone: 'success' });
      return done;
    },
    [put],
  );

  return { ...read, busy, actions: { reload: read.reload, confirm: confirmAnchor, dismiss, add } };
}

export type UseAnchors = ReturnType<typeof useAnchors>;

/** One plan, read alone: its facts, what Goose made, its questions and the running job's steps. */
export function useAnchor(id: string) {
  const read = useHubRead<Anchor | null>('anchor', () => api.anchor(id), null, (a) => (a?.job?.state === 'running' ? ANCHOR_RUNNING_MS : a?.job ? ANCHORS_WORKING_MS : ANCHORS_MS), id !== '');
  const { data, setData, reload } = read;
  const [busy, setBusy] = useState<'confirm' | 'dismiss' | 'stop' | 'share' | 'facts' | null>(null);
  const latest = useRef(data);
  useEffect(() => {
    latest.current = data;
  });

  const run = useCallback(async <T,>(what: NonNullable<typeof busy>, work: () => Promise<T>): Promise<T | null> => {
    setBusy(what);
    const done = await hubAction('anchor', work);
    setBusy(null);
    return done;
  }, []);

  const confirmIt = useCallback(async () => {
    const done = await run('confirm', () => api.confirmAnchor(id));
    if (!done) return false;
    setData((a) => (a ? { ...done, questions: a.questions, job: done.job ?? a.job } : done));
    void confirm();
    showSnackbar({ message: i18n.t('goose.plans.confirmed', { title: done.title }), tone: 'success' });
    return true;
  }, [id, run, setData]);

  const dismiss = useCallback(async () => {
    const done = await run('dismiss', () => api.dismissAnchor(id).then(() => true));
    if (!done) return false;
    showSnackbar({ message: i18n.t('goose.plans.dismissed'), tone: 'success' });
    return true;
  }, [id, run]);

  /** Stops the plan: its jobs are called off, and a reason, words or "never" leave a rule. */
  const stop = useCallback(
    async (reasons: readonly RejectReason[], words: string, never: boolean) => {
      const done = await run('stop', () => api.stopAnchor(id, stopBody(reasons, words, never)).then(() => true));
      if (!done) return false;
      setData((a) => (a ? { ...a, state: 'stopped', job: null } : a));
      showSnackbar({ message: i18n.t(never ? 'goose.anchor.stoppedNever' : 'goose.anchor.stopped'), tone: 'success' });
      return true;
    },
    [id, run, setData],
  );

  const share = useCallback(
    async (profileIds: string[]) => {
      const done = await run('share', () => api.shareAnchor(id, profileIds));
      if (!done) return false;
      setData((a) => (a ? { ...a, shares: done.shares } : done));
      showSnackbar({ message: i18n.t('goose.anchor.shared'), tone: 'success' });
      return true;
    },
    [id, run, setData],
  );

  /** Takes a wrong fact off the plan: the Pond replaces the whole list. */
  const removeFact = useCallback(
    async (fact: AnchorFact) => {
      const before = latest.current;
      if (!before) return false;
      const facts = before.facts.filter((f) => !(f.label === fact.label && f.value === fact.value));
      setData((a) => (a ? { ...a, facts } : a));
      const done = await run('facts', () => api.editAnchor(id, { facts }));
      if (!done) {
        setData((a) => (a ? { ...a, facts: before.facts } : a));
        return false;
      }
      setData((a) => (a ? { ...a, facts: done.facts } : a));
      return true;
    },
    [id, run, setData],
  );

  return { ...read, busy, actions: { reload, confirm: confirmIt, dismiss, stop, share, removeFact } };
}

export type UseAnchor = ReturnType<typeof useAnchor>;
