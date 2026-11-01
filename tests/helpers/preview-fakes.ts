import type { PreviewFetchResult, PreviewFetcher } from "../../src/lib/preview-queue";

/** Lets pending promise callbacks run. */
export const flush = () => new Promise<void>(resolve => setImmediate(resolve));

/** A clock and timers the test moves by hand. */
export function fakeClock(start = 1_000_000) {
  let time = start;
  let nextId = 1;
  const timers = new Map<number, { at: number; run: () => void }>();
  return {
    now: () => time,
    setTimer: (run: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { at: time + Math.max(0, ms), run });
      return id;
    },
    clearTimer: (handle: unknown) => { timers.delete(handle as number); },
    get pendingTimers() { return timers.size; },
    /** Moves the clock forward, running each due timer at its own time. */
    async advance(ms: number) {
      const end = time + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        time = due[1].at;
        due[1].run();
        await flush();
      }
      time = end;
      await flush();
    },
  };
}

export interface FakeCall {
  readonly path: string;
  readonly signal: AbortSignal;
  answer(result: PreviewFetchResult<string>): Promise<void>;
  fail(): Promise<void>;
  readonly settled: boolean;
}

/** A preview fetcher whose calls the test answers one by one. It counts fetches in flight. */
export function fakeFetcher() {
  const calls: FakeCall[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchPreview: PreviewFetcher<string> = (path, signal) => new Promise((resolve, reject) => {
    let settled = false;
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const end = () => { if (settled) return false; settled = true; inFlight -= 1; return true; };
    signal.addEventListener("abort", () => { if (end()) reject(new DOMException("aborted", "AbortError")); }, { once: true });
    calls.push({
      path, signal,
      get settled() { return settled; },
      async answer(result) { if (end()) resolve(result); await flush(); },
      async fail() { if (end()) reject(new TypeError("Failed to fetch")); await flush(); },
    });
  });
  return {
    fetchPreview, calls,
    get inFlight() { return inFlight; },
    get maxInFlight() { return maxInFlight; },
    paths: () => calls.map(call => call.path),
  };
}

export const loaded = (value: string): PreviewFetchResult<string> => ({ ok: true, value });
export const failure = (status: number, code?: string, retryAfterSec?: number): PreviewFetchResult<string> => ({
  ok: false, status, ...(code === undefined ? {} : { code }), ...(retryAfterSec === undefined ? {} : { retryAfterSec }),
});
