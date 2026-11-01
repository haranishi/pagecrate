import { cloudflareGuardContext } from "@/lib/guard-adapters";
import { createWorkerSafeFetcher } from "@/lib/safe-fetch";
import { handleScan } from "@/lib/scan-api";
import { launchWorkerBrowser } from "@/lib/scanner";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleScan(request, { context: cloudflareGuardContext, createFetcher: createWorkerSafeFetcher, launchBrowser: launchWorkerBrowser });
}
