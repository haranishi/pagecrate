/**
 * Request guards for the public API. Every check fails closed: a refused or failing step answers with a typed
 * ApiError and nothing is fetched, rendered or counted. The guard never logs, and it never returns or keeps the
 * target URL, a ticket or the client address. Outside contacts (rate-limit bindings, Turnstile, the daily counter)
 * come in through GuardDeps; the real adapters live in guard-adapters.ts.
 */
import ipaddr from "ipaddr.js";
import { apiError, assertLocalRequest, readJsonBody, DEFAULT_BODY_MAX_BYTES, DOWNLOAD_BODY_MAX_BYTES, type ApiError, type ApiErrorCode } from "./api";
import { utcDay } from "./budget-gate";
import { clientNetwork } from "./client-network";
import type { OpsConfig } from "./ops-config";
import { createTicketCodec, TICKET_SECRET_MIN_BYTES, type TicketClaims, type TicketKind } from "./ticket";
import { nonPublicReason, parseHttpUrl } from "./url-policy";

export type GuardFailure = { readonly ok: false; readonly error: ApiError };
/** design-contracts.md: the result of a guard that lets a request through carries its rate-limit key. */
export type GuardResult = { readonly ok: true; readonly clientKey: string } | GuardFailure;
/** The demo ends before the rate limit, so its success has no client key: the address is not even read. */
export type ScanGuardResult =
  | { readonly ok: true; readonly demo: true }
  | { readonly ok: true; readonly demo: false; readonly clientKey: string; readonly url: string }
  | GuardFailure;
export type TicketRoute = "preview" | "download";
export type TicketGuardResult =
  | { readonly ok: true; readonly clientKey: string; readonly claims: readonly TicketClaims[]; readonly demo: boolean }
  | GuardFailure;

export type RateLimitRoute = "scan" | TicketRoute;
export interface RateLimiterPort {
  /** True when the request may go on. Throws when the limiter cannot answer. */
  limit(key: string): Promise<boolean>;
  /** Window of the binding in seconds (wrangler.jsonc), given back as the retry hint. */
  readonly periodSec: number;
}
export interface BotCheckOutcome { readonly success: boolean; readonly hostname?: string; readonly action?: string }
export type BotVerifier = (token: string) => Promise<BotCheckOutcome>;
/** Reserves one render for the UTC day under the cap. The answer crosses RPC, so the guard checks its shape. */
export type RenderReserver = (day: string, cap: number) => Promise<unknown>;
export interface GuardDeps {
  readonly limiters: Readonly<Record<RateLimitRoute, RateLimiterPort>>;
  /** Null when the bot-check secret is missing: live fetching then stays closed. */
  readonly verifyBot: BotVerifier | null;
  readonly reserveRender: RenderReserver;
}
export interface GuardContext {
  readonly config: OpsConfig;
  readonly deps: GuardDeps;
  /** PAGECRATE_TICKET_SECRET: verifies tickets and keys the daily salt of the client key. */
  readonly secret: string | undefined;
  readonly now?: () => number;
}

/** Retry hint when a dependency fails (decided in chapter 1). */
export const DEPENDENCY_RETRY_SEC = 30;
export const MAX_DOWNLOAD_TICKETS = 50;
/** The widget must send this action; siteverify reports it back. */
export const TURNSTILE_ACTION = "scan";
export const CLIENT_KEY_LENGTH = 16;
const TURNSTILE_TOKEN_MAX_CHARS = 2048;
const SALT_LABEL = "pagecrate/client-key/v1/";
const encoder = new TextEncoder();

function fail(code: ApiErrorCode, extra: { readonly message?: string; readonly retryAfterSec?: number } = {}): GuardFailure {
  return { ok: false, error: apiError(code, extra) };
}
/** A failing dependency is reported as BUSY (503) with a 30-second hint; no fetch, render or count follows. */
function dependencyFailure(): GuardFailure {
  return fail("BUSY", { retryAfterSec: DEPENDENCY_RETRY_SEC });
}

function usableSecret(secret: string | undefined): secret is string {
  return typeof secret === "string" && encoder.encode(secret).byteLength >= TICKET_SECRET_MIN_BYTES;
}

async function hmac(key: Uint8Array<ArrayBuffer>, message: string): Promise<Uint8Array<ArrayBuffer>> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message)));
}

/**
 * Rate-limit key: HMAC(daily salt, client network), first 16 hex digits. The client network is cf-connecting-ip as an
 * IPv4 address or an IPv6 /64 (client-network.ts), so one /64 is one client. The salt is HMAC(secret, label + UTC day),
 * so keys change at 00:00 UTC and cannot be tied to a network without the secret. Neither the address nor the network
 * is kept or returned.
 */
export async function deriveClientKey(request: Request, secret: string, nowMs: number): Promise<string> {
  if (!usableSecret(secret)) throw new RangeError("the client key needs a secret of at least 32 bytes");
  const salt = await hmac(encoder.encode(secret), SALT_LABEL + utcDay(nowMs));
  const digest = await hmac(salt, clientNetwork(request.headers.get("cf-connecting-ip")));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("").slice(0, CLIENT_KEY_LENGTH);
}

/** Seconds until the next 00:00 UTC (09:00 in Japan), when the daily render count restarts. */
export function secondsUntilNextUtcDay(nowMs: number): number {
  const now = new Date(nowMs);
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - nowMs) / 1000));
}

/** An IPv4-mapped IPv6 literal (::ffff:a.b.c.d) is the IPv4 address it carries; any other host is returned as is. */
function unmappedHost(host: string): string {
  if (!host.includes(":")) return host;
  try {
    const address = ipaddr.IPv6.parse(host);
    return address.isIPv4MappedAddress() ? address.toIPv4Address().toString() : host;
  } catch {
    return host;
  }
}

/**
 * Lowercase ASCII host (IDN as punycode, IPv4 canonical, IPv4-mapped IPv6 as IPv4), without IPv6 brackets or trailing
 * dots; null if not a host.
 */
function canonicalHost(value: string): string | null {
  let text = value.trim().toLowerCase();
  if (text.startsWith("[") && text.endsWith("]")) text = text.slice(1, -1);
  text = text.replace(/\.+$/, "");
  if (text === "" || /[\s/\\?#@]/.test(text)) return null;
  let url: URL;
  try { url = new URL(`http://${text.includes(":") ? `[${text}]` : text}/`); } catch { return null; }
  if (url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
  return unmappedHost(url.hostname.replace(/^\[|\]$/g, "").replace(/\.+$/, ""));
}
function isIpLiteral(host: string): boolean {
  return host.includes(":") || /^\d+(?:\.\d+){3}$/.test(host);
}

export interface BlockedHostMatcher {
  /** False when an entry is not a plain host name: every host is then blocked and live fetching is closed. */
  readonly valid: boolean;
  /** True for a listed host and its subdomains (label boundary). A host that cannot be read counts as blocked. */
  readonly isBlocked: (host: string) => boolean;
}

/**
 * Operator blocklist (PAGECRATE_BLOCKED_HOSTS). An entry covers the host and every subdomain; a leading "*." or "."
 * means the same. Case, trailing dots, IDN spelling and IPv6 brackets do not matter; IP entries match exactly, and an
 * IPv4 address and its IPv4-mapped IPv6 form ([::ffff:a.b.c.d]) count as the same host, on either side.
 */
export function createBlockedHostMatcher(entries: readonly string[]): BlockedHostMatcher {
  const hosts: string[] = [];
  let valid = true;
  for (const entry of entries) {
    const host = canonicalHost(entry.trim().replace(/^\*?\./, ""));
    if (host === null || (!isIpLiteral(host) && !/^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/.test(host))) valid = false;
    else hosts.push(host);
  }
  return {
    valid,
    isBlocked: host => {
      if (!valid) return true;
      const target = canonicalHost(host);
      if (target === null) return true;
      return hosts.some(entry => target === entry || (!isIpLiteral(entry) && target.endsWith(`.${entry}`)));
    },
  };
}

/** Origin check of the existing routes. If the public origin is not usable, the service counts as closed. */
function checkOrigin(request: Request, mutation: boolean, config: OpsConfig): GuardFailure | null {
  try {
    assertLocalRequest(request, mutation, config.publicOrigin);
    return null;
  } catch {
    return config.publicOrigin.state === "valid" ? fail("FORBIDDEN") : fail("PAUSED");
  }
}

function budgetAnswer(value: unknown): "ALLOWED" | "CAP_REACHED" | "CLOSED" | "FAILED" {
  if (typeof value !== "object" || value === null) return "FAILED";
  const { allowed, used, reason } = value as { allowed?: unknown; used?: unknown; reason?: unknown };
  if (allowed === true && Number.isSafeInteger(used)) return "ALLOWED";
  if (allowed === false && reason === "CAP_REACHED") return "CAP_REACHED";
  if (allowed === false && reason === "CLOSED") return "CLOSED";
  // STORE_FAILED, INVALID_DAY or an unknown answer: never render on a counter we cannot trust.
  return "FAILED";
}

/**
 * POST /api/scan: Origin → (demo: done) → pause and closed settings → SCAN_LIMITER → bot check (token, success,
 * hostname of the public origin, action) → URL syntax → blocklist → non-public target by syntax (IP literal, internal
 * host name, port) → daily cap (one render reserved per UTC day). Host names are resolved later, by safe-fetch.
 */
export async function guardScan(request: Request, ctx: GuardContext): Promise<ScanGuardResult> {
  const originFailure = checkOrigin(request, true, ctx.config);
  if (originFailure) return originFailure;
  try {
    const body = await readJsonBody(request, DEFAULT_BODY_MAX_BYTES);
    if (!body.ok) return body.reason === "TOO_LARGE" ? fail("LIMIT_EXCEEDED") : fail("INVALID_URL");
    const input = body.value;
    // The demo never leaves the Worker: no pause, rate limit, bot check or daily cap.
    if (input.demo === true) return { ok: true, demo: true };
    const { config, deps } = ctx;
    const { secret } = ctx;
    const verifyBot = deps.verifyBot;
    const matcher = createBlockedHostMatcher(config.blockedHosts);
    if (config.paused || !config.liveFetchOpen || config.publicOrigin.state !== "valid" || !matcher.valid || verifyBot === null || !usableSecret(secret)) return fail("PAUSED");
    const expectedHostname = new URL(config.publicOrigin.origin).hostname;
    const at = (ctx.now ?? Date.now)();
    const clientKey = await deriveClientKey(request, secret, at);
    const limiter = deps.limiters.scan;
    if (!await limiter.limit(clientKey)) return fail("RATE_LIMITED", { retryAfterSec: limiter.periodSec });
    const token = input.turnstileToken;
    if (typeof token !== "string" || token.length === 0 || token.length > TURNSTILE_TOKEN_MAX_CHARS) return fail("BOT_CHECK_FAILED");
    const outcome = await verifyBot(token);
    if (outcome.success !== true || outcome.hostname !== expectedHostname || outcome.action !== TURNSTILE_ACTION) return fail("BOT_CHECK_FAILED");
    const parsed = parseHttpUrl(input.url);
    if (!parsed.ok) return fail("INVALID_URL");
    const { url } = parsed;
    if (matcher.isBlocked(url.hostname)) return fail("BLOCKED_HOST");
    // Refused before the daily cap, so an internal target never uses up a render.
    if (nonPublicReason(url) !== null) return fail("PRIVATE_ADDRESS");
    url.hash = "";
    switch (budgetAnswer(await deps.reserveRender(utcDay(at), config.dailyRenderCap))) {
      case "ALLOWED": return { ok: true, demo: false, clientKey, url: url.href };
      case "CAP_REACHED": return fail("DAILY_CAP_REACHED", { retryAfterSec: secondsUntilNextUtcDay(at) });
      case "CLOSED": return fail("PAUSED");
      case "FAILED": return dependencyFailure();
    }
  } catch {
    // Any thrown dependency closes the request; the error itself may name the URL, so it is dropped unread.
    return dependencyFailure();
  }
}

type ExtractedTickets = { readonly ok: true; readonly tickets: readonly unknown[] } | { readonly ok: false; readonly failure: GuardFailure };

function previewTickets(request: Request): ExtractedTickets {
  const values = new URL(request.url).searchParams.getAll("t");
  return values.length === 1 ? { ok: true, tickets: values } : { ok: false, failure: fail("INVALID_TICKET") };
}

async function downloadTickets(request: Request): Promise<ExtractedTickets> {
  const body = await readJsonBody(request, DOWNLOAD_BODY_MAX_BYTES);
  if (!body.ok) return { ok: false, failure: body.reason === "TOO_LARGE" ? fail("LIMIT_EXCEEDED") : fail("INVALID_TICKET") };
  const tickets = body.value.tickets;
  if (!Array.isArray(tickets) || tickets.length === 0) return { ok: false, failure: fail("INVALID_TICKET") };
  if (tickets.length > MAX_DOWNLOAD_TICKETS) return { ok: false, failure: fail("LIMIT_EXCEEDED", { message: "一度に保存できるのは50件までです。選ぶ素材を減らして、もう一度お試しください。" }) };
  return { ok: true, tickets };
}

/**
 * GET /api/preview?t= and POST /api/download {tickets}: Origin (GET keeps the existing same-origin rule) → ticket
 * verification → pause and closed settings unless every ticket is a demo → PREVIEW_LIMITER or DOWNLOAD_LIMITER →
 * blocklist for live tickets. No bot check and no daily cap.
 */
export async function guardTicketRoute(request: Request, route: TicketRoute, ctx: GuardContext): Promise<TicketGuardResult> {
  const originFailure = checkOrigin(request, route === "download", ctx.config);
  if (originFailure) return originFailure;
  try {
    const at = (ctx.now ?? Date.now)();
    const extracted = route === "preview" ? previewTickets(request) : await downloadTickets(request);
    if (!extracted.ok) return extracted.failure;
    const { secret } = ctx;
    const created = await createTicketCodec(secret, { now: () => at });
    if (!created.ok || !usableSecret(secret)) return fail("PAUSED");
    const kinds: readonly TicketKind[] = route === "preview" ? ["image"] : ["image", "video"];
    const results = await Promise.all(extracted.tickets.map(ticket => created.codec.verify(ticket, kinds)));
    const claims: TicketClaims[] = [];
    let expired = false;
    for (const result of results) {
      if (result.ok) claims.push(result.claims);
      else if (result.code === "EXPIRED") expired = true;
      else return fail("INVALID_TICKET");
    }
    // A forged ticket outranks an expired one, as in the codec itself.
    if (expired) return fail("EXPIRED");
    const demo = claims.every(claim => claim.d);
    const { config } = ctx;
    const matcher = createBlockedHostMatcher(config.blockedHosts);
    if (!demo && (config.paused || !config.liveFetchOpen || !matcher.valid)) return fail("PAUSED");
    const clientKey = await deriveClientKey(request, secret, at);
    const limiter = ctx.deps.limiters[route];
    if (!await limiter.limit(clientKey)) return fail("RATE_LIMITED", { retryAfterSec: limiter.periodSec });
    // Demo assets are built in and never fetched; a live ticket is refused if its asset or page host is blocked now.
    if (claims.some(claim => !claim.d && (matcher.isBlocked(new URL(claim.u).hostname) || matcher.isBlocked(new URL(claim.o).hostname)))) return fail("BLOCKED_HOST");
    return { ok: true, clientKey, claims, demo };
  } catch {
    return dependencyFailure();
  }
}
