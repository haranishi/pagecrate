import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { apiErrorResponse } from "../src/lib/api";
import { createBlockedHostMatcher, deriveClientKey, guardScan, guardTicketRoute, secondsUntilNextUtcDay, CLIENT_KEY_LENGTH, DEPENDENCY_RETRY_SEC } from "../src/lib/guard";
import {
  context, issue, live, previewRequest, downloadRequest, refused, scanRequest,
  DEMO_IMAGE, IP, LIVE_IMAGE, OPEN_ENV, ORIGIN, OTHER_SECRET, PASS, SECRET, T0, TARGET, TOKEN, type ContextOptions,
} from "./helpers/guard-fixtures";

const CAP_REACHED = { allowed: false, reason: "CAP_REACHED", used: 5 };

test("client key: HMAC of cf-connecting-ip under a salt made from the key and the UTC day, cut to 16 hex digits", async () => {
  const key = await deriveClientKey(scanRequest(live()), SECRET, T0);
  const salt = createHmac("sha256", SECRET).update("pagecrate/client-key/v1/2026-10-31").digest();
  assert.equal(key, createHmac("sha256", salt).update(IP).digest("hex").slice(0, 16));
  assert.equal(CLIENT_KEY_LENGTH, 16);
  assert.match(key, /^[0-9a-f]{16}$/);
  assert.equal(key.includes(IP), false);
  // Same UTC day: same key. It changes at 00:00 UTC (09:00 in Japan), not at midnight in Japan.
  assert.equal(await deriveClientKey(scanRequest(live()), SECRET, Date.parse("2026-10-31T23:59:59.999Z")), key);
  assert.equal(await deriveClientKey(scanRequest(live()), SECRET, Date.parse("2026-11-01T00:00:00.000+09:00")), key);
  assert.notEqual(await deriveClientKey(scanRequest(live()), SECRET, Date.parse("2026-11-01T00:00:00.000Z")), key);
  assert.notEqual(await deriveClientKey(scanRequest(live()), OTHER_SECRET, T0), key);
  assert.notEqual(await deriveClientKey(scanRequest(live(), { "cf-connecting-ip": "203.0.113.8" }), SECRET, T0), key);
});

test("client key: requests without an address share one fixed bucket, and a short key is refused without echoing it", async () => {
  const absent = await deriveClientKey(scanRequest(live(), { "cf-connecting-ip": null }), SECRET, T0);
  assert.equal(await deriveClientKey(scanRequest(live(), { "cf-connecting-ip": "   " }), SECRET, T0), absent);
  assert.notEqual(absent, await deriveClientKey(scanRequest(live()), SECRET, T0));
  for (const secret of ["", "short-key", "あ".repeat(10)]) {
    await assert.rejects(deriveClientKey(scanRequest(live()), secret, T0), (error: unknown) => error instanceof RangeError && (secret === "" || !error.message.includes(secret)));
  }
});

test("client key: one IPv6 /64 is one client, an IPv4-mapped address is its IPv4 address, and spellings do not matter", async () => {
  const key = (address: string | null, at = T0) => deriveClientKey(scanRequest(live(), { "cf-connecting-ip": address }), SECRET, at);
  const network = await key("2001:db8:1:1::1");
  for (let index = 2; index <= 5; index += 1) assert.equal(await key(`2001:db8:1:1::${index}`), network, `::${index}`);
  assert.notEqual(await key("2001:db8:1:2::1"), network);
  assert.equal(await key("2001:DB8:1:1:0:0:0:1"), await key("2001:db8:1:1::1"));
  assert.equal(await key("::ffff:203.0.113.7"), await key(IP));
  assert.notEqual(await key("203.0.113.8"), await key(IP));
  // A malformed value shares the bucket of a missing address; the key still changes at 00:00 UTC.
  assert.equal(await key("not-an-ip"), await key(null));
  assert.notEqual(await key("2001:db8:1:1::1", Date.parse("2026-11-01T00:00:00.000Z")), network);
  // The scan limiter sees one key for the whole /64, so a new interface half per request does not get around it.
  const run = context();
  for (let index = 1; index <= 5; index += 1) await guardScan(scanRequest(live(), { "cf-connecting-ip": `2001:db8:1:1::${index}` }), run.ctx);
  assert.deepEqual(run.keys, Array(5).fill(network));
});

test("guard: nothing reaches the console, and no refusal carries the URL, a ticket or the client address", async () => {
  const methods = ["log", "info", "warn", "error", "debug", "trace", "dir", "dirxml", "table", "assert", "count", "group", "groupCollapsed", "timeLog"] as const;
  const consoleRecord = console as unknown as Record<string, unknown>;
  const original = methods.map(name => [name, consoleRecord[name]] as const);
  const printed: unknown[][] = [];
  const bodies: string[] = [];
  const keys: string[] = [];
  const tokens: string[] = [];
  const ticket = await issue(LIVE_IMAGE);
  const blockedTicket = await issue({ ...LIVE_IMAGE, url: "https://img.blocked.example/a.png" });
  // Dependency errors that name the URL and the address must be swallowed, not printed or forwarded.
  const leaky = () => new Error(`upstream failed for ${TARGET} ${LIVE_IMAGE.url} from ${IP} with ${ticket}`);
  const scans: Array<[ContextOptions, unknown, Record<string, string | null>?]> = [
    [{}, live()], [{}, { demo: true }], [{ limits: { scan: leaky() } }, live()], [{ bot: leaky() }, live()], [{ reserve: leaky() }, live()],
    [{ limits: { scan: false } }, live()], [{ bot: { ...PASS, success: false } }, live()], [{}, live({ url: `ftp://photos.example.org/${IP}` })],
    [{}, live({ url: "https://blocked.example/secret-path" })], [{ reserve: CAP_REACHED }, live()], [{ env: { ...OPEN_ENV, PAGECRATE_PAUSED: "1" } }, live()],
    [{}, live(), { origin: "https://evil.example" }], [{}, "{not json"],
  ];
  const tickets: Array<[ContextOptions, Request, "preview" | "download"]> = [
    [{}, previewRequest(`t=${ticket}`), "preview"], [{}, previewRequest(`t=${ticket}x`), "preview"], [{ now: T0 + 3_600_000 }, previewRequest(`t=${ticket}`), "preview"],
    [{ limits: { preview: leaky() } }, previewRequest(`t=${ticket}`), "preview"], [{ limits: { preview: false } }, previewRequest(`t=${ticket}`), "preview"],
    [{ env: { ...OPEN_ENV, PAGECRATE_PAUSED: "1" } }, previewRequest(`t=${ticket}`), "preview"], [{}, previewRequest(`t=${blockedTicket}`), "preview"],
    [{}, previewRequest(`t=${ticket}`, { "sec-fetch-site": "cross-site" }), "preview"], [{}, downloadRequest({ tickets: [ticket, blockedTicket] }), "download"],
    [{ limits: { download: leaky() } }, downloadRequest({ tickets: [ticket] }), "download"], [{}, downloadRequest({ tickets: Array(51).fill(ticket) }), "download"],
  ];
  for (const name of methods) consoleRecord[name] = (...args: unknown[]) => { printed.push(args); };
  try {
    for (const [options, body, headers] of scans) {
      const run = context(options);
      const result = await guardScan(scanRequest(body, headers), run.ctx);
      if (!result.ok) bodies.push(await apiErrorResponse(result.error).text());
      keys.push(...run.keys);
      tokens.push(...run.tokens);
    }
    for (const [options, request, route] of tickets) {
      const run = context(options);
      const result = await guardTicketRoute(request, route, run.ctx);
      if (!result.ok) bodies.push(await apiErrorResponse(result.error).text());
      keys.push(...run.keys);
    }
  } finally {
    for (const [name, method] of original) consoleRecord[name] = method;
  }
  assert.deepEqual(printed, []);
  // 11 refused scans and 10 refused ticket requests (two scans and one preview are let through).
  assert.equal(bodies.length, 21);
  for (const body of bodies) {
    for (const secret of [TARGET, "photos.example.org", LIVE_IMAGE.url, "cdn.example.net", "blocked.example", ticket, ticket.split(".")[0], IP]) {
      assert.equal(body.includes(secret), false, `${body} must not include ${secret.slice(0, 30)}`);
    }
  }
  // The rate limiter sees only the 16-digit key and siteverify only the token: never the address or the URL.
  assert.ok(keys.length > 0 && keys.every(key => /^[0-9a-f]{16}$/.test(key)));
  assert.deepEqual([...new Set(tokens)], [TOKEN]);
});

test("scan guard: a passing request runs the rate limit, the bot check and the daily cap in that order", async () => {
  const run = context();
  const result = await guardScan(scanRequest(live({ url: `  ${TARGET}  ` })), run.ctx);
  assert.deepEqual(result, { ok: true, demo: false, clientKey: await deriveClientKey(scanRequest(live()), SECRET, T0), url: TARGET });
  assert.deepEqual(run.calls, ["limit:scan", "bot", "reserve"]);
  assert.deepEqual(run.tokens, [TOKEN]);
  assert.deepEqual(run.reserved, [["2026-10-31", 5]]);
});

test("scan guard: the earliest failing step answers and no later step runs", async () => {
  const paused = { ...OPEN_ENV, PAGECRATE_PAUSED: "1" };
  const cases: Array<{ name: string; options?: ContextOptions; body?: unknown; headers?: Record<string, string | null>; code: string; calls: string[] }> = [
    { name: "foreign Origin before everything", options: { env: paused, limits: { scan: false } }, body: live({ url: "x" }), headers: { origin: "https://evil.example" }, code: "FORBIDDEN", calls: [] },
    { name: "missing Origin on POST", headers: { origin: null }, code: "FORBIDDEN", calls: [] },
    { name: "pause before rate limit, bot check and URL", options: { env: paused, limits: { scan: false }, bot: { ...PASS, success: false } }, body: { url: "x" }, code: "PAUSED", calls: [] },
    { name: "rate limit before bot check and URL", options: { limits: { scan: false }, bot: { ...PASS, success: false } }, body: { url: "x" }, code: "RATE_LIMITED", calls: ["limit:scan"] },
    { name: "missing token: no siteverify call", body: { url: TARGET }, code: "BOT_CHECK_FAILED", calls: ["limit:scan"] },
    { name: "bot check before URL and blocklist", options: { bot: { ...PASS, success: false }, reserve: CAP_REACHED }, body: live({ url: "https://blocked.example/" }), code: "BOT_CHECK_FAILED", calls: ["limit:scan", "bot"] },
    { name: "URL syntax before the daily cap", options: { reserve: CAP_REACHED }, body: live({ url: "ftp://photos.example.org/a" }), code: "INVALID_URL", calls: ["limit:scan", "bot"] },
    { name: "blocklist before the daily cap", options: { reserve: CAP_REACHED }, body: live({ url: "https://cdn.blocked.example/a.jpg" }), code: "BLOCKED_HOST", calls: ["limit:scan", "bot"] },
    { name: "daily cap last", options: { reserve: CAP_REACHED }, code: "DAILY_CAP_REACHED", calls: ["limit:scan", "bot", "reserve"] },
  ];
  for (const item of cases) {
    const run = context(item.options);
    const error = refused(await guardScan(scanRequest(item.body ?? live(), item.headers), run.ctx), item.name);
    assert.equal(error.code, item.code, item.name);
    assert.deepEqual(run.calls, item.calls, item.name);
  }
});

test("scan guard: the demo ends right after the Origin check — no pause, closed setting, rate limit, bot check or daily cap", async () => {
  const fails = new Error("must not be called");
  const shut: ContextOptions = {
    env: { PAGECRATE_PUBLIC_ORIGIN: ORIGIN, PAGECRATE_PAUSED: "1", PAGECRATE_DAILY_RENDER_CAP: "0", PAGECRATE_BLOCKED_HOSTS: "not a host/" },
    bot: null, secret: undefined, limits: { scan: fails }, reserve: fails,
  };
  const run = context(shut);
  assert.deepEqual(await guardScan(scanRequest({ demo: true, url: "https://blocked.example/" }), run.ctx), { ok: true, demo: true });
  assert.deepEqual(run.calls, []);
  // Local preview without any setting: the demo works and live fetching stays closed.
  const local = "http://127.0.0.1:8787";
  const unset = context({ env: {} });
  assert.deepEqual(await guardScan(scanRequest({ demo: true }, {}, local), unset.ctx), { ok: true, demo: true });
  assert.equal(refused(await guardScan(scanRequest(live(), {}, local), unset.ctx)).code, "PAUSED");
  assert.deepEqual(unset.calls, []);
  // The Origin check still comes first, and only a literal true selects the demo.
  assert.equal(refused(await guardScan(scanRequest({ demo: true }, { origin: "https://evil.example" }), context().ctx)).code, "FORBIDDEN");
  assert.equal(refused(await guardScan(scanRequest({ demo: "true" }), context({ env: { ...OPEN_ENV, PAGECRATE_PAUSED: "1" } }).ctx)).code, "PAUSED");
});

test("scan guard: closed settings answer PAUSED before any outside contact", async () => {
  const settings: Array<[string, ContextOptions]> = [
    ["paused", { env: { ...OPEN_ENV, PAGECRATE_PAUSED: "true" } }],
    // The pause fails closed: a typo, a blank or a missing value must never open live fetching.
    ...["yes", "on", "off", "no", "paused", "１", "ｔｒｕｅ", "2", "", "  "].map(value => [`pause value ${JSON.stringify(value)}`, { env: { ...OPEN_ENV, PAGECRATE_PAUSED: value } }] as [string, ContextOptions]),
    ["pause value unset", { env: { PAGECRATE_PUBLIC_ORIGIN: ORIGIN, PAGECRATE_DAILY_RENDER_CAP: "5", PAGECRATE_BLOCKED_HOSTS: "blocked.example" } }],
    ["cap 0", { env: { ...OPEN_ENV, PAGECRATE_DAILY_RENDER_CAP: "0" } }],
    ["cap unset", { env: { PAGECRATE_PUBLIC_ORIGIN: ORIGIN } }],
    ["cap malformed", { env: { ...OPEN_ENV, PAGECRATE_DAILY_RENDER_CAP: "1e3" } }],
    ["blocklist entry is not a host", { env: { ...OPEN_ENV, PAGECRATE_BLOCKED_HOSTS: "blocked.example,https://other.example/path" } }],
    ["bot-check secret missing", { bot: null }],
    ["ticket key missing", { secret: undefined }],
    ["ticket key too short", { secret: "short" }],
    ["public origin invalid", { env: { ...OPEN_ENV, PAGECRATE_PUBLIC_ORIGIN: "http://pagecrate.example.com" } }],
    ["public origin unset on a public host", { env: { PAGECRATE_DAILY_RENDER_CAP: "5" } }],
  ];
  for (const [name, options] of settings) {
    const run = context(options);
    const error = refused(await guardScan(scanRequest(live()), run.ctx), name);
    assert.equal(error.code, "PAUSED", name);
    assert.equal(apiErrorResponse(error).status, 503, name);
    assert.deepEqual(run.calls, [], name);
  }
});

test("scan guard: every failing dependency closes with BUSY 503 and a 30-second hint, and later steps never run", async () => {
  const boom = new Error("dependency down");
  const cases: Array<[string, ContextOptions, string[]]> = [
    ["rate limiter throws", { limits: { scan: boom } }, ["limit:scan"]],
    ["siteverify throws", { bot: boom }, ["limit:scan", "bot"]],
    ["counter throws", { reserve: boom }, ["limit:scan", "bot", "reserve"]],
    ["counter storage failed", { reserve: { allowed: false, reason: "STORE_FAILED", used: null } }, ["limit:scan", "bot", "reserve"]],
    ["counter rejected the day", { reserve: { allowed: false, reason: "INVALID_DAY", used: null } }, ["limit:scan", "bot", "reserve"]],
  ];
  for (const malformed of [null, undefined, "ok", {}, { allowed: true }, { allowed: true, used: "1" }, { allowed: "yes", used: 1 }, { allowed: false, reason: "SOMETHING" }]) {
    cases.push([`counter answered ${JSON.stringify(malformed)}`, { reserve: malformed }, ["limit:scan", "bot", "reserve"]]);
  }
  for (const [name, options, calls] of cases) {
    const run = context(options);
    const error = refused(await guardScan(scanRequest(live()), run.ctx), name);
    assert.deepEqual(error, { code: "BUSY", message: error.message, retryAfterSec: DEPENDENCY_RETRY_SEC }, name);
    assert.match(error.message, /^混み合っています。/, name);
    const response = apiErrorResponse(error);
    assert.equal(response.status, 503, name);
    assert.equal(response.headers.get("retry-after"), "30", name);
    assert.deepEqual(run.calls, calls, name);
  }
  // A counter that reports the cap as closed means the operator closed rendering.
  assert.equal(refused(await guardScan(scanRequest(live()), context({ reserve: { allowed: false, reason: "CLOSED", used: null } }).ctx)).code, "PAUSED");
});

test("scan guard: the bot check needs a token, success, the public origin's host name and the scan action", async () => {
  const outcomes: Array<[string, ContextOptions]> = [
    ["not successful", { bot: { ...PASS, success: false } }],
    ["solved on another host", { bot: { ...PASS, hostname: "evil.example" } }],
    ["host with a port", { bot: { ...PASS, hostname: "pagecrate.example.com:443" } }],
    ["no host name", { bot: { success: true, action: "scan" } }],
    ["another action", { bot: { ...PASS, action: "login" } }],
    ["no action", { bot: { success: true, hostname: "pagecrate.example.com" } }],
  ];
  for (const [name, options] of outcomes) {
    const run = context(options);
    assert.equal(refused(await guardScan(scanRequest(live()), run.ctx), name).code, "BOT_CHECK_FAILED", name);
    assert.deepEqual(run.calls, ["limit:scan", "bot"], name);
  }
  for (const token of ["", 42, null, "t".repeat(2049)]) {
    const run = context();
    assert.equal(refused(await guardScan(scanRequest(live({ turnstileToken: token })), run.ctx)).code, "BOT_CHECK_FAILED", String(token).slice(0, 12));
    assert.deepEqual(run.calls, ["limit:scan"]);
  }
  assert.equal((await guardScan(scanRequest(live({ turnstileToken: "t".repeat(2048) })), context().ctx)).ok, true);
});

test("scan guard: retry hints are the limiter window, 30 seconds for failures and the seconds left until 00:00 UTC", async () => {
  const limited = refused(await guardScan(scanRequest(live()), context({ limits: { scan: false }, period: 10 }).ctx));
  assert.deepEqual([limited.code, limited.retryAfterSec], ["RATE_LIMITED", 10]);
  assert.equal(apiErrorResponse(limited).status, 429);
  const at = async (iso: string) => refused(await guardScan(scanRequest(live()), context({ reserve: CAP_REACHED, now: Date.parse(iso) }).ctx));
  for (const [iso, seconds] of [["2026-10-31T23:59:30.000Z", 30], ["2026-11-01T00:00:00.000+09:00", 32_400], ["2026-11-01T00:00:00.000Z", 86_400], ["2026-10-31T23:59:59.500Z", 1]] as const) {
    const error = await at(iso);
    assert.deepEqual([error.code, error.retryAfterSec], ["DAILY_CAP_REACHED", seconds], iso);
    assert.equal(secondsUntilNextUtcDay(Date.parse(iso)), seconds, iso);
  }
  assert.equal(apiErrorResponse(await at("2026-10-31T12:00:00Z")).headers.get("retry-after"), "43200");
});

test("scan guard: the daily cap is reserved only for real renders, keyed by the UTC day", async () => {
  const demo = context();
  await guardScan(scanRequest({ demo: true }), demo.ctx);
  assert.deepEqual(demo.reserved, []);
  for (const options of [{ limits: { scan: false } }, { bot: { ...PASS, success: false } }] satisfies ContextOptions[]) {
    const run = context(options);
    await guardScan(scanRequest(live()), run.ctx);
    assert.deepEqual(run.reserved, []);
  }
  for (const body of [live({ url: "notaurl" }), live({ url: "https://blocked.example/" })]) {
    const run = context();
    await guardScan(scanRequest(body), run.ctx);
    assert.deepEqual(run.reserved, []);
  }
  const ticket = await issue(LIVE_IMAGE);
  for (const [request, route] of [[previewRequest(`t=${ticket}`), "preview"], [downloadRequest({ tickets: [ticket] }), "download"]] as const) {
    const run = context({ reserve: new Error("previews and ZIPs must not reserve renders") });
    assert.equal((await guardTicketRoute(request, route, run.ctx)).ok, true, route);
    assert.deepEqual(run.reserved, [], route);
  }
  for (const [iso, day] of [["2026-11-01T08:59:59.999+09:00", "2026-10-31"], ["2026-11-01T09:00:00.000+09:00", "2026-11-01"]] as const) {
    const run = context({ now: Date.parse(iso) });
    await guardScan(scanRequest(live()), run.ctx);
    assert.deepEqual(run.reserved, [[day, 5]], iso);
  }
});

test("scan guard: URL syntax is http(s) without credentials; the blocklist covers the host and its subdomains", async () => {
  // A non-standard port (formerly let through to safe-fetch) is now refused by syntax: see url-policy.test.ts.
  for (const url of ["http://photos.example.org/a", "https://photos.example.org:443/x", "https://notblocked.example/", "https://blocked.example.org/"]) {
    assert.equal((await guardScan(scanRequest(live({ url })), context().ctx)).ok, true, url);
  }
  for (const url of ["", "   ", "notaurl", "photos.example.org/path", "javascript:alert(1)", "ftp://photos.example.org/", "file:///etc/hosts",
    "https://user:pass@photos.example.org/", "https://user@photos.example.org/", `https://photos.example.org/${"a".repeat(4070)}`, 42, null]) {
    assert.equal(refused(await guardScan(scanRequest(live({ url })), context().ctx), String(url)).code, "INVALID_URL", String(url).slice(0, 40));
  }
  for (const url of ["https://blocked.example/", "https://BLOCKED.example./x", "https://img.cdn.blocked.example/a.jpg", "http://blocked.example:8080/"]) {
    assert.equal(refused(await guardScan(scanRequest(live({ url })), context().ctx), url).code, "BLOCKED_HOST", url);
  }
  const idn = { env: { ...OPEN_ENV, PAGECRATE_BLOCKED_HOSTS: "例え.jp" } };
  for (const url of ["https://例え.jp/", "https://xn--r8jz45g.jp/a", "https://sub.例え.jp/"]) {
    assert.equal(refused(await guardScan(scanRequest(live({ url })), context(idn).ctx), url).code, "BLOCKED_HOST", url);
  }
});

test("scan guard: a malformed body is INVALID_URL and one over 16,000 bytes is LIMIT_EXCEEDED, both before any outside contact", async () => {
  for (const [body, code] of [["{", "INVALID_URL"], ["[1]", "INVALID_URL"], [JSON.stringify(live({ pad: "x".repeat(16_000) })), "LIMIT_EXCEEDED"]] as const) {
    const run = context();
    assert.equal(refused(await guardScan(scanRequest(body), run.ctx)).code, code);
    assert.deepEqual(run.calls, []);
  }
  const run = context();
  assert.equal(refused(await guardScan(scanRequest(JSON.stringify(live()), { "content-type": "text/plain" }), run.ctx)).code, "INVALID_URL");
  assert.equal(apiErrorResponse(refused(await guardScan(scanRequest(JSON.stringify(live({ pad: "x".repeat(16_000) }))), run.ctx))).status, 413);
});

test("blocklist: label-boundary matching with case, trailing dots, IDN and IPv6 normalized; a malformed entry blocks everything", () => {
  const matcher = createBlockedHostMatcher(["Example.COM.", "*.wild.example", ".dot.example", "例え.jp", "203.0.113.9", "[2001:db8::1]", "2001:db8::2"]);
  assert.equal(matcher.valid, true);
  for (const host of ["example.com", "EXAMPLE.com.", "a.example.com", "b.a.example.com", "wild.example", "x.wild.example", "dot.example", "y.dot.example",
    "xn--r8jz45g.jp", "例え.jp", "a.xn--r8jz45g.jp", "203.0.113.9", "[2001:db8::1]", "2001:db8::1", "2001:db8::2", "bad host"]) {
    assert.equal(matcher.isBlocked(host), true, host);
  }
  for (const host of ["notexample.com", "example.com.evil.net", "example.co", "wild.example.net", "xexample.com", "203.0.113.90", "2001:db8::3", "photos.example.org"]) {
    assert.equal(matcher.isBlocked(host), false, host);
  }
  for (const entry of ["photos.example.org/path", "https://example.com", "exa mple.com", "example.com:443", "*example.com", "a@b.example", "a?b.example", "*."]) {
    const bad = createBlockedHostMatcher(["fine.example", entry]);
    assert.equal(bad.valid, false, entry);
    assert.equal(bad.isBlocked("unrelated.example"), true, entry);
  }
  assert.equal(createBlockedHostMatcher([]).valid, true);
  assert.equal(createBlockedHostMatcher([]).isBlocked("example.com"), false);
});

test("blocklist: an IPv4 entry also covers its IPv4-mapped IPv6 form, and a mapped entry covers the IPv4 address", async () => {
  const v4 = createBlockedHostMatcher(["203.0.113.5"]);
  for (const host of ["203.0.113.5", "[::ffff:203.0.113.5]", "::ffff:203.0.113.5", "::FFFF:CB00:7105", "[::ffff:cb00:7105]", "0:0:0:0:0:ffff:cb00:7105"]) {
    assert.equal(v4.isBlocked(host), true, host);
  }
  // Only the mapped form is the same host: other addresses that carry the same 32 bits are not.
  for (const host of ["203.0.113.50", "[::ffff:203.0.113.6]", "2001:db8::cb00:7105"]) assert.equal(v4.isBlocked(host), false, host);
  for (const entry of ["::ffff:203.0.113.5", "[::ffff:203.0.113.5]", "::ffff:cb00:7105"]) {
    const mapped = createBlockedHostMatcher([entry]);
    assert.equal(mapped.valid, true, entry);
    for (const host of ["203.0.113.5", "[::ffff:203.0.113.5]"]) assert.equal(mapped.isBlocked(host), true, `${entry} → ${host}`);
    assert.equal(mapped.isBlocked("203.0.113.6"), false, entry);
  }
  // Through the guard: the mapped spelling of a listed IPv4 address is BLOCKED_HOST for a scan and for a live ticket.
  const blocked: ContextOptions = { env: { ...OPEN_ENV, PAGECRATE_BLOCKED_HOSTS: "203.0.113.5" } };
  assert.equal(refused(await guardScan(scanRequest(live({ url: "http://[::ffff:203.0.113.5]/" })), context(blocked).ctx)).code, "BLOCKED_HOST");
  // A ticket carries the serialized URL, where the mapped address is written in hex.
  const ticket = await issue({ ...LIVE_IMAGE, url: "https://[::ffff:cb00:7105]/a.png" });
  assert.equal(refused(await guardTicketRoute(previewRequest(`t=${ticket}`), "preview", context(blocked).ctx)).code, "BLOCKED_HOST");
});

test("ticket guard keeps the demo unaffected by the scan-only checks", async () => {
  const demo = await issue(DEMO_IMAGE);
  const run = context({ bot: null, reserve: new Error("not for previews") });
  const result = await guardTicketRoute(previewRequest(`t=${demo}`), "preview", run.ctx);
  assert.ok(result.ok);
  assert.deepEqual(run.calls, ["limit:preview"]);
});
