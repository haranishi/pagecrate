import { test } from "node:test";
import assert from "node:assert/strict";
import { BUDGET_RETENTION_DAYS, reserveRender, utcDay, type RenderCountStore } from "../src/lib/budget-gate";

type Failure = "read" | "write" | "delete";
/** In-memory stand-in for the Durable Object's renders table, with optional injected failures. */
function fakeStore(seed: Record<string, number> = {}, fail?: Failure) {
  const rows = new Map(Object.entries(seed));
  const calls: string[] = [];
  const store: RenderCountStore = {
    read(day) { calls.push(`read ${day}`); if (fail === "read") throw new Error("read failed"); return rows.get(day) ?? null; },
    write(day, used) { calls.push(`write ${day}=${used}`); if (fail === "write") throw new Error("write failed"); rows.set(day, used); },
    deleteBefore(day) {
      calls.push(`deleteBefore ${day}`);
      if (fail === "delete") throw new Error("delete failed");
      for (const key of [...rows.keys()]) if (key < day) rows.delete(key);
    },
  };
  return { store, rows, calls };
}
const DAY = "2026-10-31";

test("budget: exactly `cap` renders are allowed per day and the next one is refused without being counted", () => {
  const { store, rows } = fakeStore();
  assert.deepEqual(reserveRender(store, DAY, 3), { allowed: true, used: 1 });
  assert.deepEqual(reserveRender(store, DAY, 3), { allowed: true, used: 2 });
  assert.deepEqual(reserveRender(store, DAY, 3), { allowed: true, used: 3 });
  assert.deepEqual(reserveRender(store, DAY, 3), { allowed: false, reason: "CAP_REACHED", used: 3 });
  assert.equal(rows.get(DAY), 3);
  const single = fakeStore();
  assert.deepEqual(reserveRender(single.store, DAY, 1), { allowed: true, used: 1 });
  assert.deepEqual(reserveRender(single.store, DAY, 1), { allowed: false, reason: "CAP_REACHED", used: 1 });
  // Lowering the cap below today's count closes the rest of the day.
  assert.deepEqual(reserveRender(fakeStore({ [DAY]: 5 }).store, DAY, 2), { allowed: false, reason: "CAP_REACHED", used: 5 });
});

test("budget: the count restarts on the next UTC day and day keys follow UTC, not Japan time", () => {
  const { store, rows } = fakeStore();
  reserveRender(store, DAY, 2);
  reserveRender(store, DAY, 2);
  assert.equal(reserveRender(store, DAY, 2).allowed, false);
  assert.deepEqual(reserveRender(store, "2026-11-01", 2), { allowed: true, used: 1 });
  assert.equal(rows.get(DAY), 2);
  assert.equal(utcDay(Date.parse("2026-10-31T23:59:59.999Z")), DAY);
  assert.equal(utcDay(Date.parse("2026-11-01T00:00:00.000Z")), "2026-11-01");
  assert.equal(utcDay(Date.parse("2026-11-01T08:59:59.999+09:00")), DAY);
  assert.equal(utcDay(Date.parse("2026-11-01T09:00:00.000+09:00")), "2026-11-01");
});

test("budget: counters 7 or more days old are dropped by the first reservation of a day", () => {
  const seed = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [utcDay(Date.parse(`${DAY}T00:00:00Z`) - (index + 1) * 86_400_000), 1]));
  const { store, rows, calls } = fakeStore(seed);
  assert.equal(BUDGET_RETENTION_DAYS, 7);
  reserveRender(store, DAY, 5);
  assert.deepEqual([...rows.keys()].sort(), ["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", DAY]);
  reserveRender(store, DAY, 5);
  assert.equal(calls.filter(call => call.startsWith("deleteBefore")).length, 1);
});

test("budget: a cap of 0 or less, or a malformed cap or day, refuses without touching storage", () => {
  for (const cap of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const { store, calls } = fakeStore();
    assert.deepEqual(reserveRender(store, DAY, cap), { allowed: false, reason: "CLOSED", used: null }, String(cap));
    assert.deepEqual(calls, []);
  }
  for (const day of ["2026-13-01", "2026-02-30", "20261031", "2026-10-31T00:00:00Z", ""]) {
    const { store, calls } = fakeStore();
    assert.deepEqual(reserveRender(store, day, 5), { allowed: false, reason: "INVALID_DAY", used: null }, day);
    assert.deepEqual(calls, []);
  }
});

test("budget: any storage failure refuses the render and never counts it", () => {
  for (const fail of ["read", "write", "delete"] as const) {
    const { store, rows } = fakeStore({}, fail);
    assert.deepEqual(reserveRender(store, DAY, 5), { allowed: false, reason: "STORE_FAILED", used: null }, fail);
    assert.equal(rows.has(DAY), false, fail);
  }
  for (const corrupt of [-1, 1.5, Number.NaN]) {
    const { store, rows } = fakeStore({ [DAY]: corrupt });
    assert.deepEqual(reserveRender(store, DAY, 5), { allowed: false, reason: "STORE_FAILED", used: null }, String(corrupt));
    assert.equal(rows.get(DAY), corrupt);
  }
});

test("budget: only UTC-day keys and integer counts ever reach storage", () => {
  const { store, calls } = fakeStore();
  for (let index = 0; index < 3; index += 1) reserveRender(store, DAY, 2);
  assert.ok(calls.length > 0);
  for (const call of calls) assert.match(call, /^(?:read|deleteBefore) \d{4}-\d{2}-\d{2}$|^write \d{4}-\d{2}-\d{2}=\d+$/, call);
});
