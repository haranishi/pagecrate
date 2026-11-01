/**
 * Thin adapters from the Worker env to the guard's ports. Each one throws when it cannot give a clear answer, and
 * the guard turns a throw into a closed BUSY reply. They never log, and they never send or keep the client address:
 * siteverify gets the secret and the token only.
 */
import type { BotVerifier, GuardContext, GuardDeps, RateLimiterPort, RenderReserver } from "./guard";
import { readOpsConfig, type OpsEnv } from "./ops-config";

export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** Must equal ratelimits[].simple.period in wrangler.jsonc (Cloudflare accepts 10 or 60); a test compares them. */
export const RATE_LIMIT_PERIOD_SEC = { scan: 60, preview: 60, download: 60 } as const;
/** The one global daily counter (BudgetGate Durable Object). */
export const BUDGET_GATE_NAME = "global";
const SITEVERIFY_TIMEOUT_MS = 5000;
const SITEVERIFY_MAX_BYTES = 16 * 1024;
const RATE_LIMIT_TIMEOUT_MS = 3000;
const BUDGET_TIMEOUT_MS = 5000;

export interface RateLimitBinding { limit(options: { key: string }): Promise<unknown> }
export interface BudgetNamespace { getByName(name: string): { reserve(day: string, cap: number): Promise<unknown> } }
export type GuardEnv = OpsEnv & {
  readonly SCAN_LIMITER?: RateLimitBinding;
  readonly PREVIEW_LIMITER?: RateLimitBinding;
  readonly DOWNLOAD_LIMITER?: RateLimitBinding;
  readonly BUDGET_GATE?: BudgetNamespace;
  readonly PAGECRATE_TURNSTILE_SECRET?: string;
  readonly PAGECRATE_TICKET_SECRET?: string;
};

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("dependency timed out")), milliseconds); })]);
  } finally {
    clearTimeout(timer);
  }
}

export function rateLimiterPort(binding: RateLimitBinding | undefined, periodSec: number): RateLimiterPort {
  return {
    periodSec,
    async limit(key) {
      if (!binding) throw new Error("rate-limit binding missing");
      const outcome = await withTimeout(binding.limit({ key }), RATE_LIMIT_TIMEOUT_MS);
      const success = typeof outcome === "object" && outcome !== null ? (outcome as { success?: unknown }).success : undefined;
      if (typeof success !== "boolean") throw new Error("rate-limit answer malformed");
      return success;
    },
  };
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("siteverify answer too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Turnstile server-side validation. Null when the secret is missing (the guard then keeps live fetching closed).
 * A well-formed answer is returned as is for the guard to judge; transport errors, non-200, redirects and
 * malformed or oversized answers throw. `fetchImpl` is injectable so tests stay offline.
 */
export function createTurnstileVerifier(secret: string | undefined, fetchImpl: typeof fetch = fetch, timeoutMs = SITEVERIFY_TIMEOUT_MS): BotVerifier | null {
  if (typeof secret !== "string" || secret.trim() === "") return null;
  return async token => {
    const response = await fetchImpl(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      redirect: "manual",
      cache: "no-store",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== 200 || !(response.headers.get("content-type") ?? "").includes("application/json")) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("siteverify unavailable");
    }
    const data: unknown = JSON.parse(await readCapped(response, SITEVERIFY_MAX_BYTES));
    if (typeof data !== "object" || data === null || typeof (data as { success?: unknown }).success !== "boolean") throw new Error("siteverify answer malformed");
    const { success, hostname, action } = data as { success: boolean; hostname?: unknown; action?: unknown };
    return { success, hostname: typeof hostname === "string" ? hostname : undefined, action: typeof action === "string" ? action : undefined };
  };
}

export function budgetReserver(namespace: BudgetNamespace | undefined): RenderReserver {
  return async (day, cap) => {
    if (!namespace) throw new Error("budget binding missing");
    return await withTimeout(namespace.getByName(BUDGET_GATE_NAME).reserve(day, cap), BUDGET_TIMEOUT_MS);
  };
}

export function guardDepsFromEnv(env: GuardEnv, fetchImpl: typeof fetch = fetch): GuardDeps {
  return {
    limiters: {
      scan: rateLimiterPort(env.SCAN_LIMITER, RATE_LIMIT_PERIOD_SEC.scan),
      preview: rateLimiterPort(env.PREVIEW_LIMITER, RATE_LIMIT_PERIOD_SEC.preview),
      download: rateLimiterPort(env.DOWNLOAD_LIMITER, RATE_LIMIT_PERIOD_SEC.download),
    },
    verifyBot: createTurnstileVerifier(env.PAGECRATE_TURNSTILE_SECRET, fetchImpl),
    reserveRender: budgetReserver(env.BUDGET_GATE),
  };
}

export function guardContextFromEnv(env: GuardEnv, options: { readonly fetch?: typeof fetch; readonly now?: () => number } = {}): GuardContext {
  return {
    config: readOpsConfig(env),
    deps: guardDepsFromEnv(env, options.fetch ?? fetch),
    secret: env.PAGECRATE_TICKET_SECRET,
    now: options.now ?? Date.now,
  };
}

/** For API routes running on OpenNext: reads the bindings of the current request. */
export async function cloudflareGuardContext(): Promise<GuardContext> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  return guardContextFromEnv(getCloudflareContext().env);
}
