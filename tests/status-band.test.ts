import { test } from "node:test";
import assert from "node:assert/strict";
import { API_MESSAGES, type ApiErrorCode } from "../src/lib/api";
import type { ClientErrorCode } from "../src/lib/api-client";
import { DEFAULT_WAIT_SEC, describeStatus, LIVE_PAUSED, LIVE_UNAVAILABLE, LOCAL_EXPIRED, waitEstimate, waitPhrase, type StatusSubject } from "../src/lib/status-band";

/** Every code the API can send (a Record keeps the list complete), plus the screen's own codes. */
const API_CODES: Record<ApiErrorCode, true> = {
  INVALID_URL: true, BOT_CHECK_FAILED: true, BLOCKED_HOST: true, PRIVATE_ADDRESS: true, RATE_LIMITED: true, BUSY: true, PAUSED: true,
  DAILY_CAP_REACHED: true, SCAN_FAILED: true, INVALID_TICKET: true, EXPIRED: true, UNSUPPORTED_PREVIEW: true, LIMIT_EXCEEDED: true, FORBIDDEN: true,
};
const ALL_CODES: ClientErrorCode[] = [...Object.keys(API_CODES) as ApiErrorCode[], "NETWORK_ERROR", "UNKNOWN", "LIVE_UNAVAILABLE"];
const SUBJECTS: StatusSubject[] = ["scan", "download"];
const describe = (code: ClientErrorCode, extra: { retryAfterSec?: number; subject?: StatusSubject } = {}) =>
  describeStatus({ subject: extra.subject ?? "scan", error: { code, message: `サーバーの文（${code}）`, ...(extra.retryAfterSec === undefined ? {} : { retryAfterSec: extra.retryAfterSec }) } });

test("status band: every state has a heading, the server's own sentence, an estimate, and a next step", () => {
  for (const subject of SUBJECTS) {
    for (const code of ALL_CODES) {
      const description = describe(code, { subject });
      assert.ok(description.title.length > 0, `${subject} ${code}: heading`);
      assert.equal(description.message, `サーバーの文（${code}）`, `${subject} ${code}: the server's sentence as it is`);
      assert.ok(description.estimate.length > 0, `${subject} ${code}: estimate`);
      assert.ok(description.action !== null || description.nextStep.length > 0, `${subject} ${code}: a button or words for the next step`);
      assert.ok(description.nextStep.length > 0, `${subject} ${code}: next step in words`);
    }
  }
  // Every API code except the preview-only one has its own heading, not the default.
  const fallbackTitles = new Set(["ページを取得できませんでした", "ZIPを作成できませんでした"]);
  for (const code of Object.keys(API_CODES) as ApiErrorCode[]) {
    if (code === "UNSUPPORTED_PREVIEW") continue;
    assert.equal(fallbackTitles.has(describe(code).title), false, code);
  }
});

test("status band: rate limit and crowding wait out the server's seconds (60 and 30 when it sends none)", () => {
  assert.deepEqual(DEFAULT_WAIT_SEC, { RATE_LIMITED: 60, BUSY: 30 });
  const limited = describe("RATE_LIMITED", { retryAfterSec: 2.5 });
  assert.deepEqual([limited.title, limited.waitSec, limited.action?.kind, limited.action?.label, limited.estimate], ["続けて使われています", 3, "retry", "もう一度試す", "あと3秒ほどで、もう一度試せます。"]);
  assert.deepEqual([describe("RATE_LIMITED").waitSec, describe("RATE_LIMITED").estimate], [60, "あと1分ほどで、もう一度試せます。"]);
  const busy = describe("BUSY");
  assert.deepEqual([busy.title, busy.waitSec, busy.estimate], ["混み合っています", 30, "あと30秒ほどで、もう一度試せます。"]);
  for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(describe("BUSY", { retryAfterSec: bad }).waitSec, 30, `BUSY ${bad}`);
    assert.equal(describe("SCAN_FAILED", { retryAfterSec: bad }).waitSec, undefined, `SCAN_FAILED ${bad}`);
  }
  assert.equal(describe("SCAN_FAILED", { retryAfterSec: 4 }).waitSec, 4, "a wait the server asks for is honoured for any retry");
  assert.equal(describe("BUSY", { subject: "download", retryAfterSec: 10 }).waitSec, 10);
});

test("status band: a pause, a closed day and an unready live mode offer the demo and never count down", () => {
  for (const [code, title] of [["PAUSED", "実サイトの取得は、いまお休み中です"], ["DAILY_CAP_REACHED", "本日の分は終了しました"], ["LIVE_UNAVAILABLE", "いまは実サイトの取得を準備できていません"]] as const) {
    const description = describe(code, { retryAfterSec: 30_000 });
    assert.equal(description.title, title);
    assert.deepEqual(description.action, { kind: "demo", label: "デモを試す", primary: true });
    assert.equal(description.waitSec, undefined, `${code}: waiting at the screen does not bring it back`);
  }
  assert.match(describe("DAILY_CAP_REACHED").estimate, /日本時間の午前9時ごろに再開します/);
  assert.equal(describe("PAUSED").estimate, "再開の時期は未定です。");
  assert.match(LIVE_UNAVAILABLE.message, /デモは使えます/);
});

// Until the UI scoring of the paused screens (round 1), the band's body was the server's PAUSED sentence word for word,
// and a test kept the two equal. The heading already says the pause, so the body said it a second time, and with the
// note above the field the screen told one fact three times. That equality is dropped on purpose: the body now gives
// the next step, while the heading, the estimate and the button stay the pause's whoever noticed it. The server's
// sentence stays a whole sentence for the API, read on its own (next test).
test("status band: the screen's own pause has its own body, the next step (not the server's sentence, not the heading again); heading, estimate and button are the pause's whoever noticed it", () => {
  assert.deepEqual({ ...LIVE_PAUSED }, { code: "PAUSED", message: "デモなら、自作の素材で同じ流れを試せます。" });
  assert.notEqual(LIVE_PAUSED.message, API_MESSAGES.PAUSED);
  const own = describeStatus({ subject: "scan", error: LIVE_PAUSED });
  const server = describeStatus({ subject: "scan", error: { code: "PAUSED", message: API_MESSAGES.PAUSED } });
  assert.equal(own.message, "デモなら、自作の素材で同じ流れを試せます。");
  assert.equal(own.message.includes("お休み"), false, "the body does not repeat the heading");
  assert.equal(server.message, API_MESSAGES.PAUSED, "a PAUSED answer from the server shows the server's sentence");
  for (const [who, description] of [["the screen", own], ["the server", server]] as const) {
    assert.deepEqual([description.title, description.estimate, description.waitSec], ["実サイトの取得は、いまお休み中です", "再開の時期は未定です。", undefined], who);
    assert.deepEqual(description.action, { kind: "demo", label: "デモを試す", primary: true }, who);
  }
  // A pause is told apart from a live mode that is not ready.
  assert.notEqual(describeStatus({ subject: "scan", error: LIVE_UNAVAILABLE }).title, own.title);
});

test("status band: only a pause is calm (the always-on note's look and the info mark); every other state keeps the warning look", () => {
  for (const subject of SUBJECTS) {
    for (const code of ALL_CODES) assert.equal(describe(code, { subject }).tone, code === "PAUSED" ? "calm" : "alert", `${subject} ${code}`);
  }
  assert.equal(describeStatus({ subject: "scan", error: LIVE_PAUSED }).tone, "calm");
});

test("API: the server's PAUSED sentence reads whole on its own: the pause in the screens' words, and that the demo works", () => {
  assert.equal(API_MESSAGES.PAUSED, "いまは、実際のサイトの取得をお休みしています。デモは使えます。");
  assert.equal(API_MESSAGES.PAUSED.includes("止めています"), false);
});

test("status band: an expired result or an unknown ticket makes 'もう一度取得' the main button", () => {
  for (const subject of SUBJECTS) {
    for (const code of ["EXPIRED", "INVALID_TICKET"] as const) {
      assert.deepEqual(describe(code, { subject }).action, { kind: "rescan", label: "もう一度取得", primary: true }, `${subject} ${code}`);
    }
  }
  const local = describeStatus({ subject: "scan", error: LOCAL_EXPIRED });
  assert.deepEqual([local.title, local.action?.kind], ["取得から30分が過ぎました", "rescan"]);
  assert.match(local.estimate, /30分/);
  assert.match(LOCAL_EXPIRED.message, /30分/);
});

test("status band: an address problem leads back to the URL field; too much to save and a foreign screen have no button", () => {
  for (const code of ["BLOCKED_HOST", "PRIVATE_ADDRESS", "INVALID_URL"] as const) assert.deepEqual(describe(code).action, { kind: "url", label: "URL欄へ戻る", primary: false }, code);
  const limit = describe("LIMIT_EXCEEDED", { subject: "download" });
  assert.equal(limit.action, null);
  assert.match(limit.nextStep, /選ぶ素材を減らして/);
  assert.match(limit.estimate, /50点/);
  const forbidden = describe("FORBIDDEN");
  assert.equal(forbidden.action, null);
  assert.match(forbidden.nextStep, /開き直して/);
});

test("status band: a failed bot check retries with a new check, and the rest retry with their own headings", () => {
  const bot = describe("BOT_CHECK_FAILED");
  assert.deepEqual([bot.title, bot.action?.kind, bot.action?.label], ["確認に失敗しました", "retry", "確認してもう一度試す"]);
  assert.deepEqual([describe("SCAN_FAILED").title, describe("SCAN_FAILED").action?.kind], ["ページを解析できませんでした", "retry"]);
  assert.deepEqual([describe("NETWORK_ERROR").title, describe("NETWORK_ERROR").action?.kind], ["接続できませんでした", "retry"]);
  assert.equal(describe("UNKNOWN").title, "ページを取得できませんでした");
  assert.equal(describe("UNKNOWN", { subject: "download" }).title, "ZIPを作成できませんでした");
});

test("status band: waits read as seconds under a minute and as whole minutes beyond", () => {
  assert.deepEqual([3, 59.2, 60, 61, 3_600, -1].map(waitPhrase), ["3秒ほど", "1分ほど", "1分ほど", "2分ほど", "60分ほど", "0秒ほど"]);
  assert.deepEqual([waitEstimate(5), waitEstimate(0), waitEstimate(-2)], ["あと5秒ほどで、もう一度試せます。", "もう一度試せます。", "もう一度試せます。"]);
});
