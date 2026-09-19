/**
 * Shared fetch helpers.
 */

/**
 * `AbortSignal.timeout()` stand-in.
 *
 * React Native installs abort-controller@3's `AbortSignal` as the global
 * (react-native/Libraries/Core/setUpXHR.js), and that implementation carries no
 * static methods at all — `AbortSignal.timeout` is `undefined` on device.
 * Calling it threw a TypeError that `health()` then swallowed in its own catch,
 * so the probe reported every Pond unreachable and never once returned ok.
 */
export function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  // Node tests should not remain alive solely for a React Native request timer.
  (timer as unknown as { unref?: () => void }).unref?.();
  return controller.signal;
}
