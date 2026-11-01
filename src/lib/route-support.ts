/**
 * Wiring shared by the API handlers (scan, preview, download). The route files hand in the real dependencies, tests
 * hand in fakes. Nothing here logs or keeps a URL, a ticket or the client address.
 */
import { apiError, apiErrorResponse } from "./api";
import { createBlockedHostMatcher, DEPENDENCY_RETRY_SEC, type GuardContext } from "./guard";
import type { safeFetch } from "./safe-fetch";

export type SafeFetcher = typeof safeFetch;
/** The guard settings, bindings and ticket key of the current request. */
export type ContextSource = () => GuardContext | Promise<GuardContext>;

/** Null when the request context cannot be read (no Cloudflare runtime): the caller then closes with BUSY. */
export async function loadContext(source: ContextSource): Promise<GuardContext | null> {
  try { return await source(); } catch { return null; }
}

export function dependencyBusyResponse(): Response {
  return apiErrorResponse(apiError("BUSY", { retryAfterSec: DEPENDENCY_RETRY_SEC }));
}

/** The operator blocklist the guard judged with, as the predicate safe-fetch asks before each connection and redirect. */
export function blockedHostPredicate(ctx: GuardContext): (host: string) => boolean {
  return createBlockedHostMatcher(ctx.config.blockedHosts).isBlocked;
}

/**
 * A fetcher that passes the blocklist on every call, so the first URL and every redirect target are checked.
 * The base fetcher is created on first use only: built-in demo content never constructs one.
 */
export function blocklistFetcher(createFetcher: () => SafeFetcher, isBlockedHost: (host: string) => boolean): SafeFetcher {
  let base: SafeFetcher | undefined;
  return async (input, options = {}) => (base ??= createFetcher())(input, { ...options, isBlockedHost });
}
