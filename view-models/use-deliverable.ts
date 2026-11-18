// One piece of finished work Goose made for a plan: reading it marks it seen, Refresh asks Goose to
// make it again, Reject waves it off ("Not this one") or forever ("Never this"), and Share hands the
// document on as a file (pond docs/architecture/my-goose-hub.md, part 1a).

import { useCallback, useEffect, useRef, useState } from 'react';

import { rejectBody, type Deliverable, type RejectReason } from '@/models/anchors';
import { REPORT_FILES } from '@/models/long-tasks';
import { ApiError, api } from '@/services/api-client';
import { confirm } from '@/services/haptics';
import i18n from '@/services/i18n';
import { shareReportFile, SharingUnavailableError } from '@/services/report-share';
import { showSnackbar } from '@/services/snackbar';
import { describeApiError, logFailure } from './describe-error';
import { hubAction, useHubRead } from './hub-read';

/** A finished piece changes only when it is made again; quicker while that is under way. */
export const DELIVERABLE_MS = 5 * 60_000;
export const DELIVERABLE_MAKING_MS = 10_000;

export type RejectVerb = 'not_this' | 'never';

export function useDeliverable(id: string) {
  const read = useHubRead<Deliverable | null>(
    'deliverable',
    () => api.deliverable(id),
    null,
    (d) => (d?.job || d?.state === 'queued' || d?.state === 'making' ? DELIVERABLE_MAKING_MS : DELIVERABLE_MS),
    id !== '',
  );
  const { data, setData } = read;
  const [busy, setBusy] = useState<'refresh' | 'reject' | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const marked = useRef<string | null>(null);

  // Opening it is reading it: the Home card and the notice that pointed here go once it is marked.
  useEffect(() => {
    if (!data || !data.unseen || !data.mine || marked.current === data.id) return;
    marked.current = data.id;
    setData((d) => (d ? { ...d, unseen: false } : d));
    void api.deliverableSeen(data.id).catch((e: unknown) => {
      marked.current = null;
      logFailure('deliverable', 'seen failed', e);
    });
  }, [data, setData]);

  const refresh = useCallback(async () => {
    setBusy('refresh');
    const done = await hubAction('deliverable', () => api.refreshDeliverable(id).then(() => true));
    setBusy(null);
    if (!done) return false;
    setData((d) => (d ? { ...d, job: d.job ?? { kind: 'deliverable', subject: d.title, state: 'queued', rounds: 0, steps: [] } } : d));
    showSnackbar({ message: i18n.t('goose.deliverable.refreshing'), tone: 'success' });
    return true;
  }, [id, setData]);

  /** "Not this one" leaves an avoid rule on its title; "Never this" with words, one general rule. */
  const reject = useCallback(
    async (verb: RejectVerb, reasons: readonly RejectReason[], words: string) => {
      setBusy('reject');
      const done = await hubAction('deliverable', () => api.rejectDeliverable(id, rejectBody(verb, reasons, words)).then(() => true));
      setBusy(null);
      if (!done) return false;
      setData((d) => (d ? { ...d, state: 'rejected', job: null } : d));
      showSnackbar({ message: i18n.t(verb === 'never' ? 'goose.deliverable.rejectedNever' : 'goose.deliverable.rejected'), tone: 'success' });
      return true;
    },
    [id, setData],
  );

  const share = useCallback(async () => {
    if (sharing) return false;
    setSharing(true);
    setShareError(null);
    try {
      const file = await api.deliverableFile(id);
      await shareReportFile(file.name, file.body, REPORT_FILES.markdown);
      void confirm();
      return true;
    } catch (e) {
      logFailure('deliverable', 'share failed', e);
      if (e instanceof SharingUnavailableError) setShareError(i18n.t('chat.report.shareUnavailable'));
      else if (e instanceof ApiError && e.status === 404) setShareError(i18n.t('goose.deliverable.nothingYet'));
      else setShareError(describeApiError(e) ?? i18n.t('chat.report.shareFailed'));
      return false;
    } finally {
      setSharing(false);
    }
  }, [id, sharing]);

  return { ...read, busy, sharing, shareError, actions: { reload: read.reload, refresh, reject, share } };
}

export type UseDeliverable = ReturnType<typeof useDeliverable>;
