import { test } from "node:test";
import assert from "node:assert/strict";
import { IDLE_START_FLOW, startFlowStep, type StartFlowEffect, type StartFlowEvent, type StartFlowState } from "../src/lib/start-flow";

const PAGE = { url: "https://example.com/gallery" } as const;
const DEMO = { demo: true } as const;

/** Runs events from a state and returns the final state and every effect, in order. */
function run(events: readonly StartFlowEvent[], from: StartFlowState = IDLE_START_FLOW) {
  let state = from;
  const effects: StartFlowEffect[] = [];
  for (const event of events) {
    const next = startFlowStep(state, event);
    state = next.state;
    effects.push(next.effect);
  }
  return { state, effects, sent: effects.filter(effect => effect.type === "send") };
}

test("start flow: before the policy is confirmed nothing is sent; 'やめる' or Esc starts nothing", () => {
  for (const request of [PAGE, DEMO]) {
    const opened = run([{ type: "start", request, needsPolicy: true, live: "open" }]);
    assert.equal(opened.state.step, "policy");
    assert.deepEqual(opened.effects, [{ type: "none" }]);
    const cancelled = run([{ type: "start", request, needsPolicy: true, live: "open" }, { type: "policy-cancel" }]);
    assert.equal(cancelled.state.step, "idle");
    assert.deepEqual(cancelled.sent, [], "a cancelled check sends nothing");
    // A token cannot slip past the check either.
    assert.deepEqual(run([{ type: "start", request, needsPolicy: true, live: "open" }, { type: "token", token: "t1" }]).sent, []);
  }
});

test("start flow: '進む' carries on with the same start; the demo is sent at once without a bot check", () => {
  const demo = run([{ type: "start", request: DEMO, needsPolicy: true, live: "open" }, { type: "policy-proceed", live: "open" }]);
  assert.deepEqual(demo.sent, [{ type: "send", input: DEMO }]);
  assert.equal(demo.state.step, "idle");
  // The demo works without a site key, with or without the check.
  assert.deepEqual(run([{ type: "start", request: DEMO, needsPolicy: false, live: "unavailable" }]).sent, [{ type: "send", input: DEMO }]);
  const page = run([{ type: "start", request: PAGE, needsPolicy: true, live: "open" }, { type: "policy-proceed", live: "open" }]);
  assert.deepEqual(page.state, { step: "bot-check", url: PAGE.url, lastToken: null });
  assert.deepEqual(page.sent, [], "a page waits for its bot check");
});

test("start flow: a page scan is sent only with a bot-check token, and '待機をやめる' goes back without sending", () => {
  const waiting = run([{ type: "start", request: PAGE, needsPolicy: false, live: "open" }]);
  assert.equal(waiting.state.step, "bot-check");
  assert.deepEqual(run([{ type: "token", token: "t1" }], waiting.state).sent, [{ type: "send", input: PAGE, turnstileToken: "t1" }]);
  assert.deepEqual(run([{ type: "token", token: "" }], waiting.state).sent, [], "an empty token is not a token");
  const cancelled = run([{ type: "cancel-wait" }, { type: "token", token: "t1" }], waiting.state);
  assert.equal(cancelled.state.step, "idle");
  assert.deepEqual(cancelled.sent, [], "a token arriving after the wait was cancelled is dropped");
});

test("start flow: a token is sent once; the next scan (a retry too) waits for a new one", () => {
  const first = run([{ type: "start", request: PAGE, needsPolicy: false, live: "open" }, { type: "token", token: "t1" }]);
  assert.equal(first.state.lastToken, "t1");
  const again = run([{ type: "start", request: PAGE, needsPolicy: false, live: "open" }, { type: "token", token: "t1" }], first.state);
  assert.deepEqual(again.sent, [], "the same token is never sent twice");
  assert.equal(again.state.step, "bot-check");
  assert.deepEqual(run([{ type: "token", token: "t2" }], again.state).sent, [{ type: "send", input: PAGE, turnstileToken: "t2" }]);
  // The demo between two page scans does not reset the memory of the last token.
  const withDemo = run([{ type: "start", request: DEMO, needsPolicy: false, live: "open" }, { type: "start", request: PAGE, needsPolicy: false, live: "open" }, { type: "token", token: "t1" }], first.state);
  assert.deepEqual(withDemo.sent, [{ type: "send", input: DEMO }]);
});

test("start flow: without a usable site key a page scan is refused at once, before any policy check", () => {
  for (const needsPolicy of [true, false]) {
    const refused = run([{ type: "start", request: PAGE, needsPolicy, live: "unavailable" }]);
    assert.deepEqual(refused.effects, [{ type: "unavailable" }]);
    assert.equal(refused.state.step, "idle");
  }
  // A site key that disappears while the check is open also ends in the same answer.
  assert.deepEqual(run([{ type: "start", request: PAGE, needsPolicy: true, live: "open" }, { type: "policy-proceed", live: "unavailable" }]).effects.at(-1), { type: "unavailable" });
});

test("start flow: on a paused site a page scan is refused at once with the pause, before any policy check and without a bot check; the demo still starts", () => {
  for (const needsPolicy of [true, false]) {
    const refused = run([{ type: "start", request: PAGE, needsPolicy, live: "paused" }]);
    assert.deepEqual(refused.effects, [{ type: "paused" }], `needsPolicy ${needsPolicy}`);
    assert.deepEqual(refused.state, IDLE_START_FLOW, "nothing waits: no policy check, no bot check");
    // Pressing again is refused the same way, and a token cannot slip in.
    const again = run([{ type: "start", request: PAGE, needsPolicy, live: "paused" }, { type: "start", request: PAGE, needsPolicy, live: "paused" }, { type: "token", token: "t1" }]);
    assert.deepEqual(again.effects, [{ type: "paused" }, { type: "paused" }, { type: "none" }]);
  }
  // A pause that arrives while the check is open also ends in the pause, not in the bot check.
  assert.deepEqual(run([{ type: "start", request: PAGE, needsPolicy: true, live: "open" }, { type: "policy-proceed", live: "paused" }]).effects.at(-1), { type: "paused" });
  // The demo is never paused: the check the first time, then it is sent.
  assert.equal(run([{ type: "start", request: DEMO, needsPolicy: true, live: "paused" }]).state.step, "policy");
  assert.deepEqual(run([{ type: "start", request: DEMO, needsPolicy: true, live: "paused" }, { type: "policy-proceed", live: "paused" }]).sent, [{ type: "send", input: DEMO }]);
  assert.deepEqual(run([{ type: "start", request: DEMO, needsPolicy: false, live: "paused" }]).sent, [{ type: "send", input: DEMO }]);
  // A page scan that is not ready (no usable site key) keeps its own answer.
  assert.deepEqual(run([{ type: "start", request: PAGE, needsPolicy: true, live: "unavailable" }]).effects, [{ type: "unavailable" }]);
});

test("start flow: one start at a time, and events that do not fit the step change nothing", () => {
  const checking = run([{ type: "start", request: PAGE, needsPolicy: true, live: "open" }]).state;
  assert.deepEqual(startFlowStep(checking, { type: "start", request: DEMO, needsPolicy: false, live: "open" }), { state: checking, effect: { type: "none" } });
  const waiting = run([{ type: "policy-proceed", live: "open" }], checking).state;
  assert.deepEqual(startFlowStep(waiting, { type: "start", request: DEMO, needsPolicy: false, live: "open" }).effect, { type: "none" });
  for (const event of [{ type: "policy-proceed", live: "open" }, { type: "policy-cancel" }, { type: "token", token: "t9" }, { type: "cancel-wait" }] as const) {
    assert.deepEqual(startFlowStep(IDLE_START_FLOW, event), { state: IDLE_START_FLOW, effect: { type: "none" } }, event.type);
  }
  assert.deepEqual(startFlowStep(waiting, { type: "policy-cancel" }).state, waiting, "Esc of a closed check does not stop the bot check");
});
