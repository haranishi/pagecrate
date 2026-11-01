/**
 * Operator settings from Worker variables/secrets. Pure: callers pass the environment, so API routes and
 * tests share one parser. Missing or malformed values close live fetching (the demo keeps working); that includes
 * the pause, which reads as paused unless it is an explicit 0 or false.
 */
export type OpsEnv = {
  readonly PAGECRATE_PUBLIC_ORIGIN?: string;
  readonly PAGECRATE_DAILY_RENDER_CAP?: string;
  readonly PAGECRATE_PAUSED?: string;
  readonly PAGECRATE_BLOCKED_HOSTS?: string;
};

export type PublicOriginSetting =
  | { readonly state: "unset" }
  | { readonly state: "invalid" }
  | { readonly state: "valid"; readonly origin: string };

export interface OpsConfig {
  readonly dailyRenderCap: number;
  readonly paused: boolean;
  readonly blockedHosts: readonly string[];
  readonly publicOrigin: PublicOriginSetting;
  /** Live (non-demo) fetching needs a cap of at least 1 and a valid public origin. Pause is judged separately. */
  readonly liveFetchOpen: boolean;
}

const LOCAL_HTTP_ORIGIN = /^http:\/\/(?:127\.0\.0\.1|localhost):(?:4381|8787)$/;

/** Plain HTTP is accepted only for `next dev` (4381) and the local Workers preview (8787). */
export function isLocalDevOrigin(origin: string): boolean {
  return LOCAL_HTTP_ORIGIN.test(origin);
}

function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function readPublicOrigin(env: OpsEnv): PublicOriginSetting {
  const value = present(env.PAGECRATE_PUBLIC_ORIGIN) ? env.PAGECRATE_PUBLIC_ORIGIN : undefined;
  if (value === undefined) return { state: "unset" };
  let url: URL;
  try { url = new URL(value.trim()); } catch { return { state: "invalid" }; }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return { state: "invalid" };
  if (url.protocol !== "https:" && !isLocalDevOrigin(url.origin)) return { state: "invalid" };
  return { state: "valid", origin: url.origin };
}

function readDailyRenderCap(value: string | undefined): number {
  const text = value?.trim() ?? "";
  // Up to 15 decimal digits always stays a safe integer; signs, decimals and exponents are rejected.
  return /^\d{1,15}$/.test(text) ? Number(text) : 0;
}

/**
 * The pause fails closed. It is the one switch that keeps the demo-only public site from fetching other people's
 * pages, so only an explicit 0 or false opens it. A missing or blank value, a typo ("yes", "on", a full-width "１")
 * or anything else reads as paused (independent review before release: such values used to read as "not paused").
 */
function readPaused(value: string | undefined): boolean {
  const text = value?.trim().toLowerCase();
  return text !== "0" && text !== "false";
}

function readBlockedHosts(value: string | undefined): string[] {
  return (value ?? "").split(",").map(entry => entry.trim().toLowerCase()).filter(entry => entry !== "");
}

/**
 * Whether a page scan can start, as the screen is told before anything is sent (the demo-only public site runs with
 * the pause on). open: the bot check runs, then the scan is sent. paused: the operator stopped page scans; the screen
 * says so from the first view, loads no bot check and offers the demo. unavailable: the settings or the bot-check site
 * key cannot be used (or there is no Worker environment, as with `next dev`). The demo works in every state.
 */
export type LiveFetchState = "open" | "paused" | "unavailable";

/**
 * A pause comes first: while only the demo is public, the bot-check keys may hold values that are never used, and the
 * screen must still say "paused" rather than "not ready". `siteKey` is the parsed public key (null when missing or
 * malformed). The server stays the judge (guard.ts); this only spares a visitor a check that would end in a refusal.
 */
export function liveFetchState(config: Pick<OpsConfig, "paused" | "liveFetchOpen">, siteKey: string | null): LiveFetchState {
  if (config.paused) return "paused";
  return config.liveFetchOpen && siteKey !== null ? "open" : "unavailable";
}

export function readOpsConfig(env: OpsEnv): OpsConfig {
  const dailyRenderCap = readDailyRenderCap(env.PAGECRATE_DAILY_RENDER_CAP);
  const publicOrigin = readPublicOrigin(env);
  return {
    dailyRenderCap,
    paused: readPaused(env.PAGECRATE_PAUSED),
    blockedHosts: readBlockedHosts(env.PAGECRATE_BLOCKED_HOSTS),
    publicOrigin,
    liveFetchOpen: dailyRenderCap >= 1 && publicOrigin.state === "valid",
  };
}
