import { AppError } from "./errors";
import { BUSY_MESSAGE } from "./limiter";
import { assertAppHost } from "./origin";
import type { PublicOriginSetting } from "./ops-config";

/**
 * Error codes of the public API (design-contracts.md). FORBIDDEN is the one addition: the contract's list has
 * no code for the Origin check that comes first in every guard.
 */
export type ApiErrorCode =
  | "INVALID_URL" | "BOT_CHECK_FAILED" | "BLOCKED_HOST" | "PRIVATE_ADDRESS" | "RATE_LIMITED" | "BUSY" | "PAUSED"
  | "DAILY_CAP_REACHED" | "SCAN_FAILED" | "INVALID_TICKET" | "EXPIRED" | "UNSUPPORTED_PREVIEW" | "LIMIT_EXCEEDED"
  | "FORBIDDEN";
export type ApiHttpStatus = 400 | 403 | 410 | 413 | 415 | 422 | 429 | 502 | 503;
export interface ApiError {
  readonly code: ApiErrorCode;
  /** Plain Japanese with the next step. Never carries a URL, ticket or client address. */
  readonly message: string;
  readonly retryAfterSec?: number;
}

/** One status per code. 429 is only the per-client rate limit; BUSY (crowded or a failed dependency) is always 503. */
export const API_ERROR_STATUS: Readonly<Record<ApiErrorCode, ApiHttpStatus>> = {
  INVALID_URL: 400, INVALID_TICKET: 400,
  BOT_CHECK_FAILED: 403, BLOCKED_HOST: 403, FORBIDDEN: 403,
  EXPIRED: 410, LIMIT_EXCEEDED: 413, UNSUPPORTED_PREVIEW: 415, PRIVATE_ADDRESS: 422,
  RATE_LIMITED: 429,
  SCAN_FAILED: 502,
  BUSY: 503, PAUSED: 503, DAILY_CAP_REACHED: 503,
};

export const API_MESSAGES: Readonly<Record<ApiErrorCode, string>> = {
  INVALID_URL: "http:// か https:// で始まる公開ページのURLを、IDやパスワードを含めずに入力してください。",
  BOT_CHECK_FAILED: "自動化されたアクセスでないことを確認できませんでした。ページを読み込み直して、もう一度お試しください。",
  BLOCKED_HOST: "このサイトは、運営者の設定により取得できません。",
  PRIVATE_ADDRESS: "内部ネットワークなど、公開されていない接続先は取得できません。公開ページのURLを入力してください。",
  RATE_LIMITED: "短い時間に続けて使われたため、受け付けを一時的に止めています。少し待ってから、もう一度お試しください。",
  BUSY: BUSY_MESSAGE,
  // Read on its own (an API answer has no heading around it), so it says the pause and the demo in one whole sentence.
  PAUSED: "いまは、実際のサイトの取得をお休みしています。デモは使えます。",
  DAILY_CAP_REACHED: "本日の分は終了しました。再開は日本時間の午前9時ごろです。デモは使えます。",
  SCAN_FAILED: "ページを解析できませんでした。時間をおいて、もう一度お試しください。",
  INVALID_TICKET: "素材の情報を確認できませんでした。もう一度ページを取得してください。",
  EXPIRED: "取得から30分が過ぎたため、この結果は使えません。もう一度ページを取得してください。",
  UNSUPPORTED_PREVIEW: "この素材はプレビューできません。保存すると中身を確認できます。",
  LIMIT_EXCEEDED: "送られた内容が大きすぎます。選ぶ素材を減らして、もう一度お試しください。",
  FORBIDDEN: "アプリの画面から操作してください。",
};

export function apiError(code: ApiErrorCode, extra: { readonly message?: string; readonly retryAfterSec?: number } = {}): ApiError {
  return {
    code,
    message: extra.message ?? API_MESSAGES[code],
    ...(extra.retryAfterSec === undefined ? {} : { retryAfterSec: extra.retryAfterSec }),
  };
}

/** Retry-After takes whole seconds; anything that is not a positive finite number is left out. */
function retrySeconds(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.ceil(value) : undefined;
}

/** Body is {code, message, retryAfterSec?}; the hint is repeated in Retry-After. */
export function apiErrorResponse(error: ApiError): Response {
  const retryAfterSec = retrySeconds(error.retryAfterSec);
  const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  if (retryAfterSec !== undefined) headers.set("Retry-After", String(retryAfterSec));
  const body = retryAfterSec === undefined ? { code: error.code, message: error.message } : { code: error.code, message: error.message, retryAfterSec };
  return Response.json(body, { status: API_ERROR_STATUS[error.code], headers });
}

export function assertLocalRequest(request: Request, mutation = false, setting?: PublicOriginSetting): void {
  const expected = assertAppHost(request, setting);
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if ((mutation && !origin) || (origin && origin !== expected) || site === "cross-site") throw new AppError("FORBIDDEN", "アプリの画面から操作してください。", 403);
}

/** Request body limits per route. Scan keeps 16,000 bytes; a ZIP request carries up to 50 tickets. */
export const DEFAULT_BODY_MAX_BYTES = 16_000;
export const DOWNLOAD_BODY_MAX_BYTES = 512 * 1024;
export type JsonBodyFailure = "NOT_JSON" | "EMPTY" | "TOO_LARGE" | "MALFORMED";
export type JsonBodyResult = { readonly ok: true; readonly value: Record<string, unknown> } | { readonly ok: false; readonly reason: JsonBodyFailure };

/** Reads a JSON object body, never more than `maxBytes`: the stream is cancelled as soon as the limit is passed. */
export async function readJsonBody(request: Request, maxBytes = DEFAULT_BODY_MAX_BYTES): Promise<JsonBodyResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError("maxBytes must be a positive integer");
  if (!request.headers.get("content-type")?.startsWith("application/json")) return { ok: false, reason: "NOT_JSON" };
  if (Number(request.headers.get("content-length")) > maxBytes) {
    await request.body?.cancel().catch(() => undefined);
    return { ok: false, reason: "TOO_LARGE" };
  }
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, reason: "EMPTY" };
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "TOO_LARGE" };
      }
      chunks.push(value);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, reason: "MALFORMED" };
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return { ok: false, reason: "MALFORMED" };
  } finally {
    reader.releaseLock();
  }
}
