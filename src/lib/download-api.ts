/**
 * POST /api/download {tickets: string[1..50]}, without the Next runtime. The guard reads the body (512 KiB at most),
 * verifies every ticket and applies the pause, the DOWNLOAD_LIMITER and the blocklist. The verified claims become the
 * least input the ZIP needs; then the single in-isolate ZIP slot is taken (none free: BUSY) and the ZIP is streamed.
 */
import { apiError, apiErrorResponse, type ApiError } from "./api";
import { assetIdFor } from "./assets";
import { demoAssetForUrl } from "./demo";
import { zipStream, type ZipAsset, type ZipInput, type ZipStreamOptions } from "./download";
import { guardTicketRoute } from "./guard";
import type { Limiter } from "./limiter";
import { blockedHostPredicate, blocklistFetcher, dependencyBusyResponse, loadContext, type ContextSource, type SafeFetcher } from "./route-support";
import type { TicketClaims } from "./ticket";

export interface DownloadRouteDeps {
  readonly context: ContextSource;
  /** Base safe fetcher (Workers' public transport); the handler adds the blocklist to every call. */
  readonly createFetcher: () => SafeFetcher;
  /** One ZIP per isolate (limiter.ts zipLimiter). */
  readonly limiter: Limiter;
  readonly zipOptions?: Pick<ZipStreamOptions, "scheduleDeadline">;
}

const MIXED_RESULTS = "別々に取得した結果の素材は、一度に保存できません。もう一度ページを取得してください。";
type ZipInputResult = { readonly ok: true; readonly value: ZipInput } | { readonly ok: false; readonly error: ApiError };

/**
 * One ZIP comes from one result: every ticket must name the same page origin and the same demo flag. IDs are
 * recomputed on the server (sha256 of the URL, or the built-in demo ID), and a repeated asset is saved once.
 */
export function zipInputFromClaims(claims: readonly TicketClaims[]): ZipInputResult {
  const [first] = claims;
  if (!first) return { ok: false, error: apiError("INVALID_TICKET") };
  if (claims.some(claim => claim.o !== first.o || claim.d !== first.d)) return { ok: false, error: apiError("INVALID_TICKET", { message: MIXED_RESULTS }) };
  const assets: ZipAsset[] = [];
  const seen = new Set<string>();
  for (const claim of claims) {
    let id: string;
    if (claim.d) {
      // A demo ticket names one of the built-in items; its bytes come from the app, never from the network.
      const item = demoAssetForUrl(claim.u);
      if (!item || item.kind !== claim.k) return { ok: false, error: apiError("INVALID_TICKET") };
      id = item.id;
    } else id = assetIdFor(claim.u);
    if (seen.has(id)) continue;
    seen.add(id);
    assets.push({ id, url: claim.u, kind: claim.k });
  }
  return { ok: true, value: { pageOrigin: first.o, demo: first.d, assets } };
}

export async function handleDownload(request: Request, deps: DownloadRouteDeps): Promise<Response> {
  const ctx = await loadContext(deps.context);
  if (!ctx) return dependencyBusyResponse();
  const guarded = await guardTicketRoute(request, "download", ctx);
  if (!guarded.ok) return apiErrorResponse(guarded.error);
  const input = zipInputFromClaims(guarded.claims);
  if (!input.ok) return apiErrorResponse(input.error);
  const slot = deps.limiter.acquire();
  if (!slot.ok) return apiErrorResponse(slot.error);
  try {
    // The slot is released once the stream ends: EOF, cancel, the two-minute deadline or an error.
    const stream = zipStream(input.value, slot.release, {
      signal: request.signal,
      fetcher: blocklistFetcher(deps.createFetcher, blockedHostPredicate(ctx)),
      ...deps.zipOptions,
    });
    return new Response(stream, { headers: {
      "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="pagecrate-assets.zip"', "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    slot.release();
    return dependencyBusyResponse();
  }
}
