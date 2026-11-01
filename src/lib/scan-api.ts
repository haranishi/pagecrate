/**
 * POST /api/scan, without the Next runtime: the route file only wires the real dependencies in. The guard runs first
 * (and reserves the render); the page is then rendered with every fetch asking the operator blocklist, and each image
 * or video candidate gets a signed ticket. Nothing is stored: the response is the only copy of the result.
 */
import { apiError, apiErrorResponse, API_MESSAGES, type ApiError } from "./api";
import { UNSUPPORTED_REASON } from "./assets";
import { demoScan } from "./demo";
import { AppError, locationFreeMessage } from "./errors";
import { DEPENDENCY_RETRY_SEC, guardScan } from "./guard";
import { blockedHostPredicate, blocklistFetcher, dependencyBusyResponse, loadContext, type ContextSource, type SafeFetcher } from "./route-support";
import { scanPage, type ScanLauncher, type ScanOptions } from "./scanner";
import { createTicketCodec, TICKET_TTL_SECONDS, type TicketCodec } from "./ticket";
import type { AssetItem, ScanResponse, ScanResult } from "./types";

export interface ScanRouteDeps {
  readonly context: ContextSource;
  /** Base safe fetcher (Workers' public transport); the handler adds the blocklist to every call. */
  readonly createFetcher: () => SafeFetcher;
  readonly launchBrowser: ScanLauncher;
  readonly scanOptions?: ScanOptions;
}

/** Internal failures whose own fixed sentence is the reason to show (a login wall, a timeout, an unreachable page). */
const SCAN_REASON_CODES = new Set([
  "PAGE_UNAVAILABLE", "NOT_A_PAGE", "SCAN_TIMEOUT", "SCAN_LIMIT", "DNS_FAILED", "DNS_TIMEOUT", "CONNECTION_FAILED",
  "FETCH_TIMEOUT", "REDIRECT_LIMIT", "BODY_LIMIT", "HEADER_LIMIT", "ABORTED",
]);
/** The service cannot fetch safely in this runtime: the same answer as an operator pause (the demo still works). */
const CLOSED_CODES = new Set(["EXTRACTION_RUNTIME", "EXTRACTION_GUARD", "BROWSER_GUARD", "BROWSER_UNAVAILABLE"]);
const NOT_SAVABLE_REASON = "この素材は保存できません。";
const DEMO_UNAVAILABLE = "いまはデモを準備できません。時間をおいて、もう一度お試しください。";

/**
 * Maps what the scanner and safe-fetch throw to a public error. UNSAFE_URL→PRIVATE_ADDRESS (422), BUSY→BUSY (503,
 * 30 s), BLOCKED_HOST→BLOCKED_HOST (403), INVALID_URL→INVALID_URL (400), anything else→SCAN_FAILED (502). Upstream
 * errors that are not AppErrors never pass their text through.
 */
export function scanFailureToApiError(error: unknown): ApiError {
  if (!(error instanceof AppError)) return apiError("SCAN_FAILED");
  switch (error.code) {
    case "UNSAFE_URL": return apiError("PRIVATE_ADDRESS");
    case "BUSY": return apiError("BUSY", { retryAfterSec: DEPENDENCY_RETRY_SEC });
    case "BLOCKED_HOST": return apiError("BLOCKED_HOST");
    case "INVALID_URL": return apiError("INVALID_URL");
    case "SCAN_FAILED": return apiError("SCAN_FAILED");
  }
  if (CLOSED_CODES.has(error.code)) return apiError("PAUSED");
  return apiError("SCAN_FAILED", SCAN_REASON_CODES.has(error.code) ? { message: locationFreeMessage(error.message) } : {});
}

export function previewPath(ticket: string): string {
  return `/api/preview?t=${encodeURIComponent(ticket)}`;
}

interface TicketOptions { readonly demo: boolean; readonly isBlockedHost: (host: string) => boolean; readonly issuedAt: number }

/**
 * Builds the response: every image or video gets a ticket (URL, kind, page origin, demo flag, 30 minutes). Streams
 * stay detected-only, and a candidate on a blocked host gets a reason instead of a ticket. Only images that are not
 * external SVG get a preview path; demo SVGs are our own artwork.
 */
async function withTickets(scan: ScanResult, codec: TicketCodec, options: TicketOptions): Promise<ScanResponse> {
  const pageOrigin = new URL(scan.pageUrl).origin;
  const assets: AssetItem[] = [];
  for (const asset of scan.assets) {
    const item: AssetItem = {
      id: asset.id, kind: asset.kind, name: asset.name, url: asset.url, format: asset.format,
      ...(asset.bytes === undefined ? {} : { bytes: asset.bytes }),
      ...(asset.width === undefined ? {} : { width: asset.width }),
      ...(asset.height === undefined ? {} : { height: asset.height }),
    };
    if (asset.kind === "unsupported") { assets.push({ ...item, reason: asset.reason ?? UNSUPPORTED_REASON }); continue; }
    if (!options.demo && options.isBlockedHost(new URL(asset.url).hostname)) { assets.push({ ...item, reason: API_MESSAGES.BLOCKED_HOST }); continue; }
    const issued = await codec.issue({ url: asset.url, kind: asset.kind, pageOrigin, demo: options.demo });
    if (!issued.ok) { assets.push({ ...item, reason: NOT_SAVABLE_REASON }); continue; }
    const previewable = asset.kind === "image" && (options.demo || asset.format !== "SVG");
    assets.push({ ...item, ticket: issued.ticket, ...(previewable ? { previewUrl: previewPath(issued.ticket) } : {}) });
  }
  const expiresAt = new Date((Math.floor(options.issuedAt / 1000) + TICKET_TTL_SECONDS) * 1000).toISOString();
  return { pageUrl: scan.pageUrl, assets, truncated: scan.truncated, expiresAt };
}

export async function handleScan(request: Request, deps: ScanRouteDeps): Promise<Response> {
  const ctx = await loadContext(deps.context);
  if (!ctx) return dependencyBusyResponse();
  const guarded = await guardScan(request, ctx);
  if (!guarded.ok) return apiErrorResponse(guarded.error);
  const isBlockedHost = blockedHostPredicate(ctx);
  let scan: ScanResult;
  if (guarded.demo) scan = demoScan();
  else {
    try {
      scan = await scanPage(guarded.url, blocklistFetcher(deps.createFetcher, isBlockedHost), deps.launchBrowser, deps.scanOptions);
    } catch (error) {
      return apiErrorResponse(scanFailureToApiError(error));
    }
  }
  const issuedAt = (ctx.now ?? Date.now)();
  const created = await createTicketCodec(ctx.secret, { now: () => issuedAt });
  // Live scans cannot get here without a usable key (the guard closes first); a demo without one cannot be saved.
  if (!created.ok) return apiErrorResponse(apiError("PAUSED", guarded.demo ? { message: DEMO_UNAVAILABLE } : {}));
  const body = await withTickets(scan, created.codec, { demo: guarded.demo, isBlockedHost, issuedAt });
  return Response.json(body, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
