import { test } from "node:test";
import assert from "node:assert/strict";
import { API_ERROR_STATUS, API_MESSAGES, apiError, apiErrorResponse, DEFAULT_BODY_MAX_BYTES, DOWNLOAD_BODY_MAX_BYTES, readJsonBody, type ApiErrorCode } from "../src/lib/api";
import { guardScan, guardTicketRoute, DEPENDENCY_RETRY_SEC } from "../src/lib/guard";
import { BUSY_MESSAGE, createLimiter, PREVIEW_CONCURRENCY, ZIP_CONCURRENCY } from "../src/lib/limiter";
import { context, issue, live, previewRequest, refused, scanRequest, LIVE_IMAGE } from "./helpers/guard-fixtures";

const EXPECTED_STATUS: Record<ApiErrorCode, number> = {
  INVALID_URL: 400, INVALID_TICKET: 400, BOT_CHECK_FAILED: 403, BLOCKED_HOST: 403, FORBIDDEN: 403, EXPIRED: 410,
  LIMIT_EXCEEDED: 413, UNSUPPORTED_PREVIEW: 415, PRIVATE_ADDRESS: 422, RATE_LIMITED: 429, BUSY: 503,
  SCAN_FAILED: 502, PAUSED: 503, DAILY_CAP_REACHED: 503,
};
const CODES = Object.keys(EXPECTED_STATUS) as ApiErrorCode[];

function jsonRequest(body: string | ReadableStream<Uint8Array>, headers: Record<string, string> = {}) {
  return new Request("https://pagecrate.example.com/api/download", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body, duplex: "half",
  } as RequestInit & { duplex: "half" });
}

test("api error response: each code has its status, the body is {code, message, retryAfterSec} and the hint is repeated in Retry-After", async () => {
  assert.deepEqual({ ...API_ERROR_STATUS }, EXPECTED_STATUS);
  for (const code of CODES) {
    const response = apiErrorResponse(apiError(code));
    assert.equal(response.status, EXPECTED_STATUS[code], code);
    assert.equal(response.headers.get("cache-control"), "no-store", code);
    assert.match(response.headers.get("content-type") ?? "", /^application\/json/, code);
    assert.equal(response.headers.has("retry-after"), false, code);
    assert.deepEqual(await response.json(), { code, message: API_MESSAGES[code] }, code);
  }
  const limited = apiErrorResponse(apiError("RATE_LIMITED", { retryAfterSec: 60 }));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  assert.deepEqual(await limited.json(), { code: "RATE_LIMITED", message: API_MESSAGES.RATE_LIMITED, retryAfterSec: 60 });
  // Retry-After takes whole seconds; a fraction rounds up and non-positive hints are dropped.
  assert.equal(apiErrorResponse(apiError("DAILY_CAP_REACHED", { retryAfterSec: 0.2 })).headers.get("retry-after"), "1");
  for (const hint of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const response = apiErrorResponse(apiError("BUSY", { retryAfterSec: hint }));
    assert.equal(response.headers.has("retry-after"), false, String(hint));
    assert.deepEqual(Object.keys(await response.json() as object).sort(), ["code", "message"], String(hint));
  }
});

test("api error response: BUSY is always 503 — crowded slots and failed dependencies alike — and only RATE_LIMITED answers 429", async () => {
  const response = apiErrorResponse(apiError("BUSY", { retryAfterSec: 30 }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "30");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await response.json(), { code: "BUSY", message: BUSY_MESSAGE, retryAfterSec: 30 });
  assert.equal(apiErrorResponse(apiError("BUSY")).status, 503);
  // The in-isolate slots (ZIP 1, preview 2) hand their refusal straight to the response.
  for (const [max, retry] of [[ZIP_CONCURRENCY, 10], [PREVIEW_CONCURRENCY, 3]] as const) {
    const limiter = createLimiter(max, retry);
    for (let index = 0; index < max; index += 1) assert.ok(limiter.acquire().ok);
    const crowded = limiter.acquire();
    assert.ok(!crowded.ok);
    const busy = apiErrorResponse(crowded.error);
    assert.deepEqual([busy.status, busy.headers.get("retry-after")], [503, String(retry)]);
  }
  // A failed dependency in either guard is the same 503, never a 429.
  const scan = refused(await guardScan(scanRequest(live()), context({ limits: { scan: new Error("binding down") } }).ctx));
  const preview = refused(await guardTicketRoute(previewRequest(`t=${await issue(LIVE_IMAGE)}`), "preview", context({ limits: { preview: new Error("binding down") } }).ctx));
  for (const error of [scan, preview]) {
    assert.deepEqual(error, { code: "BUSY", message: BUSY_MESSAGE, retryAfterSec: DEPENDENCY_RETRY_SEC });
    assert.equal(apiErrorResponse(error).status, 503);
  }
  const statuses = Object.entries(API_ERROR_STATUS).filter(([, status]) => status === 429).map(([code]) => code);
  assert.deepEqual(statuses, ["RATE_LIMITED"]);
  const custom = apiError("LIMIT_EXCEEDED", { message: "一度に保存できるのは50件までです。" });
  assert.deepEqual(await apiErrorResponse(custom).json(), { code: "LIMIT_EXCEEDED", message: "一度に保存できるのは50件までです。" });
});

test("api error messages: every code has a plain Japanese sentence and the busy text is the shared 混み合っています", () => {
  for (const code of CODES) {
    assert.match(API_MESSAGES[code], /[ぁ-んァ-ヶ一-龠]/u, code);
    assert.match(API_MESSAGES[code], /。$/, code);
  }
  assert.equal(API_MESSAGES.BUSY, BUSY_MESSAGE);
  assert.match(API_MESSAGES.PAUSED, /デモは使えます/);
  assert.match(API_MESSAGES.DAILY_CAP_REACHED, /本日の分は終了/);
  assert.match(API_MESSAGES.DAILY_CAP_REACHED, /日本時間の午前9時ごろ/);
  assert.match(API_MESSAGES.EXPIRED, /もう一度ページを取得/);
});

test("body limit per route: 16,000 bytes by default, 512 KiB for a ZIP request, and the stream stops at the limit", async () => {
  assert.equal(DEFAULT_BODY_MAX_BYTES, 16_000);
  assert.equal(DOWNLOAD_BODY_MAX_BYTES, 524_288);
  const near = (bytes: number) => JSON.stringify({ text: "x".repeat(bytes - 11) });
  assert.equal(near(16_000).length, 16_000);
  assert.equal((await readJsonBody(jsonRequest(near(16_000)))).ok, true);
  assert.deepEqual(await readJsonBody(jsonRequest(near(16_001))), { ok: false, reason: "TOO_LARGE" });
  assert.equal((await readJsonBody(jsonRequest(near(16_001)), DOWNLOAD_BODY_MAX_BYTES)).ok, true);
  assert.equal((await readJsonBody(jsonRequest(near(DOWNLOAD_BODY_MAX_BYTES)), DOWNLOAD_BODY_MAX_BYTES)).ok, true);
  assert.deepEqual(await readJsonBody(jsonRequest(near(DOWNLOAD_BODY_MAX_BYTES + 1)), DOWNLOAD_BODY_MAX_BYTES), { ok: false, reason: "TOO_LARGE" });
  // An endless body is cancelled as soon as it passes the limit, not read to the end.
  let pulls = 0, cancelled = false;
  const endless = new ReadableStream<Uint8Array>({ pull(controller) { pulls += 1; controller.enqueue(new Uint8Array(4096).fill(32)); }, cancel() { cancelled = true; } });
  assert.deepEqual(await readJsonBody(jsonRequest(endless), 10_000), { ok: false, reason: "TOO_LARGE" });
  assert.equal(cancelled, true);
  assert.ok(pulls <= 4, `pulled ${pulls} chunks`);
  for (const maxBytes of [0, -1, 1.5]) await assert.rejects(readJsonBody(jsonRequest("{}"), maxBytes), RangeError);
});

test("body reading reports why it failed: not JSON, empty, too large by its declared length, malformed", async () => {
  assert.deepEqual(await readJsonBody(jsonRequest("{}", { "content-type": "text/plain" })), { ok: false, reason: "NOT_JSON" });
  assert.deepEqual(await readJsonBody(new Request("https://pagecrate.example.com/api/scan", { method: "POST", headers: { "content-type": "application/json" } })), { ok: false, reason: "EMPTY" });
  assert.deepEqual(await readJsonBody(jsonRequest("{}", { "content-length": "16001" })), { ok: false, reason: "TOO_LARGE" });
  for (const text of ["{", "[1,2]", "null", "42", '"text"']) assert.deepEqual(await readJsonBody(jsonRequest(text)), { ok: false, reason: "MALFORMED" }, text);
  assert.deepEqual(await readJsonBody(jsonRequest('{"url":"https://example.com/"}')), { ok: true, value: { url: "https://example.com/" } });
});
