/**
 * Response headers that next.config.ts sets for every path. Pure, so tests read exactly what the config returns.
 *
 * The Content-Security-Policy goes to production builds only: `next dev` reloads through eval and its own scripts.
 * Next's start-up scripts are inline, hence script-src 'unsafe-inline'; nonces are not used, since they would need a
 * per-request rendering pipeline for that alone. Previews and ZIPs come back as blob: URLs, so img-src and media-src
 * allow blob:.
 *
 * Every page sends the same policy, and that policy allows Cloudflare Turnstile. A policy belongs to the document the
 * browser loaded first: a next/link to /app swaps the screen inside that document and loads no new one, so a policy
 * given to /app alone never reaches a visitor who came from the top page, the demo or a document page, and their bot
 * check would be refused (independent review P1). So the bot check is allowed whichever page the visitor came from.
 * Allowing it loads nothing: the script is still added only when a page scan starts (components/turnstile-widget.tsx).
 * Turnstile's origin goes only to the two directives Cloudflare's CSP reference asks for, script-src and frame-src.
 * connect-src stays 'self': Turnstile needs it only for pre-clearance, which this app does not use.
 *
 * The policy is for pages, not for /api/: on the Workers runtime a header from these rules replaces the one a route
 * sets, and the preview route sends its own stricter policy (default-src 'none'; sandbox) for images opened directly.
 */
import { TURNSTILE_SCRIPT_URL } from "./turnstile-client";

export const TURNSTILE_ORIGIN = new URL(TURNSTILE_SCRIPT_URL).origin;
/** Every path outside /api/ (path-to-regexp, as next.config.ts headers take it). */
export const PAGES_SOURCE = "/((?!api/).*)";

export interface HeaderRule {
  readonly source: string;
  readonly headers: readonly { readonly key: string; readonly value: string }[];
}

type Directives = ReadonlyArray<readonly [name: string, sources: readonly string[]]>;

const PAGE_POLICY: Directives = [
  ["default-src", ["'self'"]],
  ["script-src", ["'self'", "'unsafe-inline'", TURNSTILE_ORIGIN]],
  ["style-src", ["'self'", "'unsafe-inline'"]],
  ["img-src", ["'self'", "data:", "blob:"]],
  ["media-src", ["'self'", "blob:"]],
  ["connect-src", ["'self'"]],
  ["frame-src", [TURNSTILE_ORIGIN]],
  ["object-src", ["'none'"]],
  ["base-uri", ["'self'"]],
  ["form-action", ["'self'"]],
  ["frame-ancestors", ["'none'"]],
];

/** The policy of every page (all of them, so that moving between them inside one document keeps the bot check). */
export function contentSecurityPolicy(): string {
  return PAGE_POLICY.map(([name, sources]) => `${name} ${sources.join(" ")}`).join("; ");
}

const COMMON_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
] as const;

/** The rules in the order Next.js applies them: the headers of every path, then the policy of every page. */
export function securityHeaderRules(production: boolean): HeaderRule[] {
  const common: HeaderRule = { source: "/:path*", headers: [...COMMON_HEADERS] };
  if (!production) return [common];
  return [common, { source: PAGES_SOURCE, headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy() }] }];
}
