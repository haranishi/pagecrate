import assert from "node:assert/strict";
import type { ApiError } from "../../src/lib/api";
import { TURNSTILE_ACTION, type BotCheckOutcome, type GuardContext, type GuardDeps, type RateLimitRoute } from "../../src/lib/guard";
import { readOpsConfig, type OpsEnv } from "../../src/lib/ops-config";
import { createTicketCodec, type TicketInput } from "../../src/lib/ticket";

export const ORIGIN = "https://pagecrate.example.com";
export const HOST = "pagecrate.example.com";
export const SECRET = "test-only-guard-key-".padEnd(48, "0");
export const OTHER_SECRET = "test-only-rotated-guard-key-".padEnd(48, "1");
export const IP = "203.0.113.7";
export const TARGET = "https://photos.example.org/gallery?id=synthetic-42";
export const TOKEN = "turnstile-token-synthetic-0001";
export const T0 = Date.UTC(2026, 9, 31, 12, 0, 0);
export const OPEN_ENV: OpsEnv = { PAGECRATE_PUBLIC_ORIGIN: ORIGIN, PAGECRATE_DAILY_RENDER_CAP: "5", PAGECRATE_PAUSED: "0", PAGECRATE_BLOCKED_HOSTS: "blocked.example" };
export const PASS: BotCheckOutcome = { success: true, hostname: HOST, action: TURNSTILE_ACTION };

export const LIVE_IMAGE: TicketInput = { url: "https://cdn.example.net/photos/a.jpg?w=1200", kind: "image", pageOrigin: "https://photos.example.org", demo: false };
export const LIVE_VIDEO: TicketInput = { url: "https://cdn.example.net/clips/b.mp4", kind: "video", pageOrigin: "https://photos.example.org", demo: false };
export const DEMO_IMAGE: TicketInput = { url: "https://pagecrate.example/assets/studio-poster.svg", kind: "image", pageOrigin: "https://pagecrate.example", demo: true };
export const DEMO_VIDEO: TicketInput = { url: "https://pagecrate.example/assets/motion-study.webm", kind: "video", pageOrigin: "https://pagecrate.example", demo: true };

type Behaviour<T> = T | Error;
export interface FakeOptions {
  readonly limits?: Partial<Record<RateLimitRoute, Behaviour<boolean>>>;
  /** null: the bot-check secret is missing. */
  readonly bot?: Behaviour<BotCheckOutcome> | null;
  readonly reserve?: Behaviour<unknown>;
  readonly period?: number;
}
export interface ContextOptions extends FakeOptions {
  readonly env?: OpsEnv;
  readonly secret?: string | undefined;
  readonly now?: number;
}

async function answer<T>(value: Behaviour<T>): Promise<T> {
  if (value instanceof Error) throw value;
  return value;
}

/** Guard context over recording fakes: `calls` keeps the order in which outside contacts were made. */
export function context(options: ContextOptions = {}) {
  const calls: string[] = [];
  const keys: string[] = [];
  const tokens: string[] = [];
  const reserved: Array<readonly [string, number]> = [];
  const limiter = (route: RateLimitRoute) => ({
    periodSec: options.period ?? 60,
    async limit(key: string) {
      calls.push(`limit:${route}`);
      keys.push(key);
      return answer(options.limits?.[route] ?? true);
    },
  });
  const deps: GuardDeps = {
    limiters: { scan: limiter("scan"), preview: limiter("preview"), download: limiter("download") },
    verifyBot: options.bot === null ? null : async token => {
      calls.push("bot");
      tokens.push(token);
      return answer(options.bot ?? PASS);
    },
    reserveRender: async (day, cap) => {
      calls.push("reserve");
      reserved.push([day, cap]);
      // `in`, not `??`: an explicit undefined answer is one of the malformed replies under test.
      return answer("reserve" in options ? options.reserve : { allowed: true, used: 1 });
    },
  };
  const ctx: GuardContext = {
    config: readOpsConfig(options.env ?? OPEN_ENV),
    deps,
    secret: "secret" in options ? options.secret : SECRET,
    now: () => options.now ?? T0,
  };
  return { ctx, calls, keys, tokens, reserved };
}

function headerRecord(defaults: Record<string, string>, headers: Record<string, string | null>): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [name, value] of Object.entries({ ...defaults, ...headers })) if (value !== null) merged[name] = value;
  return merged;
}

export function scanRequest(body: unknown, headers: Record<string, string | null> = {}, base = ORIGIN): Request {
  return new Request(`${base}/api/scan`, {
    method: "POST",
    headers: headerRecord({ host: new URL(base).host, origin: base, "content-type": "application/json", "cf-connecting-ip": IP }, headers),
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
export const live = (extra: Record<string, unknown> = {}) => ({ url: TARGET, turnstileToken: TOKEN, ...extra });

export function previewRequest(query: string, headers: Record<string, string | null> = {}): Request {
  return new Request(`${ORIGIN}/api/preview?${query}`, {
    method: "GET",
    headers: headerRecord({ host: HOST, "sec-fetch-site": "same-origin", "cf-connecting-ip": IP }, headers),
  });
}
export function downloadRequest(body: unknown, headers: Record<string, string | null> = {}): Request {
  return new Request(`${ORIGIN}/api/download`, {
    method: "POST",
    headers: headerRecord({ host: HOST, origin: ORIGIN, "content-type": "application/json", "cf-connecting-ip": IP }, headers),
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export async function issue(input: TicketInput, issuedAt = T0, secret = SECRET): Promise<string> {
  const created = await createTicketCodec(secret, { now: () => issuedAt });
  assert.ok(created.ok, "codec should be created");
  const issued = await created.codec.issue(input);
  assert.ok(issued.ok, "ticket should be issued");
  return issued.ticket;
}

/** Narrows a guard answer to its error, failing the test if the request was let through. */
export function refused(result: { readonly ok: true } | { readonly ok: false; readonly error: ApiError }, label = ""): ApiError {
  if (result.ok) assert.fail(`expected a refusal ${label}`.trim());
  return result.error;
}
