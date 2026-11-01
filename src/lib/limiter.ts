/**
 * In-isolate concurrency slots that bound memory: one ZIP and two previews at a time. They are separate from the
 * per-client rate-limit bindings (SCAN_LIMITER and friends) and hold nothing about the requester.
 */
export type Release = () => void;
export interface BusyError { readonly code: "BUSY"; readonly message: string; readonly retryAfterSec: number }
export type SlotResult = { readonly ok: true; readonly release: Release } | { readonly ok: false; readonly error: BusyError };
export interface Limiter {
  readonly max: number;
  readonly active: number;
  /** A release function, or null when every slot is taken. Calling one release more than once frees a single slot. */
  tryAcquire(): Release | null;
  /** tryAcquire mapped to the user-facing BUSY answer when every slot is taken. */
  acquire(): SlotResult;
}

export const BUSY_MESSAGE = "混み合っています。少し待ってから、もう一度お試しください。";

export function createLimiter(max: number, retryAfterSec = 5): Limiter {
  if (!Number.isSafeInteger(max) || max < 1) throw new RangeError("max must be a positive integer");
  if (!Number.isSafeInteger(retryAfterSec) || retryAfterSec < 1) throw new RangeError("retryAfterSec must be a positive integer");
  let active = 0;
  const tryAcquire = (): Release | null => {
    if (active >= max) return null;
    active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active -= 1;
    };
  };
  return {
    max,
    get active() { return active; },
    tryAcquire,
    acquire() {
      const release = tryAcquire();
      return release ? { ok: true, release } : { ok: false, error: { code: "BUSY", message: BUSY_MESSAGE, retryAfterSec } };
    },
  };
}

export const ZIP_CONCURRENCY = 1;
export const PREVIEW_CONCURRENCY = 2;
/** One ZIP per isolate: each streams assets of up to 25 MiB one by one. */
export const zipLimiter = createLimiter(ZIP_CONCURRENCY, 10);
/** Two previews per isolate, each at most 2 MiB. */
export const previewLimiter = createLimiter(PREVIEW_CONCURRENCY, 3);
