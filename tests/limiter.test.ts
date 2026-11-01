import { test } from "node:test";
import assert from "node:assert/strict";
import { BUSY_MESSAGE, createLimiter, PREVIEW_CONCURRENCY, previewLimiter, ZIP_CONCURRENCY, zipLimiter } from "../src/lib/limiter";

test("limiter: a second ZIP is refused with 混み合っています and passes after the first is released", () => {
  const zip = createLimiter(ZIP_CONCURRENCY, 10);
  const first = zip.acquire();
  assert.ok(first.ok);
  const second = zip.acquire();
  assert.deepEqual(second, { ok: false, error: { code: "BUSY", message: BUSY_MESSAGE, retryAfterSec: 10 } });
  assert.match(BUSY_MESSAGE, /^混み合っています。/);
  first.release();
  const third = zip.acquire();
  assert.ok(third.ok);
  third.release();
  assert.equal(zip.active, 0);
});

test("limiter: previews take two slots and the third waits for a release", () => {
  const preview = createLimiter(PREVIEW_CONCURRENCY, 3);
  const a = preview.tryAcquire();
  const b = preview.tryAcquire();
  assert.ok(a && b);
  assert.equal(preview.tryAcquire(), null);
  const busy = preview.acquire();
  assert.equal(busy.ok, false);
  if (!busy.ok) assert.deepEqual(busy.error, { code: "BUSY", message: BUSY_MESSAGE, retryAfterSec: 3 });
  b();
  const c = preview.tryAcquire();
  assert.ok(c);
  a(); c();
  assert.equal(preview.active, 0);
});

test("limiter: calling a release more than once frees only one slot", () => {
  const limiter = createLimiter(2);
  const a = limiter.tryAcquire();
  const b = limiter.tryAcquire();
  assert.ok(a && b);
  a(); a(); a();
  assert.equal(limiter.active, 1);
  const c = limiter.tryAcquire();
  assert.ok(c);
  assert.equal(limiter.tryAcquire(), null);
  b(); c();
  assert.equal(limiter.active, 0);
});

test("limiter: the named ZIP (1) and preview (2) instances are independent of each other", () => {
  assert.equal(zipLimiter.max, 1);
  assert.equal(previewLimiter.max, 2);
  const zip = zipLimiter.tryAcquire();
  const previews = [previewLimiter.tryAcquire(), previewLimiter.tryAcquire()];
  try {
    assert.ok(zip);
    assert.ok(previews[0] && previews[1]);
    const zipBusy = zipLimiter.acquire();
    assert.equal(zipBusy.ok, false);
    assert.equal(previewLimiter.tryAcquire(), null);
  } finally {
    zip?.();
    for (const release of previews) release?.();
  }
  assert.equal(zipLimiter.active, 0);
  assert.equal(previewLimiter.active, 0);
});

test("limiter: sizes and retry hints must be positive integers", () => {
  for (const max of [0, -1, 1.5, Number.NaN]) assert.throws(() => createLimiter(max), RangeError, String(max));
  for (const retry of [0, -3, 2.5]) assert.throws(() => createLimiter(1, retry), RangeError, String(retry));
});
