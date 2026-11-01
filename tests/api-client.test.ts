import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apiErrorFromBody, DOWNLOAD_INCOMPLETE_MESSAGE, fetchPreview, isApiErrorCode, isPageUrl, isPreviewPath, NETWORK_MESSAGE,
  parseScanResponse, postDownload, postScan, readApiError, retryAfterHeaderSeconds, scanRequestBody,
} from "../src/lib/api-client";
import { API_ERROR_STATUS, API_MESSAGES, apiError, apiErrorResponse, type ApiErrorCode } from "../src/lib/api";
import type { ScanResponse } from "../src/lib/types";

type FetchCall = { input: string; init?: RequestInit };
function recordingFetch(answer: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const fetcher = async (input: string, init?: RequestInit) => { const call = { input, init }; calls.push(call); return answer(call); };
  return { fetcher, calls };
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const scan: ScanResponse = {
  pageUrl: "https://example.com/gallery", truncated: false, expiresAt: "2026-11-01T00:30:00.000Z",
  assets: [
    { id: "a1", kind: "image", name: "a.png", url: "https://example.com/a.png", format: "PNG", width: 640, height: 480, ticket: "t1", previewUrl: "/api/preview?t=t1" },
    { id: "s1", kind: "unsupported", name: "live.m3u8", url: "https://example.com/live.m3u8", reason: "HLS" },
  ],
};

test("api client: a JSON error gives the server's code, sentence and wait, for every code the server sends", async () => {
  for (const code of Object.keys(API_ERROR_STATUS) as ApiErrorCode[]) {
    const sent = apiErrorResponse(apiError(code, code === "BUSY" ? { retryAfterSec: 3 } : {}));
    const read = await readApiError(sent);
    assert.equal(read.code, code);
    assert.equal(read.message, API_MESSAGES[code]);
    assert.equal(read.status, API_ERROR_STATUS[code]);
    assert.equal(read.retryAfterSec, code === "BUSY" ? 3 : undefined, code);
    assert.equal(isApiErrorCode(code), true);
  }
  assert.equal(isApiErrorCode("toString"), false, "inherited names are not codes");
  assert.equal(isApiErrorCode("REQUEST_FAILED"), false);
});

test("api client: retryAfterSec comes from the body, then from Retry-After; anything else is dropped", async () => {
  assert.equal(apiErrorFromBody(429, { code: "RATE_LIMITED", message: "待って", retryAfterSec: 2.2 }).retryAfterSec, 3);
  assert.equal(apiErrorFromBody(503, { code: "BUSY", message: "混雑" }, "7").retryAfterSec, 7);
  assert.equal(apiErrorFromBody(503, { code: "BUSY", message: "混雑", retryAfterSec: 4 }, "9").retryAfterSec, 4, "the body wins");
  for (const bad of [-1, 0, Number.NaN, "5", null]) assert.equal(apiErrorFromBody(503, { code: "BUSY", message: "x", retryAfterSec: bad }).retryAfterSec, undefined, String(bad));
  for (const header of ["Wed, 21 Oct 2026 07:28:00 GMT", "-3", "1.5", "", "0"]) assert.equal(retryAfterHeaderSeconds(header), undefined, header);
  assert.equal(retryAfterHeaderSeconds(" 60 "), 60);
  const read = await readApiError(json(429, { code: "RATE_LIMITED", message: "待って" }, { "Retry-After": "60" }));
  assert.equal(read.retryAfterSec, 60);
});

test("api client: an answer that is not the API's JSON gets a sentence from its status", async () => {
  const html = (status: number) => new Response("<html>error</html>", { status, headers: { "Content-Type": "text/html" } });
  const fixed = await Promise.all([503, 410, 429, 413].map(status => readApiError(html(status))));
  assert.deepEqual(fixed.map(error => error.code), ["BUSY", "EXPIRED", "RATE_LIMITED", "LIMIT_EXCEEDED"]);
  for (const error of fixed) assert.match(error.message, /。$/);
  const notFound = await readApiError(html(404));
  assert.equal(notFound.code, "UNKNOWN");
  assert.match(notFound.message, /読み込み直して/);
  const serverFault = await readApiError(new Response("oops", { status: 500 }));
  assert.equal(serverFault.code, "UNKNOWN");
  assert.match(serverFault.message, /時間をおいて/);
  assert.notEqual(notFound.message, serverFault.message);
  const broken = await readApiError(new Response("{not json", { status: 503, headers: { "Content-Type": "application/json" } }));
  assert.equal(broken.code, "BUSY");
  const legacy = await readApiError(json(503, { error: "古い形", code: "SOMETHING_OLD" }));
  assert.deepEqual([legacy.code, legacy.message === "古い形"], ["BUSY", false], "only {code, message} is read");
  assert.equal(apiErrorFromBody(410, { code: "EXPIRED", message: "  " }).message.length > 10, true, "an empty sentence is replaced");
  assert.equal(apiErrorFromBody(502, ["SCAN_FAILED"]).code, "UNKNOWN");
});

test("api client: a failed connection is NETWORK_ERROR, and an abort is not an error at all", async () => {
  const offline = await postScan({ url: "https://example.com/" }, { fetcher: async () => { throw new TypeError("Failed to fetch"); } });
  assert.deepEqual(offline, { ok: false, aborted: false, error: { code: "NETWORK_ERROR", message: NETWORK_MESSAGE } });
  const controller = new AbortController();
  controller.abort();
  const stopped = await postScan({ demo: true }, { signal: controller.signal, fetcher: async () => { throw new DOMException("aborted", "AbortError"); } });
  assert.deepEqual(stopped, { ok: false, aborted: true });
  const brokenZip = await postDownload(["t1"], { fetcher: async () => new Response(new ReadableStream({ pull(c) { c.error(new TypeError("network")); } })) });
  assert.deepEqual(brokenZip, { ok: false, aborted: false, error: { code: "NETWORK_ERROR", message: DOWNLOAD_INCOMPLETE_MESSAGE } });
  const garbage = await postScan({ demo: true }, { fetcher: async () => json(200, { assets: "none" }) });
  assert.equal(garbage.ok === false && !garbage.aborted && garbage.error.code, "UNKNOWN");
});

test("api client: the scan sends {url} or {demo: true} as JSON, and a token only with a page", async () => {
  assert.deepEqual(scanRequestBody({ url: "https://example.com/" }), { url: "https://example.com/" });
  assert.deepEqual(scanRequestBody({ url: "https://example.com/" }, "token-1"), { url: "https://example.com/", turnstileToken: "token-1" });
  assert.deepEqual(scanRequestBody({ demo: true }, "token-1"), { demo: true });
  const { fetcher, calls } = recordingFetch(() => json(200, scan));
  const result = await postScan({ url: "https://example.com/gallery" }, { fetcher });
  assert.deepEqual(result, { ok: true, value: scan });
  assert.equal(calls[0].input, "/api/scan");
  assert.equal(calls[0].init?.method, "POST");
  assert.deepEqual(new Headers(calls[0].init?.headers).get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { url: "https://example.com/gallery" }, "no rightsConfirmed any more");
  const refused = await postScan({ url: "https://example.com/" }, { fetcher: async () => json(429, { code: "RATE_LIMITED", message: "続けて使われています。", retryAfterSec: 60 }) });
  assert.deepEqual(refused, { ok: false, aborted: false, error: { code: "RATE_LIMITED", message: "続けて使われています。", status: 429, retryAfterSec: 60 } });
});

test("api client: the save sends {tickets} and returns the ZIP; an error answer is read like any other", async () => {
  const { fetcher, calls } = recordingFetch(() => new Response(new Uint8Array([80, 75, 3, 4]), { headers: { "Content-Type": "application/zip" } }));
  const saved = await postDownload(["t1", "t2"], { fetcher });
  assert.equal(saved.ok && saved.value.size, 4);
  assert.equal(calls[0].input, "/api/download");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { tickets: ["t1", "t2"] });
  const expired = await postDownload(["t1"], { fetcher: async () => json(410, { code: "EXPIRED", message: "期限切れ" }) });
  assert.deepEqual(expired, { ok: false, aborted: false, error: { code: "EXPIRED", message: "期限切れ", status: 410 } });
});

test("api client: a preview answer becomes a Blob, an error gives status, code and wait, and a non-image is 415", async () => {
  const signal = new AbortController().signal;
  const image = await fetchPreview("/api/preview?t=t1", signal, async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } }));
  assert.equal(image.ok && image.value.size, 3);
  const busy = await fetchPreview("/api/preview?t=t1", signal, async () => json(503, { code: "BUSY", message: "混雑" }, { "Retry-After": "3" }));
  assert.deepEqual(busy, { ok: false, status: 503, code: "BUSY", retryAfterSec: 3 });
  const page = await fetchPreview("/api/preview?t=t1", signal, async () => new Response("<html>", { headers: { "Content-Type": "text/html" } }));
  assert.deepEqual(page, { ok: false, status: 415 });
  await assert.rejects(fetchPreview("/api/preview?t=t1", signal, async () => { throw new TypeError("Failed to fetch"); }));
});

test("api client: the scan answer is used as sent, and a body without its shape is refused", () => {
  assert.equal(parseScanResponse(scan), scan, "the same object, not a copy");
  const broken: unknown[] = [
    null, [], { ...scan, expiresAt: "later" }, { ...scan, truncated: "no" }, { ...scan, assets: {} },
    { ...scan, assets: [{ ...scan.assets[0], kind: "audio" }] }, { ...scan, assets: [{ ...scan.assets[0], width: "640" }] },
    { ...scan, assets: [{ ...scan.assets[0], ticket: 7 }] }, { pageUrl: scan.pageUrl, assets: [], truncated: false },
  ];
  for (const body of broken) assert.equal(parseScanResponse(body), null, JSON.stringify(body));
});

test("api client: page and preview addresses", () => {
  for (const url of ["https://example.com/gallery", "http://example.com"]) assert.equal(isPageUrl(url), true, url);
  for (const url of ["example.com", "ftp://example.com/file", "https://user:synthetic@example.test/", "javascript:alert(1)", ""]) assert.equal(isPageUrl(url), false, url);
  assert.equal(isPreviewPath("/api/preview?t=abc"), true);
  for (const path of ["/api/preview?t=", "https://example.com/api/preview?t=abc", "//example.com/api/preview?t=a", "/api/download", 3]) assert.equal(isPreviewPath(path), false, String(path));
});
