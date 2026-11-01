import { cloudflareGuardContext } from "@/lib/guard-adapters";
import { previewLimiter } from "@/lib/limiter";
import { handlePreview } from "@/lib/preview-api";
import { createWorkerSafeFetcher } from "@/lib/safe-fetch";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return handlePreview(request, { context: cloudflareGuardContext, createFetcher: createWorkerSafeFetcher, limiter: previewLimiter });
}
