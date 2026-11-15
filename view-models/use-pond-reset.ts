/**
 * Erasing the Pond for a new owner (issue #161): save routines to this phone first, then two
 * confirmations -- the Pond's own name, and this phone's lock -- before the Pond wipes itself.
 *
 * A successful reset also forgets this phone's own kept key and unpairs it: the Pond that key
 * opened, and this pairing pointed at, no longer exists as it did, so nothing is left here
 * pointing at it. `unpair` already reads the Pond refusing a now-erased session as released, so
 * this never asks the person anything -- unlike the Settings "Forget this Pond" it shares the
 * provider with.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useServer } from '@/providers/server-provider';
import i18n from '@/services/i18n';
import { api } from '@/services/api-client';
import { forgetKeptAdminKey, keptKeyIsLost, keptKeyWasCancelled, readKeptAdminKey } from '@/services/kept-admin-key';
import { shareReportFile, SharingUnavailableError } from '@/services/report-share';
import type { FactoryResetStep } from '@/services/types';
import { describeApiError } from './describe-error';
import { adminRefusal, useAdminKeyPin } from './pond-admin-source';
import { useAdminGate, type AdminGate } from './use-admin-gate';

/** How often the resetting step polls `GET /admin/factory-reset/status` for the step reached. */
const RESET_POLL_MS = 1000;

export interface UsePondReset {
  gate: AdminGate;
  exporting: boolean;
  exportError: string | null;
  resetting: boolean;
  resetError: string | null;
  /** Which step the reset in progress has reached, for the resetting step's progress line. Null until the first poll answers. */
  resetStep: FactoryResetStep | null;
  resetStepsCompleted: number;
  resetTotalSteps: number;
  actions: {
    /** Reads `GET /admin/status` again; for the lock view's Retry when the Pond couldn't be reached. */
    refresh: () => Promise<boolean>;
    /** Writes every schedule and rule to a file and opens the share sheet. Resolves to whether it worked. */
    exportRoutines: () => Promise<boolean>;
    /**
     * The phone-lock step: reads this phone's kept key, which prompts Face ID, a fingerprint or the
     * phone's PIN. False for a cancelled or lost key, so the screen falls back to the admin card.
     */
    confirmWithKeptKey: () => Promise<boolean>;
    /** Erases the Pond once both confirmations are in. Resolves to whether it worked. */
    reset: (typedName: string) => Promise<boolean>;
  };
}

function routinesFileName(): string {
  return `pond-routines-${new Date().toISOString().slice(0, 10)}.json`;
}

export function usePondReset(): UsePondReset {
  const { gate, source, readStatus, noteFailure, noteLocked } = useAdminGate();
  const { unpair } = useServer();
  const pin = useAdminKeyPin();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetStep, setResetStep] = useState<FactoryResetStep | null>(null);
  const [resetStepsCompleted, setResetStepsCompleted] = useState(0);
  const [resetTotalSteps, setResetTotalSteps] = useState(8);
  const resetPoll = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopResetPoll = useCallback(() => {
    if (resetPoll.current !== null) {
      clearInterval(resetPoll.current);
      resetPoll.current = null;
    }
  }, []);
  // However the screen leaves mid-reset, nothing keeps polling a request no one reads the answer to.
  useEffect(() => stopResetPoll, [stopResetPoll]);

  const exportRoutines = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      const schedules = await api.listSchedules();
      await shareReportFile(routinesFileName(), JSON.stringify(schedules, null, 2), {
        mimeType: 'application/json',
        uti: 'public.json',
      });
      return true;
    } catch (e) {
      setExportError(e instanceof SharingUnavailableError ? i18n.t('myPond.reset.exportFailed') : (describeApiError(e) ?? i18n.t('myPond.reset.exportFailed')));
      return false;
    } finally {
      setExporting(false);
    }
  }, []);

  const confirmWithKeptKey = useCallback(async () => {
    if (!pin || !gate.kept) return false;
    try {
      const key = await readKeptAdminKey(pin, i18n.t('myPond.reset.confirmLockPrompt'));
      return key !== null;
    } catch (e) {
      // Lost or cancelled, either way the screen falls back to the admin card; nothing to say here.
      void keptKeyIsLost(e);
      void keptKeyWasCancelled(e);
      return false;
    }
  }, [gate.kept, pin]);

  const pollResetStatus = useCallback(async () => {
    try {
      const status = await source.factoryResetStatus();
      setResetStep(status.active ? status.current_step : null);
      setResetStepsCompleted(status.steps_completed);
      setResetTotalSteps(status.total_steps);
    } catch {
      // Best effort: the last step this heard about stays on screen rather than blanking.
    }
  }, [source]);

  const reset = useCallback(
    async (typedName: string) => {
      setResetting(true);
      setResetError(null);
      setResetStep(null);
      setResetStepsCompleted(0);
      void pollResetStatus();
      resetPoll.current = setInterval(() => void pollResetStatus(), RESET_POLL_MS);
      try {
        await source.factoryReset(typedName);
        await forgetKeptAdminKey(pin).catch(() => undefined);
        noteLocked();
        await unpair().catch((e) => console.warn('[pond-reset] kind=unpair_failed', e));
        return true;
      } catch (e) {
        if (noteFailure(e)) return false;
        const refusal = adminRefusal(e);
        setResetError(
          refusal === 'pond_name_mismatch'
            ? i18n.t('myPond.reset.nameMismatch')
            : refusal === 'pond_has_no_name'
              ? i18n.t('myPond.reset.noName')
              : refusal === 'payments_held'
                ? i18n.t('myPond.reset.paymentsHeld')
                : refusal === 'factory_reset_main_member_only'
                  ? i18n.t('myPond.reset.mainMemberOnly')
                  : (describeApiError(e) ?? i18n.t('myPond.reset.resetFailed')),
        );
        return false;
      } finally {
        stopResetPoll();
        setResetting(false);
      }
    },
    [noteFailure, noteLocked, pin, pollResetStatus, source, stopResetPoll, unpair],
  );

  return {
    gate,
    exporting,
    exportError,
    resetting,
    resetError,
    resetStep,
    resetStepsCompleted,
    resetTotalSteps,
    actions: { refresh: readStatus, exportRoutines, confirmWithKeptKey, reset },
  };
}
