/**
 * Shared fetch helpers.
 */

/** `AbortSignal.timeout()` replacement — Hermes doesn't implement the static. */
export function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
