import type { ScanBrowser } from "./scanner";

declare global {
  interface CloudflareEnv {
    /** Request-local factory supplied by worker.ts, not a secret or Wrangler service binding. */
    PAGECRATE_BROWSER_LAUNCH?: (signal: AbortSignal) => Promise<ScanBrowser>;
  }
}
