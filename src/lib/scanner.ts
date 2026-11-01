import { normalizeAssets, inferKind, type Candidate } from "./assets";
import { assertWorkersRuntime, createWorkerSafeFetcher, validateUrl, type safeFetch, type SafeResponse } from "./safe-fetch";
import { AppError } from "./errors";
import type { ScanResult } from "./types";
import { DOM_SCRIPT } from "./dom-script";
import { ByteBudget } from "./budget";
import { BUSY_MESSAGE } from "./limiter";

export const SCAN_MS = 40000;
/** Raw candidates kept before deduplication (DOM items are capped at 1,000 by the page script). */
const MAX_RAW_CANDIDATES = 1500;
const MAX_DOM_ITEMS = 1000;
export type ScanOptions = {
  /** Test-only clock injection. Production always cuts the analysis at 40 seconds. */
  scheduleDeadline?: (expired: () => void, milliseconds: number) => () => void;
};
const SCAN_FAILED_MESSAGE = "ブラウザ解析を完了できませんでした。時間をおいて再試行してください。";
// Browser Run answers 429 when the concurrency or launch-rate limit is reached. Whole words only, so that
// "generate" or "unlimited" in an unrelated error do not count.
const CAPACITY_WORDS = /\b(?:rate|ratelimit(?:s|ed)?|limit(?:s|ed)?)\b|too many|\b429\b/i;

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const { message } = error as { message?: unknown };
    if (typeof message === "string") return message;
  }
  return "";
}

/**
 * Pure classification of a browser launch failure: Browser Run's concurrency or launch-rate refusal (HTTP 429, or
 * text with limit, rate or too many) becomes BUSY with 503; anything else stays SCAN_FAILED. AppErrors pass through.
 * The original error is kept in memory as `cause` only; the API never serializes it.
 */
export function classifyLaunchFailure(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const { status, code } = typeof error === "object" && error !== null ? error as { status?: unknown; code?: unknown } : {};
  const busy = status === 429 || code === 429 || CAPACITY_WORDS.test(errorText(error));
  const failure = busy ? new AppError("BUSY", BUSY_MESSAGE, 503) : new AppError("SCAN_FAILED", SCAN_FAILED_MESSAGE, 502);
  failure.cause = error;
  return failure;
}
const TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_ACTIVE_REQUESTS = 2;
// Narrow common surface: local test Playwright and Cloudflare's fork have
// different full Browser types. Do not hide that mismatch with a double cast.
type ScanRequest = { url(): string; method(): string; resourceType(): string; isNavigationRequest(): boolean };
type ScanRoute = { request(): ScanRequest; abort(): Promise<void>; fulfill(options: { status: number; headers: Record<string, string>; body: string | Buffer }): Promise<void> };
type ScanResponse = { status(): number; headers(): Record<string, string> };
type ScanPage = {
  goto(url: string, options: { waitUntil: "domcontentloaded"; timeout: number }): Promise<ScanResponse | null>;
  evaluate(script: string | (() => void)): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  close(): Promise<void>;
  on(event: "dialog", listener: (dialog: { dismiss(): Promise<void> }) => void): unknown;
};
type ScanContext = {
  newPage(): Promise<ScanPage>;
  route(pattern: string, handler: (route: ScanRoute) => Promise<void>): Promise<unknown>;
  routeWebSocket(pattern: string, handler: (socket: { close(): Promise<void> }) => Promise<void>): Promise<void>;
  setOffline(offline: boolean): Promise<void>;
  addInitScript(script: string): Promise<unknown>;
  on(event: "page", listener: (page: ScanPage) => void): unknown;
  close(): Promise<void>;
};
export type ScanBrowser = {
  newContext(options: { viewport?: { width: number; height: number }; serviceWorkers: "block"; acceptDownloads: false; permissions: string[] }): Promise<ScanContext>;
  close(): Promise<void>;
};
export type ScanLauncher = (signal: AbortSignal) => Promise<ScanBrowser>;
function cleanHeaders(response: SafeResponse): Record<string, string> {
  const allowed = ["content-type", "content-language", "access-control-allow-origin", "content-security-policy", "x-content-type-options"];
  return Object.fromEntries(Object.entries(response.headers).filter(([key]) => allowed.includes(key)));
}
export function rebaseCss(css: string, base: string): string {
  const limit = 5 * 1024 * 1024;
  let estimated = css.length;
  const absolute = (url: string) => { try { return new URL(url, base).href; } catch { return url; } };
  const bound = (original: string, replacement: string) => {
    estimated += replacement.length - original.length;
    if (estimated > limit) throw new AppError("BODY_LIMIT", "CSSの展開後サイズが上限を超えています。", 413);
    return replacement;
  };
  const rewritten = css.replace(/url\(\s*(['"]?)([^'"\s)]+)\1\s*\)/gi, (all, _quote, value: string) => bound(all, `url(${JSON.stringify(absolute(value))})`))
    .replace(/@import\s+(['"])([^'"]+)\1/gi, (all, _quote, value: string) => bound(all, `@import ${JSON.stringify(absolute(value))}`));
  if (Buffer.byteLength(rewritten) > limit) throw new AppError("BODY_LIMIT", "CSSの展開後サイズが上限を超えています。", 413);
  return rewritten;
}

// Session policy is immutable and denies browser egress independently of our
// route handlers. A fresh, credential-free probe fails closed if it is missing.
export async function verifyBrowserGuardrails(browser: ScanBrowser): Promise<void> {
  const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false, permissions: [] });
  try {
    await context.routeWebSocket("**/*", socket => socket.close());
    const page = await context.newPage();
    const response = await page.goto("https://example.com/pagecrate-network-guard-probe", { waitUntil: "domcontentloaded", timeout: 4000 });
    const headers = response?.headers() ?? {};
    if (response?.status() !== 403 || headers["cf-mitigated"] !== "guardrails" || headers["cf-brapi-guardrails-reason"] !== "not-in-allowlist") {
      throw new AppError("BROWSER_GUARD", "ブラウザの通信制限を確認できないため解析を停止しました。", 503);
    }
  } catch {
    throw new AppError("BROWSER_GUARD", "ブラウザの通信制限を確認できないため解析を停止しました。", 503);
  } finally { await context.close(); }
}

export async function launchWorkerBrowser(signal: AbortSignal): Promise<ScanBrowser> {
  assertWorkersRuntime();
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env } = getCloudflareContext();
  if (!env.BROWSER || !env.PAGECRATE_BROWSER_LAUNCH) throw new AppError("BROWSER_UNAVAILABLE", "ブラウザ解析の接続先が設定されていません。", 503);
  const browser = await env.PAGECRATE_BROWSER_LAUNCH(signal);
  try {
    if (signal.aborted) throw new AppError("ABORTED", "解析の制限時間に達しました。", 408);
    await verifyBrowserGuardrails(browser);
    return browser;
  } catch (error) { await browser.close().catch(() => {}); throw error; }
}

/**
 * Renders one public page and lists its image and video candidates. The page itself is fetched by safe-fetch before
 * the browser starts; every request the page makes goes through the same fetcher. At the 40-second cut-off the
 * candidates found so far are returned, marked truncated, once the page itself has been fetched.
 */
export async function scanPage(input: string, injectedFetcher?: typeof safeFetch, launchBrowser: ScanLauncher = launchWorkerBrowser, options: ScanOptions = {}): Promise<ScanResult> {
  const controller = new AbortController();
  const expire = () => controller.abort();
  const clearDeadline = options.scheduleDeadline
    ? options.scheduleDeadline(expire, SCAN_MS)
    : (() => { const timer = setTimeout(expire, SCAN_MS); return () => clearTimeout(timer); })();
  let browser: ScanBrowser | undefined;
  let fetchedPage: string | undefined;
  const pending = new Set<Promise<void>>();
  const candidates: Candidate[] = [];
  let overflow = false;
  const add = (item: Candidate) => { if (candidates.length < MAX_RAW_CANDIDATES) candidates.push(item); else overflow = true; };
  const collect = (pageUrl: string, cutOff: boolean): ScanResult => {
    const { assets, truncated } = normalizeAssets(candidates, pageUrl);
    return { pageUrl, assets, truncated: truncated || overflow || cutOff };
  };
  const budget = new ByteBudget(TOTAL_BYTES);
  let requestCount = 0, activeRequests = 0;
  try {
    const fetcher = injectedFetcher ?? createWorkerSafeFetcher();
    const initial = await fetcher(validateUrl(input).href, { maxBytes: 4 * 1024 * 1024, signal: controller.signal, onBytes: budget.consume });
    if (initial.status < 200 || initial.status >= 300) throw new AppError("PAGE_UNAVAILABLE", initial.status === 401 || initial.status === 403 ? "サイト側でアクセスが制限されています。ログインや制限の回避は行いません。" : `ページを取得できませんでした（HTTP ${initial.status}）。URLを確認してください。`, 422);
    if (!/text\/html|application\/xhtml\+xml/i.test(initial.headers["content-type"] ?? "")) throw new AppError("NOT_A_PAGE", "画像ファイル自体ではなく、その画像が使われているWebページのURLを入力してください。", 422);
    const pageUrl = initial.url;
    fetchedPage = pageUrl;
    try { browser = await launchBrowser(controller.signal); }
    catch (error) { throw controller.signal.aborted ? error : classifyLaunchFailure(error); }
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block", acceptDownloads: false, permissions: [] });
    await context.routeWebSocket("**/*", socket => socket.close());
    await context.setOffline(true);
    await context.addInitScript("for (const key of ['RTCPeerConnection', 'webkitRTCPeerConnection']) { Object.defineProperty(globalThis, key, { value: undefined, writable: false, configurable: false }); }");
    let usedInitial = false;
    const handle = async (route: ScanRoute) => {
      const request = route.request();
      requestCount++;
      const inferred = inferKind(request.url());
      if (inferred) add({ url: request.url(), source: "通信", kind: inferred });
      if (!["GET", "HEAD"].includes(request.method()) || controller.signal.aborted || requestCount > 160 || !budget.remaining || activeRequests >= MAX_ACTIVE_REQUESTS) {
        await route.abort(); return;
      }
      if (["media", "font"].includes(request.resourceType())) { await route.abort(); return; }
      activeRequests++;
      try {
        let response: SafeResponse;
        if (!usedInitial && request.isNavigationRequest() && request.url() === pageUrl) { response = initial; usedInitial = true; }
        else {
          response = await fetcher(request.url(), { method: request.method() as "GET" | "HEAD", maxBytes: Math.min(5 * 1024 * 1024, budget.remaining), timeoutMs: 7000, signal: controller.signal, onBytes: budget.consume });
        }
        const mime = response.headers["content-type"] ?? "";
        const kind = inferKind(response.url, mime);
        if (kind) add({ url: response.url, source: "通信", kind, mime, bytes: response.body.length });
        // Relative CSS URLs must keep their redirected response's base URL.
        if (response.url !== request.url() && mime.includes("text/css")) response.body = Buffer.from(rebaseCss(response.body.toString("utf8"), response.url));
        if (request.resourceType() === "document" && request.url() !== pageUrl) { await route.abort(); return; }
        if (response.status >= 300 && response.status < 400) { await route.abort(); return; }
        await route.fulfill({ status: response.status, headers: cleanHeaders(response), body: response.body });
      } catch {
        // A refused request (blocked host, internal address, limit) is never fetched; the page renders without it.
        await route.abort().catch(() => {});
      }
      finally { activeRequests--; }
    };
    await context.route("**/*", route => {
      const task = handle(route).catch(() => {});
      pending.add(task); void task.finally(() => pending.delete(task));
      return task;
    });
    const page = await context.newPage();
    context.on("page", popup => { if (popup !== page) void popup.close(); });
    page.on("dialog", dialog => { void dialog.dismiss(); });
    const closeOnAbort = () => { void context.close().catch(() => {}); };
    controller.signal.addEventListener("abort", closeOnAbort, { once: true });
    try {
      // A page that does not finish loading still yields what it requested and rendered.
      await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => undefined);
      for (let step = 0; step < 5 && !controller.signal.aborted; step++) {
        await page.evaluate(() => window.scrollBy(0, 800));
        await page.waitForTimeout(350);
      }
      await page.waitForTimeout(600);
      const dom = await page.evaluate(DOM_SCRIPT) as { base: string; items: Candidate[] };
      if (dom.items.length >= MAX_DOM_ITEMS) overflow = true;
      for (const candidate of dom.items) {
        try { add({ ...candidate, url: new URL(candidate.url, dom.base).href }); } catch { /* Ignore invalid authored URL. */ }
      }
      return collect(pageUrl, controller.signal.aborted);
    } finally { controller.signal.removeEventListener("abort", closeOnAbort); }
  } catch (error) {
    if (controller.signal.aborted) {
      // The 40-second cut-off: after the page itself was fetched, keep what was found so far.
      const partial = fetchedPage === undefined ? undefined : collect(fetchedPage, true);
      if (partial?.assets.length) return partial;
      throw new AppError("SCAN_TIMEOUT", "解析が40秒の上限に達しました。軽いページや別のURLで再試行してください。", 504);
    }
    if (error instanceof AppError) throw error;
    const failure = new AppError("SCAN_FAILED", SCAN_FAILED_MESSAGE, 502);
    // Kept in memory only; API serialization never exposes the upstream error or URL.
    failure.cause = error;
    throw failure;
  } finally {
    clearDeadline(); controller.abort();
    await browser?.close().catch(() => {});
    await Promise.allSettled([...pending]);
  }
}
