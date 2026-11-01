import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { apiErrorResponse, API_MESSAGES } from "../src/lib/api";
import { reserveRender, type RenderCountStore } from "../src/lib/budget-gate";
import { AppError } from "../src/lib/errors";
import type { GuardContext } from "../src/lib/guard";
import { BUSY_MESSAGE } from "../src/lib/limiter";
import { classifyLaunchFailure, SCAN_MS, type ScanLauncher, type ScanOptions } from "../src/lib/scanner";
import { handleScan, scanFailureToApiError, type ScanRouteDeps } from "../src/lib/scan-api";
import { createTicketCodec, TICKET_TTL_SECONDS } from "../src/lib/ticket";
import type { AssetItem, ScanResponse } from "../src/lib/types";
import { fakeLauncher, type FakePageScript } from "./helpers/fake-browser";
import { capturingConsole, fakeSite, JPEG, type FakeRoute as Route } from "./helpers/fake-site";
import { context, live, scanRequest, IP, OPEN_ENV, ORIGIN, PASS, SECRET, T0, TARGET, TOKEN, type ContextOptions } from "./helpers/guard-fixtures";

const PAGE_ORIGIN = "https://photos.example.org";
const CDN = "https://cdn.example.net";
const HTML: Route = { headers: { "content-type": "text/html; charset=utf-8" }, body: Buffer.from("<!doctype html><title>t</title>") };

/** The daily counter's real decision over an in-memory store, so a test can watch the count go up. */
function memoryCounter() {
  const days = new Map<string, number>();
  const store: RenderCountStore = { read: day => days.get(day) ?? null, write: (day, used) => { days.set(day, used); }, deleteBefore: () => undefined };
  return { days, reserve: async (day: string, cap: number) => reserveRender(store, day, cap) };
}

interface Harness { readonly deps: ScanRouteDeps; readonly calls: string[]; readonly site: ReturnType<typeof fakeSite>; readonly browser: ReturnType<typeof fakeLauncher>; readonly ctx: GuardContext }
function harness(options: { readonly context?: ContextOptions; readonly routes?: Record<string, Route>; readonly page?: FakePageScript; readonly scanOptions?: ScanOptions; readonly counter?: ReturnType<typeof memoryCounter>; readonly launcher?: ScanLauncher; readonly onFetch?: (href: string) => void } = {}): Harness {
  const run = context(options.context);
  const counter = options.counter;
  const ctx: GuardContext = counter ? { ...run.ctx, deps: { ...run.ctx.deps, reserveRender: async (day, cap) => { run.calls.push("reserve"); return counter.reserve(day, cap); } } } : run.ctx;
  const site = fakeSite(options.routes ?? { [TARGET]: HTML }, options.onFetch);
  const browser = fakeLauncher(options.page);
  return { ctx, calls: run.calls, site, browser, deps: { context: () => ctx, createFetcher: site.createFetcher, launchBrowser: options.launcher ?? browser.launcher, scanOptions: options.scanOptions ?? { scheduleDeadline: () => () => undefined } } };
}

async function scanned(response: Response): Promise<ScanResponse> {
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get("cache-control"), "no-store");
  return await response.json() as ScanResponse;
}
async function verifyTicket(asset: AssetItem) {
  const created = await createTicketCodec(SECRET, { now: () => T0 });
  assert.ok(created.ok);
  const verified = await created.codec.verify(asset.ticket);
  assert.ok(verified.ok, asset.name);
  return verified.claims;
}
const byName = (body: ScanResponse, name: string) => body.assets.find(asset => asset.name === name);
/** design-contracts.md: the asset ID is the first 20 hex digits of sha256(URL), computed here independently. */
const assetIdFor = (url: string) => createHash("sha256").update(url).digest("hex").slice(0, 20);

test("scan failures: scanner and safe-fetch errors map to public codes — UNSAFE_URL 422, BUSY 503 with 30 s, BLOCKED_HOST 403, SCAN_FAILED 502, shape errors 400", async () => {
  const cases: Array<[AppError, string, number, number | undefined]> = [
    [new AppError("UNSAFE_URL", "接続先に内部ネットワークのアドレスが含まれるため取得できません。"), "PRIVATE_ADDRESS", 422, undefined],
    [new AppError("UNSAFE_URL", "標準ポートの公開Webページだけ取得できます。"), "PRIVATE_ADDRESS", 422, undefined],
    [classifyLaunchFailure(new Error("Unable to create new browser: code: 429: message: Rate limit exceeded")), "BUSY", 503, 30],
    [new AppError("BLOCKED_HOST", "このサイトは、運営者の設定により取得できません。", 403), "BLOCKED_HOST", 403, undefined],
    [classifyLaunchFailure(new Error("Unable to create new browser: code: 500")), "SCAN_FAILED", 502, undefined],
    [new AppError("INVALID_URL", "認証情報を含まないHTTP / HTTPSのURLを入力してください。"), "INVALID_URL", 400, undefined],
    [new AppError("EXTRACTION_RUNTIME", "外部ページの解析はCloudflare Workers環境で利用できます。内蔵デモはこのまま試せます。", 503), "PAUSED", 503, undefined],
    [new AppError("BROWSER_GUARD", "ブラウザの通信制限を確認できないため解析を停止しました。", 503), "PAUSED", 503, undefined],
  ];
  for (const [error, code, status, retry] of cases) {
    const mapped = scanFailureToApiError(error);
    const response = apiErrorResponse(mapped);
    assert.deepEqual([mapped.code, response.status, mapped.retryAfterSec], [code, status, retry], error.code);
    assert.deepEqual(Object.keys(await response.json() as object).sort(), retry === undefined ? ["code", "message"] : ["code", "message", "retryAfterSec"], error.code);
  }
  assert.equal(scanFailureToApiError(classifyLaunchFailure(new Error("too many sessions"))).message, BUSY_MESSAGE);
});

test("scan failures: a login wall or an unreachable page keeps its fixed reason; unknown or foreign errors never pass their text", () => {
  const login = scanFailureToApiError(new AppError("PAGE_UNAVAILABLE", "サイト側でアクセスが制限されています。ログインや制限の回避は行いません。", 422));
  assert.deepEqual([login.code, login.message], ["SCAN_FAILED", "サイト側でアクセスが制限されています。ログインや制限の回避は行いません。"]);
  assert.equal(scanFailureToApiError(new AppError("PAGE_UNAVAILABLE", "ページを取得できませんでした（HTTP 404）。URLを確認してください。", 422)).message, "ページを取得できませんでした（HTTP 404）。URLを確認してください。");
  assert.match(scanFailureToApiError(new AppError("SCAN_TIMEOUT", "解析が40秒の上限に達しました。軽いページや別のURLで再試行してください。", 504)).message, /40秒/);
  assert.match(scanFailureToApiError(new AppError("DNS_FAILED", "接続先が見つかりません。URLを確認してください。", 502)).message, /接続先が見つかりません/);
  const generic = scanFailureToApiError(new AppError("SCAN_FAILED", "x")).message;
  for (const error of [new Error("socket hang up at https://photos.example.org/secret"), "boom", null, new AppError("SOMETHING_NEW", "内部の詳細", 500)]) {
    const mapped = scanFailureToApiError(error);
    assert.deepEqual([mapped.code, mapped.message], ["SCAN_FAILED", generic]);
  }
  // Even an allowed code drops a sentence that could name a location.
  for (const message of ["https://photos.example.org/a が応答しません。", "photos.example.org に接続できません。", "10.0.0.1 へ接続できません。", "user@example に接続できません。", "[2001:db8::1] に接続できません。"]) {
    assert.equal(scanFailureToApiError(new AppError("CONNECTION_FAILED", message, 502)).message, generic, message.slice(0, 12));
  }
});

test("scan API: a live scan lists candidates with tickets, preview paths, source URLs, formats and sizes, and the daily count goes up", async () => {
  const counter = memoryCounter();
  const routes: Record<string, Route> = {
    [TARGET]: HTML,
    [`${CDN}/photos/a.jpg`]: { headers: { "content-type": "image/jpeg" }, body: JPEG },
    [`${CDN}/photos/b.svg`]: { headers: { "content-type": "image/svg+xml" }, body: Buffer.from("<svg/>") },
  };
  const page: FakePageScript = {
    requests: [
      { url: TARGET, resourceType: "document", navigation: true },
      { url: `${CDN}/photos/a.jpg` }, { url: `${CDN}/photos/b.svg` },
      { url: `${CDN}/clips/c.mp4`, resourceType: "media" }, { url: `${CDN}/live/d.m3u8`, resourceType: "xhr" },
    ],
    items: [{ url: `${CDN}/photos/a.jpg`, source: "img", kind: "image", width: 1200, height: 800 }, { url: "/img/e.webp#top", source: "CSS背景", kind: "image" }],
  };
  const run = harness({ routes, page, counter });
  const body = await scanned(await handleScan(scanRequest(live()), run.deps));
  assert.equal(body.pageUrl, TARGET);
  assert.equal(body.truncated, false);
  assert.equal(body.expiresAt, new Date(T0 + TICKET_TTL_SECONDS * 1000).toISOString());
  assert.deepEqual(body.assets.map(asset => asset.name), ["a.jpg", "b.svg", "c.mp4", "d.m3u8", "e.webp"]);
  const jpeg = byName(body, "a.jpg")!;
  assert.deepEqual({ ...jpeg, ticket: undefined, previewUrl: undefined }, { id: assetIdFor(`${CDN}/photos/a.jpg`), kind: "image", name: "a.jpg", url: `${CDN}/photos/a.jpg`, format: "JPG", bytes: JPEG.length, width: 1200, height: 800, ticket: undefined, previewUrl: undefined });
  for (const asset of body.assets.filter(item => item.kind !== "unsupported")) {
    const claims = await verifyTicket(asset);
    assert.deepEqual(claims, { v: 1, u: asset.url, k: asset.kind, o: PAGE_ORIGIN, d: false, e: T0 / 1000 + TICKET_TTL_SECONDS }, asset.name);
    assert.equal(asset.id, assetIdFor(asset.url), asset.name);
  }
  assert.equal(jpeg.previewUrl, `/api/preview?t=${jpeg.ticket}`);
  assert.equal(byName(body, "e.webp")?.url, `${PAGE_ORIGIN}/img/e.webp`);
  assert.ok(byName(body, "e.webp")?.previewUrl);
  // External SVG and video get a ticket for the ZIP but no preview; a stream is detected only, with its reason.
  assert.equal(byName(body, "b.svg")?.previewUrl, undefined);
  assert.equal(byName(body, "c.mp4")?.previewUrl, undefined);
  const stream = byName(body, "d.m3u8")!;
  assert.deepEqual([stream.kind, stream.ticket, stream.previewUrl, typeof stream.reason], ["unsupported", undefined, undefined, "string"]);
  // The guard reserved exactly one render for the UTC day; a second scan makes it two, a demo adds nothing.
  assert.deepEqual(run.calls, ["limit:scan", "bot", "reserve"]);
  assert.deepEqual([...counter.days], [["2026-10-31", 1]]);
  await scanned(await handleScan(scanRequest(live()), harness({ routes, page, counter }).deps));
  await scanned(await handleScan(scanRequest({ demo: true }), harness({ counter }).deps));
  assert.deepEqual([...counter.days], [["2026-10-31", 2]]);
  assert.equal(run.browser.log.launched, 1);
  assert.equal(run.browser.log.closed, 1);
});

test("scan API: more than 200 candidates, or the 40-second cut-off after the page was fetched, are reported as truncated", async () => {
  const items = Array.from({ length: 201 }, (_, index) => ({ url: `${CDN}/many/${index}.png`, source: "img", kind: "image" as const }));
  const many = await scanned(await handleScan(scanRequest(live()), harness({ page: { items } }).deps));
  assert.equal(many.assets.length, 200);
  assert.equal(many.truncated, true);
  const exactly = await scanned(await handleScan(scanRequest(live()), harness({ page: { items: items.slice(0, 200) } }).deps));
  assert.deepEqual([exactly.assets.length, exactly.truncated], [200, false]);
  // The deadline fires while the page is loading: what the page requested so far is kept, the DOM pass never runs.
  let expire = () => {};
  const deadline: ScanOptions = { scheduleDeadline: (callback, milliseconds) => { assert.equal(milliseconds, SCAN_MS); expire = callback; return () => undefined; } };
  const cut = await scanned(await handleScan(scanRequest(live()), harness({
    routes: { [TARGET]: HTML, [`${CDN}/photos/a.jpg`]: {} }, scanOptions: deadline,
    page: { requests: [{ url: `${CDN}/photos/a.jpg` }], items: [{ url: `${CDN}/never/seen.png`, source: "img", kind: "image" }], duringLoad: () => expire() },
  }).deps));
  assert.equal(cut.truncated, true);
  assert.deepEqual(cut.assets.map(asset => asset.name), ["a.jpg"]);
  assert.ok(cut.assets[0].ticket);
  // Cut off before anything was found: the 40-second reason, not an empty success.
  const early = harness({ scanOptions: deadline, onFetch: () => expire() });
  const timedOut = await handleScan(scanRequest(live()), early.deps);
  assert.equal(timedOut.status, 502);
  assert.match((await timedOut.json() as { message: string }).message, /40秒/);
  assert.equal(early.browser.log.launched, 0);
});

test("scan API: refusals (rate limit, bot check, pause, daily cap, blocked host, internal address) answer before any fetch or render", async () => {
  const cases: Array<[string, ContextOptions, unknown, string, number]> = [
    ["rate limit", { limits: { scan: false } }, live(), "RATE_LIMITED", 429],
    ["bot check", { bot: { ...PASS, success: false } }, live(), "BOT_CHECK_FAILED", 403],
    ["pause", { env: { ...OPEN_ENV, PAGECRATE_PAUSED: "1" } }, live(), "PAUSED", 503],
    ["daily cap", { reserve: { allowed: false, reason: "CAP_REACHED", used: 5 } }, live(), "DAILY_CAP_REACHED", 503],
    ["blocked host", {}, live({ url: "https://img.blocked.example/gallery" }), "BLOCKED_HOST", 403],
    ["internal address", {}, live({ url: "http://169.254.169.254/latest" }), "PRIVATE_ADDRESS", 422],
    ["bad URL", {}, live({ url: "javascript:alert(1)" }), "INVALID_URL", 400],
  ];
  for (const [name, options, body, code, status] of cases) {
    const run = harness({ context: options });
    const response = await handleScan(scanRequest(body), run.deps);
    assert.deepEqual([response.status, (await response.json() as { code: string }).code], [status, code], name);
    assert.deepEqual([run.site.created(), run.site.fetched, run.browser.log.launched], [0, [], 0], name);
  }
  const limited = await handleScan(scanRequest(live()), harness({ context: { limits: { scan: false } } }).deps);
  assert.equal(limited.headers.get("retry-after"), "60");
  // The request context itself cannot be read (no Cloudflare runtime): closed as BUSY, nothing else runs.
  const site = fakeSite({});
  const noContext = await handleScan(scanRequest(live()), { context: () => { throw new Error("no Cloudflare context"); }, createFetcher: site.createFetcher, launchBrowser: fakeLauncher().launcher });
  assert.deepEqual([noContext.status, noContext.headers.get("retry-after")], [503, "30"]);
  assert.equal(site.created(), 0);
});

test("scan API: a redirect to a blocked host is refused (403) before that host is contacted; blocked render requests are not fetched and get no ticket", async () => {
  const run = harness({ routes: { [TARGET]: { location: "https://cdn.blocked.example/page" } } });
  const refusedScan = await handleScan(scanRequest(live()), run.deps);
  assert.deepEqual([refusedScan.status, (await refusedScan.json() as { code: string }).code], [403, "BLOCKED_HOST"]);
  assert.deepEqual(run.site.fetched, [TARGET]);
  assert.equal(run.site.resolved.includes("cdn.blocked.example"), false);
  assert.equal(run.browser.log.launched, 0);
  // An internal redirect target is refused the same way, as PRIVATE_ADDRESS.
  const internal = await handleScan(scanRequest(live()), harness({ routes: { [TARGET]: { location: "http://10.0.0.1/admin" } } }).deps);
  assert.deepEqual([internal.status, (await internal.json() as { code: string }).code], [422, "PRIVATE_ADDRESS"]);
  // During the render, a request to a blocked host is refused by the fetcher; its candidate is listed with the reason.
  const render = harness({ page: { requests: [{ url: "https://img.blocked.example/x.png" }, { url: `${CDN}/ok.png` }], items: [{ url: "https://img.blocked.example/y.png", source: "img", kind: "image" }] }, routes: { [TARGET]: HTML, [`${CDN}/ok.png`]: {} } });
  const body = await scanned(await handleScan(scanRequest(live()), render.deps));
  assert.equal(render.site.fetched.some(href => href.includes("blocked.example")), false);
  assert.ok(render.browser.log.aborted.includes("https://img.blocked.example/x.png"));
  for (const name of ["x.png", "y.png"]) {
    const blocked = byName(body, name)!;
    assert.deepEqual([blocked.kind, blocked.ticket, blocked.previewUrl, blocked.reason], ["image", undefined, undefined, API_MESSAGES.BLOCKED_HOST], name);
  }
  assert.ok(byName(body, "ok.png")?.ticket);
});

test("scan API: with nothing configured only the demo works — built-in items with d:true tickets and no outside contact; live scans are PAUSED", async () => {
  const local = "http://127.0.0.1:8787";
  const mustNotFetch = () => { throw new Error("the demo must not create a fetcher"); };
  const run = harness({ context: { env: {}, bot: null, limits: { scan: new Error("no limiter") }, reserve: new Error("no counter") } });
  const deps: ScanRouteDeps = { ...run.deps, createFetcher: mustNotFetch };
  const body = await scanned(await handleScan(scanRequest({ demo: true }, {}, local), deps));
  assert.deepEqual(run.calls, []);
  assert.equal(run.browser.log.launched, 0);
  assert.equal(body.pageUrl, "https://pagecrate.example/studio");
  assert.deepEqual(body.assets.map(asset => asset.id), ["demo-image-0", "demo-image-1", "demo-image-2", "demo-image-3", "demo-image-4", "demo-video", "demo-stream"]);
  for (const asset of body.assets.slice(0, 6)) {
    const claims = await verifyTicket(asset);
    assert.deepEqual([claims.d, claims.o, claims.u, claims.k], [true, "https://pagecrate.example", asset.url, asset.kind], asset.id);
    assert.match(asset.url, /^https:\/\/pagecrate\.example\/assets\//);
  }
  // Demo SVGs are our own artwork, so they get previews; the video does not; the stream has no ticket.
  assert.ok(body.assets.slice(0, 5).every(asset => asset.previewUrl === `/api/preview?t=${asset.ticket}`));
  assert.equal(body.assets[5].previewUrl, undefined);
  assert.deepEqual([body.assets[6].kind, body.assets[6].ticket], ["unsupported", undefined]);
  const closed = await handleScan(scanRequest(live(), {}, local), deps);
  assert.deepEqual([closed.status, (await closed.json() as { code: string }).code], [503, "PAUSED"]);
  assert.deepEqual(run.calls, []);
  // Without a usable ticket key the demo cannot be saved: closed with its own sentence, still without outside contact.
  const keyless = harness({ context: { secret: undefined } });
  const noKey = await handleScan(scanRequest({ demo: true }), { ...keyless.deps, createFetcher: mustNotFetch });
  const noKeyBody = await noKey.json() as { code: string; message: string };
  assert.deepEqual([noKey.status, noKeyBody.code], [503, "PAUSED"]);
  assert.match(noKeyBody.message, /デモを準備できません/);
});

test("scan API: core failures are mapped — a login wall keeps its reason, a refused browser launch is BUSY 503 with 30 s", async () => {
  const login = await handleScan(scanRequest(live()), harness({ routes: { [TARGET]: { status: 401, headers: { "content-type": "text/html" }, body: Buffer.from("login") } } }).deps);
  assert.equal(login.status, 502);
  assert.match((await login.json() as { message: string }).message, /ログインや制限の回避は行いません/);
  const busyLauncher: ScanLauncher = async () => { throw new Error("Unable to create new browser: code: 429: message: Rate limit exceeded"); };
  const busy = await handleScan(scanRequest(live()), harness({ launcher: busyLauncher }).deps);
  assert.deepEqual([busy.status, busy.headers.get("retry-after"), (await busy.json() as { code: string }).code], [503, "30", "BUSY"]);
  const notPage = await handleScan(scanRequest(live()), harness({ routes: { [TARGET]: { headers: { "content-type": "image/png" } } } }).deps);
  assert.match((await notPage.json() as { message: string }).message, /Webページ/);
});

test("scan API: nothing is logged, and no error body carries the URL, a ticket or the client address", async () => {
  const bodies: string[] = [];
  const printed = await capturingConsole(async () => {
    const runs: Array<Parameters<typeof harness>[0]> = [
      {}, { routes: { [TARGET]: { location: "https://cdn.blocked.example/x" } } }, { routes: { [TARGET]: { status: 500, headers: { "content-type": "text/html" } } } },
      { launcher: async () => { throw new Error(`launch failed for ${TARGET} from ${IP}`); } }, { context: { limits: { scan: false } } },
    ];
    for (const options of runs) {
      const response = await handleScan(scanRequest(live()), harness(options).deps);
      if (response.status !== 200) bodies.push(await response.text());
    }
  });
  assert.deepEqual(printed, []);
  assert.equal(bodies.length, 4);
  for (const body of bodies) for (const secret of [TARGET, "photos.example.org", "blocked.example", IP, TOKEN, ORIGIN]) assert.equal(body.includes(secret), false, body.slice(0, 60));
});
