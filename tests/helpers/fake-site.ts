import { createSafeFetcher, type SafeResponse } from "../../src/lib/safe-fetch";

export type FakeRoute = Partial<SafeResponse> & { readonly location?: string; readonly throws?: Error };
export const JPEG = Buffer.from([255, 216, 255, 224, 0, 16]);
export function png(bytes = 100): Buffer {
  const body = Buffer.alloc(bytes); body.set([137, 80, 78, 71, 13, 10, 26, 10]); return body;
}

/**
 * Safe fetcher over an offline fake site: the real redirect, blocklist and address checks of safe-fetch run, and
 * nothing leaves the process. Unknown URLs answer 404; `location` answers a 302.
 */
export function fakeSite(routes: Record<string, FakeRoute>, onFetch?: (href: string) => void) {
  const fetched: string[] = [];
  const resolved: string[] = [];
  const fetcher = createSafeFetcher(async host => { resolved.push(host); return [{ address: "8.8.8.8", family: 4 }]; }, async (url): Promise<SafeResponse> => {
    fetched.push(url.href);
    onFetch?.(url.href);
    const route = routes[url.href];
    if (!route) return { status: 404, headers: { "content-type": "text/plain" }, body: Buffer.from("missing"), url: url.href };
    if (route.throws) throw route.throws;
    if (route.location) return { status: 302, headers: { location: route.location }, body: Buffer.alloc(0), url: url.href };
    return { status: route.status ?? 200, headers: route.headers ?? { "content-type": "image/jpeg" }, body: route.body ?? JPEG, url: url.href };
  });
  let created = 0;
  return { createFetcher: () => { created += 1; return fetcher; }, fetched, resolved, created: () => created };
}

/** Runs `run` with every console output captured; returns what would have been printed. */
export async function capturingConsole(run: () => Promise<void>): Promise<unknown[][]> {
  const methods = ["log", "info", "warn", "error", "debug", "trace"] as const;
  const consoleRecord = console as unknown as Record<string, unknown>;
  const original = methods.map(name => [name, consoleRecord[name]] as const);
  const printed: unknown[][] = [];
  for (const name of methods) consoleRecord[name] = (...args: unknown[]) => { printed.push(args); };
  try { await run(); } finally { for (const [name, method] of original) consoleRecord[name] = method; }
  return printed;
}
