import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INITIAL_TURNSTILE_STATE, TURNSTILE_EXPIRY_MARGIN_MS, TURNSTILE_SCRIPT_URL, TURNSTILE_TOKEN_TTL_MS, TURNSTILE_WIDGET_ACTION,
  parseTurnstileSiteKey, tokenRefreshReason, turnstileStep, type TurnstileEvent, type TurnstileState,
} from "../src/lib/turnstile-client";
import { TURNSTILE_ACTION } from "../src/lib/guard";

const fresh = (issuedAt = 1_000) => ({ value: "token-a", issuedAt, used: false });
/** Runs events from a state and returns every step, so a test can read what each event asked the widget to do. */
function run(events: readonly TurnstileEvent[], from: TurnstileState = INITIAL_TURNSTILE_STATE) {
  let state = from;
  return events.map(event => {
    const next = turnstileStep(state, event);
    state = next.state;
    return next;
  });
}

test("turnstile token: valid for 300 seconds less the margin, then it must be fetched again", () => {
  assert.equal(TURNSTILE_TOKEN_TTL_MS, 300_000);
  assert.ok(TURNSTILE_EXPIRY_MARGIN_MS > 0 && TURNSTILE_EXPIRY_MARGIN_MS <= 30_000, "the margin stays small next to 300 seconds");
  const issuedAt = 5_000;
  const lastGood = issuedAt + TURNSTILE_TOKEN_TTL_MS - TURNSTILE_EXPIRY_MARGIN_MS - 1;
  assert.equal(tokenRefreshReason(fresh(issuedAt), issuedAt), null);
  assert.equal(tokenRefreshReason(fresh(issuedAt), lastGood), null);
  assert.equal(tokenRefreshReason(fresh(issuedAt), lastGood + 1), "expired");
  assert.equal(tokenRefreshReason(fresh(issuedAt), issuedAt + TURNSTILE_TOKEN_TTL_MS), "expired");
  assert.equal(tokenRefreshReason(fresh(issuedAt), issuedAt + 10 * TURNSTILE_TOKEN_TTL_MS), "expired");
});

test("turnstile token: one use only, and a missing or unreadable token is never sent", () => {
  assert.equal(tokenRefreshReason({ ...fresh(), used: true }, 1_000), "used", "a used token is refused even when it is fresh");
  assert.equal(tokenRefreshReason(null, 1_000), "missing");
  assert.equal(tokenRefreshReason({ ...fresh(), value: "" }, 1_000), "missing");
  assert.equal(tokenRefreshReason(fresh(10_000), 9_999), "expired", "a clock that went backwards proves nothing");
  for (const now of [Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(tokenRefreshReason(fresh(), now), "expired", String(now));
  assert.equal(tokenRefreshReason(fresh(Number.NaN), 1_000), "expired");
});

test("turnstile widget steps: a token is handed over once, and the next take starts a new check", () => {
  const [, issued, first, second, again, third] = run([
    { type: "rendered" },
    { type: "issued", value: "token-a", at: 1_000 },
    { type: "take", at: 2_000 },
    { type: "take", at: 2_001 },
    { type: "issued", value: "token-b", at: 3_000 },
    { type: "take", at: 3_500 },
  ]);
  assert.equal(issued.state.status, "ready");
  assert.deepEqual([first.taken, first.reset, first.state.status], ["token-a", false, "stale"]);
  assert.equal(first.state.token?.used, true);
  assert.deepEqual([second.taken, second.reset, second.state.status], [null, true, "waiting"], "the used token is not handed over again");
  assert.equal(again.state.status, "ready");
  assert.deepEqual([third.taken, third.reset], ["token-b", false]);
});

test("turnstile widget steps: an old token is fetched again instead of being sent", () => {
  const issuedAt = 1_000;
  const tooOld = issuedAt + TURNSTILE_TOKEN_TTL_MS - TURNSTILE_EXPIRY_MARGIN_MS;
  const [, stale] = run([{ type: "issued", value: "token-a", at: issuedAt }, { type: "take", at: tooOld }]);
  assert.deepEqual([stale.taken, stale.reset, stale.state.status, stale.state.token], [null, true, "waiting", null]);
  const [, inTime] = run([{ type: "issued", value: "token-a", at: issuedAt }, { type: "take", at: tooOld - 1 }]);
  assert.equal(inTime.taken, "token-a");
  // Turnstile's own expiry: the token is dropped and the next take resets.
  const [, expired, afterExpiry] = run([{ type: "issued", value: "token-a", at: issuedAt }, { type: "expired" }, { type: "take", at: issuedAt + 1 }]);
  assert.deepEqual([expired.state.status, expired.state.token], ["stale", null]);
  assert.deepEqual([afterExpiry.taken, afterExpiry.reset], [null, true]);
});

test("turnstile widget steps: errors are fetched again, a running check is left alone", () => {
  const [loadingTake, rendered, waitingTake] = run([{ type: "take", at: 0 }, { type: "rendered" }, { type: "take", at: 1 }]);
  assert.deepEqual([loadingTake.taken, loadingTake.reset, loadingTake.state.status], [null, false, "loading"]);
  assert.equal(rendered.state.status, "waiting");
  assert.deepEqual([waitingTake.taken, waitingTake.reset, waitingTake.state.status], [null, false, "waiting"]);

  const [failed, retried, retryAgain] = run([{ type: "failed" }, { type: "retry" }, { type: "retry" }], { status: "ready", token: fresh() });
  assert.deepEqual([failed.state.status, failed.state.token], ["error", null], "a failure drops the token");
  assert.deepEqual([retried.reset, retried.state.status], [true, "waiting"]);
  assert.deepEqual([retryAgain.reset, retryAgain.state.status], [false, "waiting"], "retry does nothing while a check runs");

  const [, takeAfterError] = run([{ type: "failed" }, { type: "take", at: 5 }]);
  assert.deepEqual([takeAfterError.taken, takeAfterError.reset, takeAfterError.state.status], [null, true, "waiting"]);
  const [emptyToken] = run([{ type: "issued", value: "", at: 1 }]);
  assert.deepEqual([emptyToken.state.status, emptyToken.state.token], ["error", null]);
});

test("turnstile widget: renders the action the server checks and loads Cloudflare's script explicitly", () => {
  assert.equal(TURNSTILE_WIDGET_ACTION, TURNSTILE_ACTION);
  const script = new URL(TURNSTILE_SCRIPT_URL);
  assert.equal(script.origin, "https://challenges.cloudflare.com");
  assert.equal(script.pathname, "/turnstile/v0/api.js");
  assert.equal(script.searchParams.get("render"), "explicit");
});

test("turnstile site key: only a plausible public key reaches the page; anything else closes page scans", () => {
  // Cloudflare's published test key, and the shape of a real one.
  for (const key of ["1x00000000000000000000AA", "0x4AAAAAAA_bc-DEF123", "a".repeat(8), "Z".repeat(64)]) assert.equal(parseTurnstileSiteKey(key), key, key);
  assert.equal(parseTurnstileSiteKey("  1x00000000000000000000AA \n"), "1x00000000000000000000AA", "surrounding space is dropped");
  for (const bad of [undefined, null, 42, {}, "", "   ", "short", "a".repeat(7), "a".repeat(65), "key with space", "key/with/slash", "キーです12345678", "<script>alert(1)</script>", "0x4AAAA\"onload=\"x"]) {
    assert.equal(parseTurnstileSiteKey(bad), null, String(bad));
  }
});
