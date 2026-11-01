import type { Metadata } from "next";
import { connection } from "next/server";
import Workspace from "@/components/workspace";
import { readLiveFetchSetup } from "@/lib/runtime-env";

export const metadata: Metadata = { title: "素材を集める — PageCrate" };

/**
 * Rendered per request: whether page scans are open, paused or unavailable, and the bot-check site key, are runtime
 * values of the Worker, not build-time ones. A paused site says so from the first view and never loads the bot check.
 */
export default async function AppPage() {
  await connection();
  const live = await readLiveFetchSetup();
  return <Workspace liveFetch={live.state} turnstileSiteKey={live.turnstileSiteKey} />;
}
