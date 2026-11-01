/**
 * GET /api/preview?t=<ticket>, without the Next runtime. The guard verifies the ticket (images only) and applies the
 * pause, the PREVIEW_LIMITER and the blocklist; then one of two in-isolate preview slots is taken (none free: BUSY)
 * and the image is streamed, at most 2 MiB, with no-store and nosniff. External SVG is never shown.
 */
import { apiError, apiErrorResponse, type ApiError } from "./api";
import { AppError } from "./errors";
import { demoAssetForUrl } from "./demo";
import { guardTicketRoute } from "./guard";
import type { Limiter } from "./limiter";
import { previewResponse, type PreviewOptions } from "./preview-stream";
import { blockedHostPredicate, blocklistFetcher, dependencyBusyResponse, loadContext, type ContextSource, type SafeFetcher } from "./route-support";

export interface PreviewRouteDeps {
  readonly context: ContextSource;
  /** Base safe fetcher (Workers' public transport); the handler adds the blocklist to every call. */
  readonly createFetcher: () => SafeFetcher;
  /** Two preview slots per isolate (limiter.ts previewLimiter). */
  readonly limiter: Limiter;
  readonly previewOptions?: Pick<PreviewOptions, "scheduleDeadline">;
}

const PREVIEW_FAILED = "画像を読み込めませんでした。時間をおいて、もう一度お試しください。";

/** Fetch failures of a preview: blocked or internal targets keep their own codes; content that cannot be shown is 415. */
export function previewFailureToApiError(error: unknown): ApiError {
  if (!(error instanceof AppError)) return apiError("SCAN_FAILED", { message: PREVIEW_FAILED });
  switch (error.code) {
    case "BLOCKED_HOST": return apiError("BLOCKED_HOST");
    case "UNSAFE_URL": return apiError("PRIVATE_ADDRESS");
    case "PREVIEW_SVG": case "PREVIEW_LIMIT": case "NO_PREVIEW": return apiError("UNSUPPORTED_PREVIEW", { message: error.message });
    case "BODY_LIMIT": return apiError("UNSUPPORTED_PREVIEW", { message: "プレビューは2MiBまでです。元の画像は選択して保存できます。" });
    case "EXTRACTION_RUNTIME": case "EXTRACTION_GUARD": return apiError("PAUSED");
    default: return apiError("SCAN_FAILED", { message: PREVIEW_FAILED });
  }
}

export async function handlePreview(request: Request, deps: PreviewRouteDeps): Promise<Response> {
  const ctx = await loadContext(deps.context);
  if (!ctx) return dependencyBusyResponse();
  const guarded = await guardTicketRoute(request, "preview", ctx);
  if (!guarded.ok) return apiErrorResponse(guarded.error);
  const [claim] = guarded.claims;
  // A demo ticket names one of the built-in images; it is never fetched.
  if (claim.d && demoAssetForUrl(claim.u)?.kind !== "image") return apiErrorResponse(apiError("INVALID_TICKET"));
  const slot = deps.limiter.acquire();
  if (!slot.ok) return apiErrorResponse(slot.error);
  try {
    return await previewResponse({ url: claim.u, demo: claim.d }, slot.release, {
      signal: request.signal,
      fetcher: blocklistFetcher(deps.createFetcher, blockedHostPredicate(ctx)),
      ...deps.previewOptions,
    });
  } catch (error) {
    // previewResponse has already released the slot on every failure path; a second release is a no-op.
    slot.release();
    return apiErrorResponse(previewFailureToApiError(error));
  }
}
