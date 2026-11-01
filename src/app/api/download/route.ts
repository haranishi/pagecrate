import { handleDownload } from "@/lib/download-api";
import { cloudflareGuardContext } from "@/lib/guard-adapters";
import { zipLimiter } from "@/lib/limiter";
import { createWorkerSafeFetcher } from "@/lib/safe-fetch";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleDownload(request, { context: cloudflareGuardContext, createFetcher: createWorkerSafeFetcher, limiter: zipLimiter });
}
