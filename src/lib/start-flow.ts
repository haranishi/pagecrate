/**
 * How a start becomes a scan request (tasks.md 4.5), as a pure step function: no DOM, no network, no clock.
 * 1. A start (a page or the demo) first needs the privacy policy check when the device has not confirmed this
 *    version. "進む" carries on with the same start; Esc or "やめる" starts nothing.
 * 2. A page scan then waits for a bot-check token. Only this step mounts the widget, so the bot-check script is
 *    requested no earlier than the first page scan. "待機をやめる" goes back without sending anything.
 * 3. The scan is sent. A page scan always carries a token it has not sent before: tokens are good for one
 *    verification, so every later scan (a retry included) waits for a fresh one. The demo never needs a token.
 * A page scan that cannot start at all (the operator paused page scans, or there is no usable site key) is refused at
 * once, before the policy check and without the bot check; the screen says which, and offers the demo instead.
 */
import type { ScanInput } from "./api-client";
import type { LiveFetchState } from "./ops-config";

export type StartFlowState =
  | { readonly step: "idle"; readonly lastToken: string | null }
  /** The policy check is open; the start waits for "進む". */
  | { readonly step: "policy"; readonly request: ScanInput; readonly lastToken: string | null }
  /** A page scan waits for a bot-check token. */
  | { readonly step: "bot-check"; readonly url: string; readonly lastToken: string | null };

export const IDLE_START_FLOW: StartFlowState = Object.freeze({ step: "idle", lastToken: null });

export type StartFlowEvent =
  /** needsPolicy: the device has not confirmed this policy version. live: whether a page scan can start (ops-config.ts). */
  | { readonly type: "start"; readonly request: ScanInput; readonly needsPolicy: boolean; readonly live: LiveFetchState }
  | { readonly type: "policy-proceed"; readonly live: LiveFetchState }
  | { readonly type: "policy-cancel" }
  /** The widget handed over a token. */
  | { readonly type: "token"; readonly token: string }
  /** "待機をやめる" while the bot check runs. */
  | { readonly type: "cancel-wait" };

export type StartFlowEffect =
  | { readonly type: "none" }
  /** Send POST /api/scan now. */
  | { readonly type: "send"; readonly input: ScanInput; readonly turnstileToken?: string }
  /** A page scan cannot start: the operator has paused page scans. The demo still works. */
  | { readonly type: "paused" }
  /** A page scan cannot start: there is no usable site key, or the settings close page scans. The demo still works. */
  | { readonly type: "unavailable" };

export interface StartFlowStep {
  readonly state: StartFlowState;
  readonly effect: StartFlowEffect;
}

const NONE: StartFlowEffect = Object.freeze({ type: "none" });
const PAUSED: StartFlowEffect = Object.freeze({ type: "paused" });
const UNAVAILABLE: StartFlowEffect = Object.freeze({ type: "unavailable" });

function stay(state: StartFlowState): StartFlowStep {
  return { state, effect: NONE };
}

/** The answer to a page scan that cannot start. */
function refusal(live: Exclude<LiveFetchState, "open">): StartFlowEffect {
  return live === "paused" ? PAUSED : UNAVAILABLE;
}

/** After the policy check (or without it): the demo is sent at once, a page waits for its bot check. */
function proceed(request: ScanInput, live: LiveFetchState, lastToken: string | null): StartFlowStep {
  if ("demo" in request) return { state: { step: "idle", lastToken }, effect: { type: "send", input: request } };
  if (live !== "open") return { state: { step: "idle", lastToken }, effect: refusal(live) };
  return stay({ step: "bot-check", url: request.url, lastToken });
}

export function startFlowStep(state: StartFlowState, event: StartFlowEvent): StartFlowStep {
  switch (event.type) {
    case "start":
      // One start at a time: a second press while the check is open or the bot check runs changes nothing.
      if (state.step !== "idle") return stay(state);
      // A page scan that can never be sent (paused, or no site key) skips the policy check, which would only be in the way.
      if ("url" in event.request && event.live !== "open") return { state, effect: refusal(event.live) };
      if (event.needsPolicy) return stay({ step: "policy", request: event.request, lastToken: state.lastToken });
      return proceed(event.request, event.live, state.lastToken);
    case "policy-proceed":
      return state.step === "policy" ? proceed(state.request, event.live, state.lastToken) : stay(state);
    case "policy-cancel":
      return state.step === "policy" ? stay({ step: "idle", lastToken: state.lastToken }) : stay(state);
    case "token":
      // A token that was already sent is never sent again: wait for the widget's next one.
      if (state.step !== "bot-check" || event.token === "" || event.token === state.lastToken) return stay(state);
      return { state: { step: "idle", lastToken: event.token }, effect: { type: "send", input: { url: state.url }, turnstileToken: event.token } };
    case "cancel-wait":
      return state.step === "bot-check" ? stay({ step: "idle", lastToken: state.lastToken }) : stay(state);
  }
}
