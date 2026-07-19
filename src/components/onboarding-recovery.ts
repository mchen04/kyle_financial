import { isRetryablePlanCreationRecoveryError } from "./plan-types";

const PLAN_CREATION_RECOVERY_DELAYS_MS = [0, 250, 500, 1_000, 2_000];
const PLAN_CREATION_RECOVERY_TIMEOUT_MS = 5_000;

type RecoveryPause = (delayMs: number, signal: AbortSignal) => Promise<void>;

interface PlanCreationRecoveryOptions {
  delaysMs?: readonly number[];
  pause?: RecoveryPause;
  timeoutMs?: number;
  ownerSignal?: AbortSignal;
}

function beforeDeadline<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

const wait: RecoveryPause = (delayMs, signal) =>
  new Promise<void>((resolve, reject) => {
    const timeout = globalThis.setTimeout(finish, delayMs);
    const abort = () => {
      globalThis.clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    function finish() {
      signal.removeEventListener("abort", abort);
      resolve();
    }
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });

export async function recoverPlanCreationWithBackoff(
  recover: (year: number, signal: AbortSignal) => Promise<boolean>,
  year: number,
  options: PlanCreationRecoveryOptions = {},
): Promise<boolean> {
  const {
    delaysMs = PLAN_CREATION_RECOVERY_DELAYS_MS,
    pause = wait,
    timeoutMs = PLAN_CREATION_RECOVERY_TIMEOUT_MS,
    ownerSignal,
  } = options;
  const controller = new AbortController();
  const abortFromOwner = () => controller.abort(ownerSignal?.reason);
  if (ownerSignal?.aborted) abortFromOwner();
  else ownerSignal?.addEventListener("abort", abortFromOwner, { once: true });
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (const delayMs of delaysMs) {
      if (delayMs > 0) await pause(delayMs, controller.signal);
      if (controller.signal.aborted) return false;
      try {
        if (
          await beforeDeadline(
            recover(year, controller.signal),
            controller.signal,
          )
        )
          return true;
      } catch (error) {
        if (controller.signal.aborted) return false;
        if (!isRetryablePlanCreationRecoveryError(error)) throw error;
      }
    }
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    ownerSignal?.removeEventListener("abort", abortFromOwner);
  }
  return false;
}
