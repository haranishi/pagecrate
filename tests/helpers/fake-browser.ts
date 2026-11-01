import type { ScanBrowser, ScanLauncher } from "../../src/lib/scanner";

// The scanner's narrow browser surface, derived from its exported types.
type ScanContext = Awaited<ReturnType<ScanBrowser["newContext"]>>;
type RouteHandler = Parameters<ScanContext["route"]>[1];
type ScanPage = Awaited<ReturnType<ScanContext["newPage"]>>;

export interface FakeRequest { readonly url: string; readonly resourceType?: string; readonly method?: string; readonly navigation?: boolean }
export interface FakeDomItem { readonly url: string; readonly source: string; readonly kind?: "image" | "video"; readonly width?: number; readonly height?: number }
export interface FakePageScript {
  /** Requests the page makes while it loads; each one runs through the scanner's route handler (and its fetcher). */
  readonly requests?: readonly FakeRequest[];
  /** What the scanner's DOM script reports; relative URLs resolve against the page URL. */
  readonly items?: readonly FakeDomItem[];
  /** Runs inside goto after the requests, e.g. to fire the 40-second deadline mid-render. */
  readonly duringLoad?: () => void;
}
export interface FakeBrowserLog { launched: number; closed: number; readonly fulfilled: string[]; readonly aborted: string[] }

/** A browser stand-in: no Chromium, no network. A closed context fails every later call, like Playwright. */
export function fakeLauncher(script: FakePageScript = {}): { readonly launcher: ScanLauncher; readonly log: FakeBrowserLog } {
  const log: FakeBrowserLog = { launched: 0, closed: 0, fulfilled: [], aborted: [] };
  const launcher: ScanLauncher = async () => {
    log.launched += 1;
    let handler: RouteHandler | undefined;
    let closed = false;
    let pageUrl = "";
    const alive = () => { if (closed) throw new Error("Target page, context or browser has been closed"); };
    const page: ScanPage = {
      async goto(url) {
        pageUrl = url;
        for (const request of script.requests ?? []) {
          alive();
          await handler?.({
            request: () => ({ url: () => request.url, method: () => request.method ?? "GET", resourceType: () => request.resourceType ?? "image", isNavigationRequest: () => request.navigation ?? false }),
            abort: async () => { log.aborted.push(request.url); },
            fulfill: async () => { log.fulfilled.push(request.url); },
          });
        }
        script.duringLoad?.();
        alive();
        return null;
      },
      async evaluate(code) {
        alive();
        return typeof code === "string" ? { title: "Fixture page", base: pageUrl, items: script.items ?? [] } : undefined;
      },
      async waitForTimeout() { alive(); },
      async close() {},
      on: () => undefined,
    };
    const context: ScanContext = {
      async newPage() { return page; },
      async route(_pattern, routeHandler) { handler = routeHandler; },
      async routeWebSocket() {},
      async setOffline() {},
      async addInitScript() {},
      on: () => undefined,
      async close() { closed = true; },
    };
    return { async newContext() { return context; }, async close() { log.closed += 1; } };
  };
  return { launcher, log };
}
