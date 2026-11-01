import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { apiErrorResponse } from "../src/lib/api";
import { guardScan, guardTicketRoute, DEPENDENCY_RETRY_SEC, type ScanGuardResult, type TicketGuardResult } from "../src/lib/guard";
import { budgetReserver, createTurnstileVerifier, guardContextFromEnv, rateLimiterPort, BUDGET_GATE_NAME, RATE_LIMIT_PERIOD_SEC, TURNSTILE_SITEVERIFY_URL, type GuardEnv } from "../src/lib/guard-adapters";
import { issue, live, previewRequest, scanRequest, HOST, LIVE_IMAGE, ORIGIN, SECRET, T0, TOKEN } from "./helpers/guard-fixtures";

const TURNSTILE_SECRET = "test-only-turnstile-secret-0000";

function siteverify(body: unknown, init: ResponseInit = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });
}
const mustNotFetch: typeof fetch = async () => { throw new Error("must not fetch"); };

test("turnstile verifier: posts only the secret and the token to siteverify and returns success, hostname and action (offline)", async () => {
  const seen: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    seen.push({ url: String(input), init });
    return siteverify({ success: true, "error-codes": [], challenge_ts: "2026-10-31T12:00:00Z", hostname: HOST, action: "scan", cdata: "" });
  };
  const verify = createTurnstileVerifier(TURNSTILE_SECRET, fakeFetch);
  assert.ok(verify);
  assert.deepEqual(await verify(TOKEN), { success: true, hostname: HOST, action: "scan" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, TURNSTILE_SITEVERIFY_URL);
  assert.equal(seen[0].init?.method, "POST");
  assert.equal(seen[0].init?.redirect, "manual");
  assert.ok(seen[0].init?.signal instanceof AbortSignal);
  assert.equal(new Headers(seen[0].init?.headers).get("content-type"), "application/x-www-form-urlencoded");
  // No remoteip and no forwarded headers: the client address never leaves the Worker.
  const params = new URLSearchParams(String(seen[0].init?.body));
  assert.deepEqual([...params.keys()].sort(), ["response", "secret"]);
  assert.equal(params.get("secret"), TURNSTILE_SECRET);
  assert.equal(params.get("response"), TOKEN);
  // A well-formed refusal is an answer for the guard to judge, not a failure.
  const refusing = createTurnstileVerifier(TURNSTILE_SECRET, async () => siteverify({ success: false, "error-codes": ["timeout-or-duplicate"] }));
  assert.deepEqual(await refusing?.(TOKEN), { success: false, hostname: undefined, action: undefined });
});

test("turnstile verifier: transport errors, non-200, redirects, non-JSON, oversized or malformed answers throw; a missing secret means not configured", async () => {
  for (const secret of [undefined, "", "   "]) assert.equal(createTurnstileVerifier(secret, mustNotFetch), null, String(secret));
  const failing: Array<[string, typeof fetch]> = [
    ["network", async () => { throw new TypeError("network down"); }],
    ["status 500", async () => siteverify({ success: true }, { status: 500 })],
    ["redirect", async () => new Response(null, { status: 302, headers: { location: "https://evil.example/" } })],
    ["html", async () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } })],
    ["broken JSON", async () => siteverify("{")],
    ["no success flag", async () => siteverify({ hostname: HOST, action: "scan" })],
    ["success as text", async () => siteverify({ success: "true" })],
    ["array", async () => siteverify([true])],
    ["oversized", async () => siteverify({ success: true, pad: "x".repeat(20_000) })],
  ];
  for (const [name, fakeFetch] of failing) {
    await assert.rejects(createTurnstileVerifier(TURNSTILE_SECRET, fakeFetch)?.(TOKEN) ?? Promise.resolve(), (error: unknown) => {
      assert.ok(error instanceof Error, name);
      assert.equal(error.message.includes(TOKEN) || error.message.includes(TURNSTILE_SECRET), false, name);
      return true;
    }, name);
  }
  const hung: typeof fetch = (_input, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }); });
  await assert.rejects(createTurnstileVerifier(TURNSTILE_SECRET, hung, 20)?.(TOKEN) ?? Promise.resolve(), /aborted/);
});

test("rate-limit port: hands the key to the binding and maps success; a missing binding or a malformed answer throws", async () => {
  const keys: string[] = [];
  const port = rateLimiterPort({ limit: async ({ key }) => { keys.push(key); return { success: keys.length < 2 }; } }, RATE_LIMIT_PERIOD_SEC.scan);
  assert.equal(port.periodSec, 60);
  assert.equal(await port.limit("0123456789abcdef"), true);
  assert.equal(await port.limit("0123456789abcdef"), false);
  assert.deepEqual(keys, ["0123456789abcdef", "0123456789abcdef"]);
  await assert.rejects(rateLimiterPort(undefined, 60).limit("0123456789abcdef"));
  for (const outcome of [undefined, null, {}, { success: "yes" }, { success: 1 }]) {
    await assert.rejects(rateLimiterPort({ limit: async () => outcome }, 60).limit("0123456789abcdef"), Error, JSON.stringify(outcome));
  }
  await assert.rejects(rateLimiterPort({ limit: async () => { throw new Error("binding error"); } }, 60).limit("0123456789abcdef"));
});

test("budget reserver: always asks the one named counter with the day and the cap; a missing binding or a failing call throws", async () => {
  const names: string[] = [];
  const calls: Array<readonly [string, number]> = [];
  const reserve = budgetReserver({ getByName(name) { names.push(name); return { async reserve(day, cap) { calls.push([day, cap]); return { allowed: true, used: calls.length }; } }; } });
  assert.deepEqual(await reserve("2026-10-31", 5), { allowed: true, used: 1 });
  assert.deepEqual(await reserve("2026-10-31", 5), { allowed: true, used: 2 });
  assert.deepEqual(names, [BUDGET_GATE_NAME, BUDGET_GATE_NAME]);
  assert.deepEqual(calls, [["2026-10-31", 5], ["2026-10-31", 5]]);
  await assert.rejects(budgetReserver(undefined)("2026-10-31", 5));
  await assert.rejects(budgetReserver({ getByName: () => ({ reserve: async () => { throw new Error("Durable Object unreachable"); } }) })("2026-10-31", 5));
});

/** Drops // and block comments outside strings, enough to read wrangler.jsonc. */
function stripJsonComments(text: string): string {
  let out = "";
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      out += char;
      if (char === "\\") { out += text[index + 1] ?? ""; index += 1; } else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
      out += char;
    } else if (char === "/" && text[index + 1] === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      out += "\n";
    } else if (char === "/" && text[index + 1] === "*") {
      index = text.indexOf("*/", index + 2) + 1;
      if (index === 0) break;
    } else out += char;
  }
  return out;
}

test("wrangler.jsonc: each rate-limit window equals the retry hint the guard gives", async () => {
  const config: unknown = JSON.parse(stripJsonComments(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8")));
  const entries = (config as { ratelimits: Array<{ name: string; simple: { period: number } }> }).ratelimits;
  assert.deepEqual(Object.fromEntries(entries.map(entry => [entry.name, entry.simple.period])), {
    SCAN_LIMITER: RATE_LIMIT_PERIOD_SEC.scan, PREVIEW_LIMITER: RATE_LIMIT_PERIOD_SEC.preview, DOWNLOAD_LIMITER: RATE_LIMIT_PERIOD_SEC.download,
  });
});

/** Every key at any depth, so a setting inside an environment section counts as well. */
function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, inner]) => [key, ...allKeys(inner)]);
}

test("wrangler.jsonc: Workers Logs and traces are off, and the file names no account and no plain vars", async () => {
  const config: unknown = JSON.parse(stripJsonComments(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8")));
  // The privacy policy says the operator keeps no access or error records: turning logs back on means rewording it
  // and raising the policy version first (release-checklist.md, chapter 2).
  assert.deepEqual((config as { observability?: unknown }).observability, { enabled: false });
  const keys = allKeys(config);
  assert.equal(keys.includes("account_id"), false, "the account comes from the wrangler login or CLOUDFLARE_ACCOUNT_ID");
  assert.equal(keys.includes("vars"), false, "settings are Workers Secrets (secrets.required), not plain vars");
  assert.equal(keys.includes("logs") || keys.includes("traces") || keys.includes("logpush") || keys.includes("tail_consumers"), false);
});

test("wrangler.jsonc: no binding that can store data — only the day counter, three rate limits, page rendering, static files and the self reference", async () => {
  // Requirement 4.1 (nothing is kept on the operator's side) assumes these are the only bindings. A storage binding, or one more
  // Durable Object, service or rate limit, fails here on purpose, so that what it could keep is reviewed with the privacy policy first.
  type Bindings = { name: string; durable_objects?: unknown; migrations?: unknown; services?: unknown; ratelimits?: Array<{ name: string }>; browser?: unknown; assets?: { binding?: unknown } };
  const config = JSON.parse(stripJsonComments(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"))) as Bindings;
  const keys = allKeys(config);
  for (const storage of ["kv_namespaces", "d1_databases", "r2_buckets", "queues", "vectorize", "hyperdrive", "analytics_engine_datasets", "pipelines", "secrets_store_secrets", "send_email"]) {
    assert.equal(keys.includes(storage), false, storage);
  }
  assert.deepEqual(config.durable_objects, { bindings: [{ name: "BUDGET_GATE", class_name: "BudgetGate" }] });
  assert.deepEqual(config.migrations, [{ tag: "v1", new_sqlite_classes: ["BudgetGate"] }]);
  assert.deepEqual(config.services, [{ binding: "WORKER_SELF_REFERENCE", service: config.name }]);
  assert.deepEqual(config.ratelimits?.map(entry => entry.name).sort(), ["DOWNLOAD_LIMITER", "PREVIEW_LIMITER", "SCAN_LIMITER"]);
  assert.deepEqual(config.browser, { binding: "BROWSER" });
  assert.equal(config.assets?.binding, "ASSETS");
});

test("guard context from env: bindings, settings and the ticket key are wired, and a scan passes end to end on offline fakes", async () => {
  const limited: string[] = [];
  const reserved: Array<readonly [string, number]> = [];
  const env: GuardEnv = {
    PAGECRATE_PUBLIC_ORIGIN: ORIGIN, PAGECRATE_DAILY_RENDER_CAP: "5", PAGECRATE_PAUSED: "0", PAGECRATE_BLOCKED_HOSTS: "blocked.example",
    PAGECRATE_TURNSTILE_SECRET: TURNSTILE_SECRET, PAGECRATE_TICKET_SECRET: SECRET,
    SCAN_LIMITER: { limit: async ({ key }) => { limited.push(key); return { success: true }; } },
    PREVIEW_LIMITER: { limit: async () => ({ success: true }) },
    DOWNLOAD_LIMITER: { limit: async () => ({ success: true }) },
    BUDGET_GATE: { getByName: () => ({ reserve: async (day, cap) => { reserved.push([day, cap]); return { allowed: true, used: 1 }; } }) },
  };
  const fakeFetch: typeof fetch = async () => siteverify({ success: true, hostname: HOST, action: "scan" });
  const ctx = guardContextFromEnv(env, { fetch: fakeFetch, now: () => T0 });
  assert.equal(ctx.secret, SECRET);
  assert.equal(ctx.config.dailyRenderCap, 5);
  assert.deepEqual(ctx.config.blockedHosts, ["blocked.example"]);
  assert.equal(ctx.deps.limiters.preview.periodSec, 60);
  assert.equal((await guardScan(scanRequest(live()), ctx)).ok, true);
  assert.equal(limited.length, 1);
  assert.match(limited[0], /^[0-9a-f]{16}$/);
  assert.deepEqual(reserved, [["2026-10-31", 5]]);
  // Without the bot-check secret live scans are closed; without bindings they fail closed.
  const noBotSecret = guardContextFromEnv({ ...env, PAGECRATE_TURNSTILE_SECRET: undefined }, { fetch: mustNotFetch, now: () => T0 });
  assert.equal(noBotSecret.deps.verifyBot, null);
  const closed = await guardScan(scanRequest(live()), noBotSecret);
  assert.ok(!closed.ok && closed.error.code === "PAUSED");
  const noBindings = await guardScan(scanRequest(live()), guardContextFromEnv({ ...env, SCAN_LIMITER: undefined }, { fetch: fakeFetch, now: () => T0 }));
  assert.ok(!noBindings.ok && noBindings.error.code === "BUSY" && apiErrorResponse(noBindings.error).status === 503);
  const noCounter = await guardScan(scanRequest(live()), guardContextFromEnv({ ...env, BUDGET_GATE: undefined }, { fetch: fakeFetch, now: () => T0 }));
  assert.ok(!noCounter.ok && noCounter.error.code === "BUSY");
});

/** Lets queued callbacks run. Only setTimeout is mocked in these tests, so setImmediate still runs for real. */
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
/** A dependency that never answers. `called` resolves once it was asked; the adapter has set its timer by then. */
function silentDependency() {
  let markCalled!: () => void;
  const called = new Promise<void>(resolve => { markCalled = resolve; });
  return { called, answer: (): Promise<never> => { markCalled(); return new Promise<never>(() => {}); } };
}
/** Records how a promise ends without awaiting it, so the test can move the clock in between. */
function watch<T>(promise: Promise<T>) {
  const state: { settled: boolean; value?: T; error?: unknown } = { settled: false };
  void promise.then(value => { state.value = value; state.settled = true; }, (error: unknown) => { state.error = error; state.settled = true; });
  return state;
}
/** Fails after two real seconds, so a missing timeout fails the test instead of hanging it. */
function withWatchdog<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("still waiting after 2 s")), 2000); });
  return Promise.race([promise, watchdog]).finally(() => clearTimeout(timer));
}
function assertBusy(result: ScanGuardResult | TicketGuardResult | undefined, label: string): void {
  assert.ok(result !== undefined && !result.ok, `${label}: expected a refusal`);
  assert.equal(result.error.code, "BUSY", label);
  const response = apiErrorResponse(result.error);
  assert.equal(response.status, 503, label);
  assert.equal(response.headers.get("retry-after"), String(DEPENDENCY_RETRY_SEC), label);
}
function openEnv(overrides: Partial<GuardEnv>): GuardEnv {
  return {
    PAGECRATE_PUBLIC_ORIGIN: ORIGIN, PAGECRATE_DAILY_RENDER_CAP: "5", PAGECRATE_PAUSED: "0", PAGECRATE_BLOCKED_HOSTS: "blocked.example",
    PAGECRATE_TURNSTILE_SECRET: TURNSTILE_SECRET, PAGECRATE_TICKET_SECRET: SECRET,
    SCAN_LIMITER: { limit: async () => ({ success: true }) },
    PREVIEW_LIMITER: { limit: async () => ({ success: true }) },
    DOWNLOAD_LIMITER: { limit: async () => ({ success: true }) },
    BUDGET_GATE: { getByName: () => ({ reserve: async () => ({ allowed: true, used: 1 }) }) },
    ...overrides,
  };
}
const passingSiteverify: typeof fetch = async () => siteverify({ success: true, hostname: HOST, action: "scan" });

test("rate-limit port: a binding that never answers times out after 3 seconds (mock clock), and the guard closes with BUSY", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const silent = silentDependency();
  const pending = watch(rateLimiterPort({ limit: silent.answer }, 60).limit("0123456789abcdef"));
  await silent.called;
  t.mock.timers.tick(2999); await turn();
  assert.equal(pending.settled, false);
  t.mock.timers.tick(1); await turn();
  assert.ok(pending.error instanceof Error && /timed out/.test(pending.error.message), String(pending.error));
  // End to end on the env adapters: the scan is closed with BUSY, and neither siteverify nor the counter is asked.
  const scanLimiter = silentDependency();
  const asked: string[] = [];
  const env = openEnv({ SCAN_LIMITER: { limit: scanLimiter.answer }, BUDGET_GATE: { getByName: () => ({ reserve: async () => { asked.push("reserve"); return { allowed: true, used: 1 }; } }) } });
  const scan = watch(guardScan(scanRequest(live()), guardContextFromEnv(env, { fetch: async () => { asked.push("siteverify"); return siteverify({ success: true, hostname: HOST, action: "scan" }); }, now: () => T0 })));
  await scanLimiter.called;
  t.mock.timers.tick(2999); await turn();
  assert.equal(scan.settled, false);
  t.mock.timers.tick(1); await turn();
  assertBusy(scan.value, "scan");
  assert.deepEqual(asked, []);
  // The preview limiter is the same adapter: a silent binding closes the ticket route with BUSY too.
  const previewLimiter = silentDependency();
  const ticket = await issue(LIVE_IMAGE);
  const preview = watch(guardTicketRoute(previewRequest(`t=${ticket}`), "preview", guardContextFromEnv(openEnv({ PREVIEW_LIMITER: { limit: previewLimiter.answer } }), { fetch: mustNotFetch, now: () => T0 })));
  await previewLimiter.called;
  t.mock.timers.tick(3000); await turn();
  assertBusy(preview.value, "preview");
});

test("budget reserver: a counter that never answers times out after 5 seconds (mock clock), and the guard closes with BUSY", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const silent = silentDependency();
  const pending = watch(budgetReserver({ getByName: () => ({ reserve: silent.answer }) })("2026-10-31", 5));
  await silent.called;
  t.mock.timers.tick(4999); await turn();
  assert.equal(pending.settled, false);
  t.mock.timers.tick(1); await turn();
  assert.ok(pending.error instanceof Error && /timed out/.test(pending.error.message), String(pending.error));
  // End to end: the rate limit and the bot check pass, the counter stays silent, and the scan is closed with BUSY.
  const counter = silentDependency();
  const scan = watch(guardScan(scanRequest(live()), guardContextFromEnv(openEnv({ BUDGET_GATE: { getByName: () => ({ reserve: counter.answer }) } }), { fetch: passingSiteverify, now: () => T0 })));
  await counter.called;
  t.mock.timers.tick(4999); await turn();
  assert.equal(scan.settled, false);
  t.mock.timers.tick(1); await turn();
  assertBusy(scan.value, "scan");
});

test("turnstile verifier: a siteverify that never answers, or stops in the middle of its answer, times out after timeoutMs; the guard closes with BUSY", async () => {
  // Like a real fetch, the fakes give up with the signal's reason: before the answer, or while the body is read.
  const noAnswer: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
  });
  const stalledBody: typeof fetch = async (_input, init) => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"success":'));
      init?.signal?.addEventListener("abort", () => controller.error(init.signal?.reason), { once: true });
    },
  }), { status: 200, headers: { "content-type": "application/json" } });
  for (const [name, silentFetch] of [["no answer", noAnswer], ["stalled body", stalledBody]] as const) {
    const verify = createTurnstileVerifier(TURNSTILE_SECRET, silentFetch, 30);
    assert.ok(verify, name);
    const started = performance.now();
    await assert.rejects(withWatchdog(verify(TOKEN)), (error: unknown) => error instanceof DOMException && error.name === "TimeoutError", name);
    assert.ok(performance.now() - started >= 25, name);
    // Through the guard: the scan is closed with BUSY, and the daily counter is never asked.
    const reserved: string[] = [];
    const base = guardContextFromEnv(openEnv({ BUDGET_GATE: { getByName: () => ({ reserve: async day => { reserved.push(day); return { allowed: true, used: 1 }; } }) } }), { fetch: mustNotFetch, now: () => T0 });
    assertBusy(await withWatchdog(guardScan(scanRequest(live()), { ...base, deps: { ...base.deps, verifyBot: createTurnstileVerifier(TURNSTILE_SECRET, silentFetch, 30) } })), name);
    assert.deepEqual(reserved, [], name);
  }
});
