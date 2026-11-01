import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUSY_RETRY_SEC, createPreviewQueue, MAX_RETRY_WAIT_SEC, PREVIEW_MAX_ATTEMPTS, PREVIEW_MAX_CONCURRENT, previewFailureEnd,
  previewRetryDelaySec, RATE_LIMIT_RETRY_SEC, type PreviewOutcome, type PreviewQueueOptions,
} from "../src/lib/preview-queue";
import { PREVIEW_CONCURRENCY } from "../src/lib/limiter";
import { failure, fakeClock, fakeFetcher, flush, loaded } from "./helpers/preview-fakes";

const HOUR = 3_600_000;

function harness(overrides: Partial<PreviewQueueOptions<string>> = {}, expiresInMs = HOUR) {
  const clock = fakeClock();
  const fetcher = fakeFetcher();
  const outcomes = new Map<string, PreviewOutcome<string>>();
  let expiredCalls = 0;
  const queue = createPreviewQueue<string>({
    fetchPreview: fetcher.fetchPreview, expiresAtMs: clock.now() + expiresInMs,
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    onExpired: () => { expiredCalls += 1; },
    ...overrides,
  });
  const ask = (path: string) => queue.request(path, outcome => {
    assert.equal(outcomes.has(path), false, `${path} is answered once`);
    outcomes.set(path, outcome);
  });
  return { clock, fetcher, queue, outcomes, ask, expiredCalls: () => expiredCalls };
}

test("preview queue: at most two previews run at once, the server's limit, and the rest start in order", async () => {
  assert.equal(PREVIEW_MAX_CONCURRENT, PREVIEW_CONCURRENCY, "the screen's limit is the server's per-isolate limit");
  const { fetcher, queue, outcomes, ask } = harness();
  for (const path of ["a", "b", "c", "d", "e"]) ask(path);
  assert.deepEqual(fetcher.paths(), ["a", "b"]);
  assert.equal(queue.running, 2);
  assert.equal(queue.waiting, 3);
  await fetcher.calls[1].answer(loaded("B"));
  assert.deepEqual(fetcher.paths(), ["a", "b", "c"]);
  await fetcher.calls[0].answer(loaded("A"));
  await fetcher.calls[2].answer(loaded("C"));
  assert.deepEqual(fetcher.paths(), ["a", "b", "c", "d", "e"]);
  await fetcher.calls[3].answer(loaded("D"));
  await fetcher.calls[4].answer(loaded("E"));
  assert.equal(fetcher.maxInFlight, 2, "never more than two fetches in flight");
  assert.deepEqual([...outcomes.values()].map(outcome => outcome.kind === "loaded" ? outcome.value : outcome.kind).sort(), ["A", "B", "C", "D", "E"]);
  assert.equal(queue.running, 0);
  assert.equal(queue.waiting, 0);
});

test("preview queue: a 503 waits the server's seconds, nothing else starts meanwhile, and the retry goes first", async () => {
  const { clock, fetcher, outcomes, ask } = harness();
  for (const path of ["a", "b", "c"]) ask(path);
  await fetcher.calls[0].answer(failure(503, "BUSY", 2));
  assert.equal(outcomes.has("a"), false, "a busy answer is not shown as a failure");
  await fetcher.calls[1].answer(loaded("B"));
  assert.deepEqual(fetcher.paths(), ["a", "b"], "both slots are free, but the queue waits");
  await clock.advance(1_999);
  assert.deepEqual(fetcher.paths(), ["a", "b"]);
  await clock.advance(1);
  assert.deepEqual(fetcher.paths(), ["a", "b", "a", "c"], "after 2 s the retried preview starts before the next one");
  await fetcher.calls[2].answer(loaded("A"));
  await fetcher.calls[3].answer(loaded("C"));
  assert.deepEqual(outcomes.get("a"), { kind: "loaded", value: "A" });
  assert.equal(fetcher.maxInFlight, 2);
});

test("preview queue: without a hint, 503 waits 3 s and 429 waits 60 s", async () => {
  assert.equal(BUSY_RETRY_SEC, 3);
  assert.equal(RATE_LIMIT_RETRY_SEC, 60);
  const { clock, fetcher, outcomes, ask } = harness();
  ask("a");
  await fetcher.calls[0].answer(failure(503));
  await clock.advance(2_999);
  assert.equal(fetcher.calls.length, 1);
  await clock.advance(1);
  assert.equal(fetcher.calls.length, 2);
  await fetcher.calls[1].answer(failure(429, "RATE_LIMITED"));
  await clock.advance(59_999);
  assert.equal(fetcher.calls.length, 2);
  await clock.advance(1);
  assert.equal(fetcher.calls.length, 3);
  await fetcher.calls[2].answer(loaded("A"));
  assert.deepEqual(outcomes.get("a"), { kind: "loaded", value: "A" });
  assert.deepEqual([previewRetryDelaySec({ status: 429, retryAfterSec: 7.2 }), previewRetryDelaySec({ status: 503, retryAfterSec: 0 })], [8, 3]);
});

test("preview queue: 410, 415, a pause and other errors are not retried", async () => {
  const { fetcher, outcomes, ask, expiredCalls, queue } = harness();
  for (const path of ["paused", "unsupported"]) ask(path);
  await fetcher.calls[0].answer(failure(503, "PAUSED"));
  await fetcher.calls[1].answer(failure(415, "UNSUPPORTED_PREVIEW"));
  for (const [path, status] of [["bad-ticket", 400], ["blocked", 403], ["private", 422], ["failed", 502]] as const) {
    ask(path);
    await fetcher.calls.at(-1)!.answer(failure(status));
  }
  assert.equal(fetcher.calls.length, 6, "each was asked once");
  assert.deepEqual(Object.fromEntries([...outcomes].map(([path, outcome]) => [path, outcome.kind])), {
    paused: "failed", unsupported: "unsupported", "bad-ticket": "failed", blocked: "failed", private: "failed", failed: "failed",
  });
  ask("first"); ask("second"); ask("third");
  await fetcher.calls[6].answer(failure(410, "EXPIRED"));
  assert.equal(outcomes.get("first")?.kind, "expired");
  assert.equal(outcomes.get("third")?.kind, "expired", "every ticket of a result expires together: the waiting one ends too");
  assert.equal(expiredCalls(), 1);
  await fetcher.calls[7].answer(loaded("2"));
  assert.equal(outcomes.get("second")?.kind, "loaded", "a fetch already running finishes");
  ask("later");
  assert.equal(outcomes.get("later")?.kind, "expired");
  assert.equal(fetcher.calls.length, 8, "nothing new is fetched after a 410");
  assert.equal(queue.running, 0);
  assert.deepEqual([previewFailureEnd(410), previewFailureEnd(415), previewFailureEnd(404)], ["expired", "unsupported", "failed"]);
});

test("preview queue: a preview gives up after its attempts, and a wait beyond 60 s is not waited out", async () => {
  assert.equal(PREVIEW_MAX_ATTEMPTS, 4);
  const { clock, fetcher, outcomes, ask } = harness();
  ask("a");
  for (let attempt = 1; attempt <= PREVIEW_MAX_ATTEMPTS; attempt++) {
    assert.equal(fetcher.calls.length, attempt);
    await fetcher.calls.at(-1)!.answer(failure(503, "BUSY", 1));
    await clock.advance(1_000);
  }
  assert.equal(fetcher.calls.length, PREVIEW_MAX_ATTEMPTS);
  assert.deepEqual(outcomes.get("a"), { kind: "failed" });
  assert.equal(MAX_RETRY_WAIT_SEC, 60);
  ask("b");
  await fetcher.calls.at(-1)!.answer(failure(429, "RATE_LIMITED", 61));
  assert.deepEqual(outcomes.get("b"), { kind: "failed" });
  assert.equal(previewRetryDelaySec({ status: 503, code: "DAILY_CAP_REACHED", retryAfterSec: 3_600 }), null);
});

test("preview queue: a failed connection ends as failed, without a retry", async () => {
  const { clock, fetcher, outcomes, ask } = harness();
  ask("a");
  await fetcher.calls[0].fail();
  await clock.advance(120_000);
  assert.deepEqual(outcomes.get("a"), { kind: "failed" });
  assert.equal(fetcher.calls.length, 1);
});

test("preview queue: cancelling drops a waiting request and aborts a running one, without a callback", async () => {
  const { fetcher, queue, outcomes, ask } = harness();
  const a = ask("a");
  ask("b");
  const c = ask("c");
  assert.equal(c.waiting, true);
  c.cancel();
  assert.equal(queue.waiting, 0);
  assert.equal(a.waiting, false, "a has started");
  a.cancel();
  assert.equal(fetcher.calls[0].signal.aborted, true);
  await flush();
  assert.equal(queue.running, 1, "the aborted fetch frees its slot once it settles");
  await fetcher.calls[1].answer(loaded("B"));
  assert.deepEqual(fetcher.paths(), ["a", "b"], "the cancelled waiting request never starts");
  assert.deepEqual([...outcomes.keys()], ["b"]);
  ask("d"); ask("e"); ask("f");
  queue.close();
  assert.equal(fetcher.calls[2].signal.aborted && fetcher.calls[3].signal.aborted, true, "close aborts what runs");
  await flush();
  ask("g");
  assert.deepEqual([...outcomes.keys()], ["b"], "after close nothing calls back");
  assert.equal(fetcher.calls.length, 4);
  assert.equal(queue.running, 0);
});

test("preview queue: once the expiry time passes nothing starts, and expire() ends what waits", async () => {
  const { clock, fetcher, outcomes, ask, expiredCalls } = harness({}, 1_000);
  for (const path of ["a", "b", "c"]) ask(path);
  await clock.advance(1_000);
  await fetcher.calls[0].answer(loaded("A"));
  assert.equal(fetcher.calls.length, 2, "the third does not start after the expiry time");
  assert.equal(outcomes.get("c")?.kind, "expired");
  assert.equal(expiredCalls(), 1);
  ask("d");
  assert.equal(outcomes.get("d")?.kind, "expired");
  const nan = harness({ expiresAtMs: Number.NaN });
  nan.ask("x");
  assert.equal(nan.fetcher.calls.length, 0, "an unreadable expiry starts nothing");
  const told = harness();
  told.ask("y"); told.ask("z"); told.ask("w");
  told.queue.expire();
  assert.equal(told.outcomes.get("w")?.kind, "expired");
  assert.equal(told.expiredCalls(), 1);
  told.queue.expire();
  assert.equal(told.expiredCalls(), 1, "reported once");
});

test("preview queue: a 429 reports when every preview waits until, and reports null once they start again", async () => {
  const waits: (number | null)[] = [];
  const { clock, fetcher, outcomes, ask } = harness({ onRateLimitWait: until => { waits.push(until); } });
  const start = clock.now();
  for (const path of ["a", "b", "c"]) ask(path);
  await fetcher.calls[0].answer(failure(429, "RATE_LIMITED", 20));
  assert.deepEqual(waits, [start + 20_000], "the end of the wait, from the server's seconds");
  // A second 429 while waiting moves the end; a 503 does not report anything.
  await fetcher.calls[1].answer(failure(429, "RATE_LIMITED", 30));
  assert.deepEqual(waits, [start + 20_000, start + 30_000]);
  await clock.advance(29_999);
  assert.equal(waits.length, 2, "still waiting");
  assert.equal(fetcher.calls.length, 2);
  await clock.advance(1);
  assert.deepEqual(waits, [start + 20_000, start + 30_000, null], "the wait is over when the queue starts again");
  assert.deepEqual(fetcher.paths(), ["a", "b", "b", "a"], "the retried previews go first, the last one retried first");
  await fetcher.calls[2].answer(failure(503, "BUSY", 2));
  await fetcher.calls[3].answer(loaded("A"));
  assert.equal(waits.length, 3, "a busy answer is not a rate-limit wait");
  await clock.advance(2_000);
  assert.deepEqual(fetcher.paths().slice(4), ["b", "c"]);
  await fetcher.calls[4].answer(loaded("B"));
  await fetcher.calls[5].answer(loaded("C"));
  assert.deepEqual([...outcomes.entries()].map(([path, outcome]) => [path, outcome.kind === "loaded" ? outcome.value : outcome.kind]).sort(), [["a", "A"], ["b", "B"], ["c", "C"]]);
  assert.deepEqual(waits, [start + 20_000, start + 30_000, null]);
});

test("preview queue: a rate-limit wait ends on time even when every waiting card left the screen", async () => {
  const waits: (number | null)[] = [];
  const { clock, fetcher, ask } = harness({ onRateLimitWait: until => { waits.push(until); } });
  const request = ask("a");
  await fetcher.calls[0].answer(failure(429, "RATE_LIMITED", 5));
  request.cancel();
  await clock.advance(5_000);
  assert.equal(waits.at(-1), null, "the band does not keep showing a wait that is over");
  assert.equal(fetcher.calls.length, 1, "nothing was fetched for the card that left");
});
