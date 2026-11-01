/**
 * Values the pages read at request time from the Worker's environment (server components only; never import this
 * from a client component). Only public values leave here: whether a page scan can start, the bot-check site key and
 * the public origin. The operator's settings are reduced to that one state; the secrets (PAGECRATE_TURNSTILE_SECRET,
 * PAGECRATE_TICKET_SECRET) stay with the API routes.
 * Where there is no Cloudflare context (`next dev`, `next start`, the build), page scans read as unavailable and the
 * origin as null.
 */
import { liveFetchState, readOpsConfig, readPublicOrigin, type LiveFetchState } from "./ops-config";
import { parseTurnstileSiteKey } from "./turnstile-client";

async function workerEnv(): Promise<CloudflareEnv | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    return getCloudflareContext().env;
  } catch {
    return null;
  }
}

export interface LiveFetchSetup {
  readonly state: LiveFetchState;
  /** The public site key for the bot check while page scans are open; null otherwise, so no bot check can load. */
  readonly turnstileSiteKey: string | null;
}

/** Whether a page scan can start (open, paused or unavailable), and the site key its bot check needs. */
export async function readLiveFetchSetup(): Promise<LiveFetchSetup> {
  const env = await workerEnv();
  if (!env) return { state: "unavailable", turnstileSiteKey: null };
  const siteKey = parseTurnstileSiteKey(env.PAGECRATE_TURNSTILE_SITEKEY);
  const state = liveFetchState(readOpsConfig(env), siteKey);
  return { state, turnstileSiteKey: state === "open" ? siteKey : null };
}

/** The public origin (the same setting the Origin check uses), or null when it is unset or invalid. */
export async function readPublicOriginSetting(): Promise<string | null> {
  const env = await workerEnv();
  if (!env) return null;
  const setting = readPublicOrigin(env);
  return setting.state === "valid" ? setting.origin : null;
}
