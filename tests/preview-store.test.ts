import { test } from "node:test";
import assert from "node:assert/strict";
import { createPreviewStore, IDLE_PREVIEW } from "../src/lib/preview-store";
import { failure, fakeClock, fakeFetcher, flush, loaded } from "./helpers/preview-fakes";

function harness(maxConcurrent = 2, expiresInMs = 3_600_000) {
  const clock = fakeClock();
  const fetcher = fakeFetcher();
  const created: string[] = [];
  const revoked: string[] = [];
  let expiredCalls = 0;
  const store = createPreviewStore<string>({
    expiresAtMs: clock.now() + expiresInMs,
    fetchPreview: fetcher.fetchPreview,
    createUrl: value => { const url = `blob:${value}`; created.push(url); return url; },
    revokeUrl: url => { revoked.push(url); },
    onExpired: () => { expiredCalls += 1; },
    queue: { now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, maxConcurrent },
  });
  return { clock, fetcher, store, created, revoked, expiredCalls: () => expiredCalls };
}

test("preview store: a card on screen is fetched once; leaving drops a request that has not started", async () => {
  const { fetcher, store } = harness(1);
  let changes = 0;
  store.subscribe("a", () => { changes += 1; });
  assert.equal(store.get("a"), IDLE_PREVIEW);
  store.show("a"); store.show("a"); store.show("b");
  assert.deepEqual(fetcher.paths(), ["a"], "shown twice, asked once; b waits for the only slot");
  assert.equal(store.get("a").kind, "loading");
  assert.equal(store.get("a"), store.get("a"), "the same object until the view changes");
  store.hide("b");
  assert.equal(store.get("b"), IDLE_PREVIEW, "b left the screen before it started");
  store.hide("a");
  assert.equal(store.get("a").kind, "loading", "a started: leaving the screen keeps it");
  await fetcher.calls[0].answer(loaded("A"));
  assert.deepEqual(store.get("a"), { kind: "loaded", src: "blob:A" });
  assert.deepEqual(fetcher.paths(), ["a"], "b is not fetched");
  assert.equal(changes, 2, "idle → loading → loaded");
  store.show("b");
  store.release("b");
  assert.equal(fetcher.calls[1].signal.aborted, true, "an unmounted card drops even a started request");
  assert.equal(store.get("b"), IDLE_PREVIEW);
});

test("preview store: loaded previews keep their object URL across remounts, and reset revokes each once", async () => {
  const { fetcher, store, created, revoked } = harness();
  store.show("a"); store.show("b");
  await fetcher.calls[0].answer(loaded("A"));
  await fetcher.calls[1].answer(failure(415, "UNSUPPORTED_PREVIEW"));
  store.release("a");
  store.show("a");
  assert.equal(fetcher.calls.length, 2, "a remounted card reuses its preview");
  assert.equal(store.get("b").kind, "unsupported");
  store.show("c");
  let notified = false;
  store.subscribe("a", () => { notified = true; });
  store.reset();
  assert.deepEqual(created, ["blob:A"]);
  assert.deepEqual(revoked, ["blob:A"]);
  assert.equal(fetcher.calls[2].signal.aborted, true, "reset drops what is running");
  assert.equal(notified, true);
  assert.equal(store.get("a"), IDLE_PREVIEW);
  store.reset();
  assert.deepEqual(revoked, ["blob:A"], "a URL is revoked once");
  store.show("a");
  await flush();
  assert.equal(fetcher.calls.length, 4, "after a reset the store works again (React may remount)");
});

test("preview store: after expiry nothing is fetched, and a 410 tells the screen once", async () => {
  const { fetcher, store, expiredCalls } = harness(1);
  store.show("a"); store.show("b");
  await fetcher.calls[0].answer(failure(410, "EXPIRED"));
  assert.equal(store.get("a").kind, "expired");
  assert.equal(store.get("b").kind, "expired", "the waiting card ends too");
  assert.equal(expiredCalls(), 1);
  store.show("c");
  assert.equal(store.get("c").kind, "expired");
  assert.equal(fetcher.calls.length, 1);
  const later = harness();
  later.store.show("x");
  await later.fetcher.calls[0].answer(loaded("X"));
  later.store.expire();
  later.store.show("y");
  assert.equal(later.store.get("y").kind, "expired");
  assert.equal(later.store.get("x").kind, "loaded", "a preview already shown stays");
  assert.equal(later.fetcher.calls.length, 1);
  const clockBound = harness(2, 1_000);
  await clockBound.clock.advance(1_000);
  clockBound.store.show("z");
  assert.equal(clockBound.store.get("z").kind, "expired");
  assert.equal(clockBound.fetcher.calls.length, 0, "past the expiry time nothing starts");
  assert.equal(clockBound.expiredCalls(), 1);
});
