import { test } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../src/lib/errors";
import { BUSY_MESSAGE } from "../src/lib/limiter";
import type { SafeResponse } from "../src/lib/safe-fetch";
import { classifyLaunchFailure, scanPage, type ScanBrowser, type ScanLauncher } from "../src/lib/scanner";

const PAGE = "https://fixture.example.com/page";
// The page itself is fetched before the browser starts; this fake answers it without any network.
const pageFetcher = async (input: string): Promise<SafeResponse> => ({ status: 200, headers: { "content-type": "text/html" }, body: Buffer.from("<!doctype html><title>t</title>"), url: input });
const failingLauncher = (error: unknown): ScanLauncher => async () => { throw error; };

test("launch failure classification: Browser Run's concurrency and launch-rate refusals become BUSY 503, other failures stay SCAN_FAILED 502", () => {
  for (const error of [
    new Error("Unable to create new browser: code: 429: message: Rate limit exceeded"),
    new Error("Unable to connect to browser: code: 429: message: Too many concurrent sessions"),
    new Error("Browser time limit exceeded for today"),
    new Error("You have reached your concurrent browser limit"),
    new Error("rate-limited, retry later"),
    new Error("ratelimited"),
    "429 Too Many Requests",
    Object.assign(new Error("refused"), { status: 429 }),
    { code: 429, message: "refused" },
  ]) {
    const result = classifyLaunchFailure(error);
    assert.deepEqual([result.code, result.status, result.message], ["BUSY", 503, BUSY_MESSAGE], String(error instanceof Error ? error.message : JSON.stringify(error)));
    assert.equal(result.cause, error);
  }
  for (const error of [
    new Error("Unable to create new browser: code: 500: message: internal error"),
    new Error("Failed to generate a session"),
    new Error("unlimited retries are not allowed"),
    new Error("The operation was aborted due to timeout"),
    new TypeError("fetch failed"),
    new Error("No binding found for BROWSER"),
    null, undefined, 42, { status: 500 },
  ]) {
    const result = classifyLaunchFailure(error);
    assert.deepEqual([result.code, result.status], ["SCAN_FAILED", 502], String(error instanceof Error ? error.message : error));
    assert.match(result.message, /時間をおいて再試行/);
  }
  const guard = new AppError("BROWSER_GUARD", "ブラウザの通信制限を確認できないため解析を停止しました。", 503);
  assert.equal(classifyLaunchFailure(guard), guard);
});

test("classified launch failures never put the upstream text in the user message", () => {
  for (const text of ["Unable to create new browser: code: 429: message: account abc123 over limit", "Unable to create new browser: code: 500: secret-ish detail"]) {
    const result = classifyLaunchFailure(new Error(text));
    assert.equal(result.message.includes("abc123") || result.message.includes("secret-ish") || result.message.includes("code:"), false, text);
  }
});

test("scanPage: a 429 launch refusal answers BUSY 503, other launch errors stay SCAN_FAILED 502, and launcher AppErrors pass through", async () => {
  await assert.rejects(scanPage(PAGE, pageFetcher, failingLauncher(new Error("Unable to create new browser: code: 429: message: Rate limit exceeded"))),
    { code: "BUSY", status: 503, message: BUSY_MESSAGE });
  await assert.rejects(scanPage(PAGE, pageFetcher, failingLauncher(new Error("Unable to create new browser: code: 500: message: boom"))),
    { code: "SCAN_FAILED", status: 502 });
  await assert.rejects(scanPage(PAGE, pageFetcher, failingLauncher(new AppError("BROWSER_UNAVAILABLE", "ブラウザ解析の接続先が設定されていません。", 503))),
    { code: "BROWSER_UNAVAILABLE", status: 503 });
});

test("scanPage: only the launch is classified — a later error mentioning a limit is still SCAN_FAILED", async () => {
  let closed = false;
  const launched: ScanBrowser = {
    newContext: async () => { throw new Error("context rate limit exceeded"); },
    close: async () => { closed = true; },
  };
  await assert.rejects(scanPage(PAGE, pageFetcher, async () => launched), { code: "SCAN_FAILED", status: 502 });
  assert.equal(closed, true);
});
