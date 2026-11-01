/**
 * Daily render budget: the pure decision behind the BudgetGate Durable Object (see budget-gate-object.ts).
 * Only UTC-day keys and integer counts pass through the store, never user, URL or asset data.
 * Any storage failure refuses the reservation, so a broken counter can never allow extra renders.
 */
export const BUDGET_RETENTION_DAYS = 7;
const DAY_MS = 86_400_000;

/** Minimal storage port: one integer per UTC day. */
export interface RenderCountStore {
  read(day: string): number | null;
  write(day: string, used: number): void;
  deleteBefore(day: string): void;
}
export type BudgetRefusal = "CLOSED" | "INVALID_DAY" | "CAP_REACHED" | "STORE_FAILED";
export type BudgetDecision =
  | { readonly allowed: true; readonly used: number }
  | { readonly allowed: false; readonly reason: BudgetRefusal; readonly used: number | null };

/** UTC calendar day (YYYY-MM-DD) used as the counter key. */
export function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function dayStart(day: unknown): number | null {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const start = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isFinite(start) && utcDay(start) === day ? start : null;
}

/** Reserves one render for `day` under `cap`. A cap of 0 or less keeps rendering closed. */
export function reserveRender(store: RenderCountStore, day: string, cap: number): BudgetDecision {
  if (!Number.isSafeInteger(cap) || cap <= 0) return { allowed: false, reason: "CLOSED", used: null };
  const start = dayStart(day);
  if (start === null) return { allowed: false, reason: "INVALID_DAY", used: null };
  try {
    const stored = store.read(day);
    if (stored !== null && !(Number.isSafeInteger(stored) && stored >= 0)) return { allowed: false, reason: "STORE_FAILED", used: null };
    // The first reservation of a day also drops counters that are 7 or more days old.
    if (stored === null) store.deleteBefore(utcDay(start - (BUDGET_RETENTION_DAYS - 1) * DAY_MS));
    const used = stored ?? 0;
    if (used >= cap) return { allowed: false, reason: "CAP_REACHED", used };
    store.write(day, used + 1);
    return { allowed: true, used: used + 1 };
  } catch {
    return { allowed: false, reason: "STORE_FAILED", used: null };
  }
}
