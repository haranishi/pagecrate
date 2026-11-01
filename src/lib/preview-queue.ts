/**
 * The screen's preview queue (design-ux.md: previews load two at a time, from what is on screen). The server serves
 * two previews per isolate at once (a third gets 503 with Retry-After 3) and limits each client per minute (429).
 * Left to plain <img> tags, most of a long list would break. The queue:
 * - starts at most `maxConcurrent` fetches (2);
 * - retries 503 (not PAUSED) and 429 after the server's wait, 3 s and 60 s when it gives none, and starts nothing
 *   else while it waits, since every other start would hit the same limit; each preview gets `maxAttempts` tries;
 * - ends 410 as expired (and stops: every ticket of a result expires together), 415 as "cannot be previewed", and
 *   anything else as failed;
 * - starts nothing once the result's expiry time has passed;
 * - tells the screen when a 429 makes everything wait and when that wait is over (`onRateLimitWait`), so the status
 *   band can say how long the frames will keep loading.
 * No DOM here: the fetch, the clock and the timers come in through the options, so tests can drive them.
 */

export const PREVIEW_MAX_CONCURRENT = 2;
export const PREVIEW_MAX_ATTEMPTS = 4;
export const BUSY_RETRY_SEC = 3;
export const RATE_LIMIT_RETRY_SEC = 60;
/** A longer wait than the rate-limit window means retrying would not help soon: the preview ends as failed. */
export const MAX_RETRY_WAIT_SEC = 60;

export type PreviewFetchResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly status: number; readonly code?: string; readonly retryAfterSec?: number };
/** Fetches one preview. Rejects when the connection fails or the signal aborts it. */
export type PreviewFetcher<T> = (path: string, signal: AbortSignal) => Promise<PreviewFetchResult<T>>;
export type PreviewEnd = "expired" | "unsupported" | "failed";
export type PreviewOutcome<T> = { readonly kind: "loaded"; readonly value: T } | { readonly kind: PreviewEnd };

export interface PreviewRequest {
  /** Drops the request: a waiting one never starts, a running one is aborted. Its callback never runs. */
  cancel(): void;
  /** True until its fetch starts, and again while it waits to be retried. */
  readonly waiting: boolean;
}

export interface PreviewQueue<T> {
  /** Queues one preview. `done` runs once with the outcome, unless the request is cancelled first. */
  request(path: string, done: (outcome: PreviewOutcome<T>) => void): PreviewRequest;
  /** The result's tickets have expired: waiting requests end as expired and nothing new starts. */
  expire(): void;
  /** Drops every request without calling back (the list was replaced or left). */
  close(): void;
  /** Fetches in flight, including aborted ones that have not settled yet. */
  readonly running: number;
  readonly waiting: number;
}

export interface PreviewQueueOptions<T> {
  readonly fetchPreview: PreviewFetcher<T>;
  /** When the result's tickets expire (ms since the epoch). NaN or a past time means nothing starts. */
  readonly expiresAtMs: number;
  readonly now?: () => number;
  readonly setTimer?: (run: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
  readonly maxConcurrent?: number;
  readonly maxAttempts?: number;
  /** Runs once, when the queue learns that the tickets have expired (a 410, the clock, or expire()). */
  readonly onExpired?: () => void;
  /**
   * A 429 made every preview wait until this time (ms since the epoch); null once the queue starts again. A later
   * 429 during the wait reports the new end. Not called after expiry or close.
   */
  readonly onRateLimitWait?: (untilMs: number | null) => void;
}

function hint(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.ceil(value) : undefined;
}

/** Seconds to wait before trying a failed preview again, or null when it must not be retried. */
export function previewRetryDelaySec(failure: { readonly status: number; readonly code?: string; readonly retryAfterSec?: number }): number | null {
  let delay: number;
  if (failure.status === 429) delay = hint(failure.retryAfterSec) ?? RATE_LIMIT_RETRY_SEC;
  else if (failure.status === 503 && failure.code !== "PAUSED") delay = hint(failure.retryAfterSec) ?? BUSY_RETRY_SEC;
  else return null;
  return delay <= MAX_RETRY_WAIT_SEC ? delay : null;
}

/** How a preview that is not retried ends: 410 expired, 415 cannot be previewed, anything else failed. */
export function previewFailureEnd(status: number): PreviewEnd {
  return status === 410 ? "expired" : status === 415 ? "unsupported" : "failed";
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`);
  return value;
}

interface Job<T> {
  readonly path: string;
  readonly done: (outcome: PreviewOutcome<T>) => void;
  attempts: number;
  state: "waiting" | "running" | "finished";
  controller: AbortController | null;
}

export function createPreviewQueue<T>(options: PreviewQueueOptions<T>): PreviewQueue<T> {
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? ((run: () => void, ms: number) => setTimeout(run, ms));
  const clearTimer = options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const maxConcurrent = positiveInteger(options.maxConcurrent ?? PREVIEW_MAX_CONCURRENT, "maxConcurrent");
  const maxAttempts = positiveInteger(options.maxAttempts ?? PREVIEW_MAX_ATTEMPTS, "maxAttempts");
  const waiting: Job<T>[] = [];
  const active = new Set<Job<T>>();
  let running = 0;
  let pausedUntil = Number.NEGATIVE_INFINITY;
  /** The end of the current wait caused by a 429, or null when there is none. */
  let rateWaitUntil: number | null = null;
  let wake: { handle: unknown } | null = null;
  let expired = false;
  let closed = false;

  function finish(job: Job<T>, outcome: PreviewOutcome<T>) {
    if (job.state === "finished") return;
    job.state = "finished";
    job.done(outcome);
  }

  function markExpired() {
    if (expired || closed) return;
    expired = true;
    for (const job of waiting.splice(0)) finish(job, { kind: "expired" });
    options.onExpired?.();
  }

  function scheduleWake(at: number) {
    if (wake) return;
    const timer: { handle: unknown } = { handle: null };
    wake = timer;
    timer.handle = setTimer(() => {
      if (wake === timer) wake = null;
      pump();
    }, Math.max(0, at - now()));
  }

  function pump() {
    if (closed || expired) return;
    const at = now();
    // Written as "not before" so that a NaN expiry also counts as expired.
    if (!(at < options.expiresAtMs)) { markExpired(); return; }
    if (rateWaitUntil !== null && at >= rateWaitUntil) {
      rateWaitUntil = null;
      options.onRateLimitWait?.(null);
    }
    if (waiting.length === 0) return;
    if (at < pausedUntil) { scheduleWake(pausedUntil); return; }
    while (running < maxConcurrent && waiting.length > 0) start(waiting.shift()!);
  }

  function retryOrEnd(job: Job<T>, failure: Extract<PreviewFetchResult<T>, { ok: false }>) {
    if (failure.status === 410) { finish(job, { kind: "expired" }); markExpired(); return; }
    const delay = previewRetryDelaySec(failure);
    if (delay === null || job.attempts >= maxAttempts) { finish(job, { kind: previewFailureEnd(failure.status) }); return; }
    job.state = "waiting";
    waiting.unshift(job);
    pausedUntil = Math.max(pausedUntil, now() + delay * 1000);
    if (failure.status === 429 && rateWaitUntil !== pausedUntil) {
      rateWaitUntil = pausedUntil;
      options.onRateLimitWait?.(pausedUntil);
    }
  }

  function start(job: Job<T>) {
    const controller = new AbortController();
    job.state = "running";
    job.attempts += 1;
    job.controller = controller;
    running += 1;
    active.add(job);
    let settled = false;
    const settle = () => {
      if (settled) return false;
      settled = true;
      running -= 1;
      active.delete(job);
      // A job cancelled or closed while in flight ends here without a callback.
      return job.state === "running" && job.controller === controller;
    };
    let fetching: Promise<PreviewFetchResult<T>>;
    try { fetching = options.fetchPreview(job.path, controller.signal); } catch (error) { fetching = Promise.reject(error); }
    fetching.then(result => {
      if (settle()) {
        job.controller = null;
        if (result.ok) finish(job, { kind: "loaded", value: result.value });
        else retryOrEnd(job, result);
      }
      pump();
    }, () => {
      if (settle()) { job.controller = null; finish(job, { kind: "failed" }); }
      pump();
    });
  }

  return {
    request(path, done) {
      const job: Job<T> = { path, done, attempts: 0, state: "waiting", controller: null };
      const handle: PreviewRequest = {
        get waiting() { return job.state === "waiting"; },
        cancel() {
          if (job.state === "waiting") {
            const index = waiting.indexOf(job);
            if (index >= 0) waiting.splice(index, 1);
          } else if (job.state === "running") {
            job.controller?.abort();
          }
          job.state = "finished";
        },
      };
      if (closed) { job.state = "finished"; return handle; }
      if (expired) { finish(job, { kind: "expired" }); return handle; }
      waiting.push(job);
      pump();
      return handle;
    },
    expire() {
      markExpired();
    },
    close() {
      if (closed) return;
      closed = true;
      if (wake) { clearTimer(wake.handle); wake = null; }
      for (const job of waiting.splice(0)) job.state = "finished";
      for (const job of active) { job.state = "finished"; job.controller?.abort(); }
    },
    get running() { return running; },
    get waiting() { return waiting.length; },
  };
}
