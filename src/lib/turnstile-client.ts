/**
 * The browser side of the bot check (Cloudflare Turnstile), as pure decisions: no DOM, no network, no clock.
 * A token is good for 300 seconds and for one verification (research.md). The server also checks the hostname
 * and the action, so the widget renders with the same action the guard expects (guard.ts TURNSTILE_ACTION).
 * The widget (components/turnstile-widget.tsx) feeds events in and does what the steps say.
 */

/**
 * Loaded only when a scan starts (design-contracts.md), so the top of the page makes no outside request.
 * `render=explicit`: nothing is drawn until the widget calls `turnstile.render` with the scan action.
 */
export const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** Same value as TURNSTILE_ACTION in guard.ts (a test compares them); kept here so no server code reaches the browser. */
export const TURNSTILE_WIDGET_ACTION = "scan";
/** Turnstile's own lifetime of a token. */
export const TURNSTILE_TOKEN_TTL_MS = 300_000;
/**
 * A token counts as expired this much earlier than 300 seconds. The clock starts when the browser receives the
 * token, which is a little after Cloudflare issued it, and siteverify runs a moment after the request is sent.
 */
export const TURNSTILE_EXPIRY_MARGIN_MS = 15_000;

/**
 * The public site key as the server read it from PAGECRATE_TURNSTILE_SITEKEY, or null when it is missing or not in
 * the expected shape (letters, digits, "_" and "-", 8 to 64 characters). Null means a page scan cannot start; the
 * screen says so and the demo keeps working. Only this public value ever reaches the browser, never the secrets.
 */
export function parseTurnstileSiteKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(key) ? key : null;
}

export interface TurnstileToken {
  readonly value: string;
  /** Monotonic milliseconds (performance.now()) when the widget handed the token over. */
  readonly issuedAt: number;
  /** True once the token went into a scan request: siteverify accepts a token only once. */
  readonly used: boolean;
}

export type TokenRefreshReason = "missing" | "used" | "expired";

/** Why the token must be fetched again before the next scan, or null when it can be sent as it is. */
export function tokenRefreshReason(token: TurnstileToken | null, now: number): TokenRefreshReason | null {
  if (!token || token.value === "") return "missing";
  if (token.used) return "used";
  const age = now - token.issuedAt;
  // A clock that went backwards, or a value that is not a number, cannot show that the token is still fresh.
  if (!Number.isFinite(age) || age < 0 || age >= TURNSTILE_TOKEN_TTL_MS - TURNSTILE_EXPIRY_MARGIN_MS) return "expired";
  return null;
}

/**
 * loading: the script is not ready yet. waiting: a check is running. ready: a fresh token is held.
 * stale: nothing is running and the held token cannot be sent (used or expired); the next take resets.
 * error: the script or the check failed; the next take or a retry resets.
 */
export type TurnstileStatus = "loading" | "waiting" | "ready" | "stale" | "error";

export interface TurnstileState {
  readonly status: TurnstileStatus;
  readonly token: TurnstileToken | null;
}

export const INITIAL_TURNSTILE_STATE: TurnstileState = { status: "loading", token: null };

export type TurnstileEvent =
  /** The widget is on the page and its first check is running. */
  | { readonly type: "rendered" }
  /** Turnstile's callback handed over a token. */
  | { readonly type: "issued"; readonly value: string; readonly at: number }
  /** Turnstile's expired-callback: the token ran out (the widget does not refresh by itself). */
  | { readonly type: "expired" }
  /** The script did not load, the widget could not be drawn, or the check failed. */
  | { readonly type: "failed" }
  /** The page wants a token for one scan request. */
  | { readonly type: "take"; readonly at: number }
  /** The person asked to try the check again. */
  | { readonly type: "retry" };

export interface TurnstileStep {
  readonly state: TurnstileState;
  /** The token handed to the page by a take; it is marked used in the new state. */
  readonly taken: string | null;
  /** The widget must call turnstile.reset (or load the script again) to start a new check. */
  readonly reset: boolean;
}

function step(state: TurnstileState, reset = false, taken: string | null = null): TurnstileStep {
  return { state, taken, reset };
}

/** The whole life of the widget's token. Same input, same output: the widget keeps no other token state. */
export function turnstileStep(state: TurnstileState, event: TurnstileEvent): TurnstileStep {
  switch (event.type) {
    case "rendered":
      return step({ status: state.token && !state.token.used ? "ready" : "waiting", token: state.token });
    case "issued":
      if (event.value === "") return step({ status: "error", token: null });
      return step({ status: "ready", token: { value: event.value, issuedAt: event.at, used: false } });
    case "expired":
      return step({ status: "stale", token: null });
    case "failed":
      return step({ status: "error", token: null });
    case "retry":
      return state.status === "stale" || state.status === "error" ? step({ status: "waiting", token: null }, true) : step(state);
    case "take": {
      const reason = tokenRefreshReason(state.token, event.at);
      if (reason === null && state.token) {
        // One token, one request. The next take finds it used and starts a new check.
        return step({ status: "stale", token: { ...state.token, used: true } }, false, state.token.value);
      }
      // A check that is still loading or running will hand over a token by itself.
      if (reason === "missing" && (state.status === "loading" || state.status === "waiting")) return step(state);
      return step({ status: "waiting", token: null }, true);
    }
  }
}
