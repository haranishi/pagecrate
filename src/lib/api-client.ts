/**
 * The screen's side of the public API (design-contracts.md): request bodies, reading answers, and the one error shape
 * the screen shows. Errors arrive as {code, message, retryAfterSec?}; an answer that is not that JSON gets a fixed
 * sentence chosen by its HTTP status. Only types come from the server code (`import type`), so none of it is bundled
 * for the browser.
 */
import type { ApiErrorCode } from "./api";
import type { PreviewFetchResult } from "./preview-queue";
import type { AssetItem, ScanResponse } from "./types";

/**
 * The API's codes, plus a failed connection, an answer the screen cannot read, and a page scan the screen cannot
 * start because the server gave it no usable bot-check site key.
 */
export type ClientErrorCode = ApiErrorCode | "NETWORK_ERROR" | "UNKNOWN" | "LIVE_UNAVAILABLE";
export interface ClientError {
  readonly code: ClientErrorCode;
  /** Plain Japanese with the next step: the server's sentence, or a fixed one. */
  readonly message: string;
  /** Whole seconds the server asked to wait before trying again. */
  readonly retryAfterSec?: number;
  /** HTTP status of the answer; absent when no answer arrived. */
  readonly status?: number;
}
export type ApiCall<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly aborted: true }
  | { readonly ok: false; readonly aborted: false; readonly error: ClientError };
export type ScanInput = { readonly url: string } | { readonly demo: true };
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export const SCAN_PATH = "/api/scan";
export const DOWNLOAD_PATH = "/api/download";
export const PREVIEW_PATH_PREFIX = "/api/preview?t=";
export const NETWORK_MESSAGE = "接続できませんでした。ネットワークを確認して、もう一度お試しください。";
export const DOWNLOAD_INCOMPLETE_MESSAGE = "ダウンロードを完了できませんでした。接続を確認して、もう一度お試しください。";
const UNREADABLE_MESSAGE = "応答を読み取れませんでした。時間をおいて、もう一度お試しください。";
const CLIENT_SIDE_MESSAGE = "要求を受け付けられませんでした。ページを読み込み直して、もう一度お試しください。";
const SERVER_SIDE_MESSAGE = "サーバーで問題が起きました。時間をおいて、もう一度お試しください。";

/** Every API code once. A Record keeps the list complete: a new code is a type error here until it is added. */
const API_CODES: Readonly<Record<ApiErrorCode, true>> = {
  INVALID_URL: true, BOT_CHECK_FAILED: true, BLOCKED_HOST: true, PRIVATE_ADDRESS: true, RATE_LIMITED: true, BUSY: true,
  PAUSED: true, DAILY_CAP_REACHED: true, SCAN_FAILED: true, INVALID_TICKET: true, EXPIRED: true,
  UNSUPPORTED_PREVIEW: true, LIMIT_EXCEEDED: true, FORBIDDEN: true,
};
/** When the body is not the API's JSON: the statuses whose meaning is unambiguous. */
const STATUS_FALLBACK: Readonly<Partial<Record<number, { readonly code: ApiErrorCode; readonly message: string }>>> = {
  410: { code: "EXPIRED", message: "取得から30分が過ぎたため、この結果は使えません。もう一度ページを取得してください。" },
  413: { code: "LIMIT_EXCEEDED", message: "送る内容が大きすぎます。選ぶ素材を減らして、もう一度お試しください。" },
  429: { code: "RATE_LIMITED", message: "短い時間に続けて使われたため、受け付けを一時的に止めています。少し待ってから、もう一度お試しください。" },
  503: { code: "BUSY", message: "混み合っています。少し待ってから、もう一度お試しください。" },
};

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && Object.hasOwn(API_CODES, value);
}

function positiveSeconds(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.ceil(value) : undefined;
}

/** Retry-After as delta-seconds. An HTTP date or anything else is ignored. */
export function retryAfterHeaderSeconds(value: string | null): number | undefined {
  return value !== null && /^\s*\d+\s*$/.test(value) ? positiveSeconds(Number(value)) : undefined;
}

/**
 * One error answer as the screen shows it. The body's code, message and retryAfterSec are used when they have the
 * right shape; otherwise the status decides (410, 413, 429, 503), and any other answer gets a fixed sentence.
 */
export function apiErrorFromBody(status: number, body: unknown, retryAfterHeader: string | null = null): ClientError {
  const fields: Record<string, unknown> = body !== null && typeof body === "object" ? { ...body } : {};
  const fallback = STATUS_FALLBACK[status];
  const code: ClientErrorCode = isApiErrorCode(fields.code) ? fields.code : fallback?.code ?? "UNKNOWN";
  const message = typeof fields.message === "string" && fields.message.trim() !== ""
    ? fields.message
    : fallback?.message ?? (status >= 400 && status < 500 ? CLIENT_SIDE_MESSAGE : SERVER_SIDE_MESSAGE);
  const retryAfterSec = positiveSeconds(fields.retryAfterSec) ?? retryAfterHeaderSeconds(retryAfterHeader);
  return { code, message, status, ...(retryAfterSec === undefined ? {} : { retryAfterSec }) };
}

/** Reads an error answer. Only a JSON body is parsed; anything else is dropped unread. */
export async function readApiError(response: Response): Promise<ClientError> {
  let body: unknown = null;
  if (/^application\/(?:[\w.+-]+\+)?json\b/i.test(response.headers.get("content-type") ?? "")) {
    try { body = await response.json(); } catch { body = null; }
  } else {
    await response.body?.cancel().catch(() => undefined);
  }
  return apiErrorFromBody(response.status, body, response.headers.get("retry-after"));
}

export function networkError(message: string = NETWORK_MESSAGE): ClientError {
  return { code: "NETWORK_ERROR", message };
}

/** A public page address the scan accepts: http(s), a host, and no user name or password. */
export function isPageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname !== "" && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * The one body of POST /api/scan: {url} for a page, {demo: true} for the built-in demo. A page scan carries the
 * bot-check token when there is one (added in 4.5); the demo never does.
 */
export function scanRequestBody(input: ScanInput, turnstileToken?: string): { url: string; turnstileToken?: string } | { demo: true } {
  if ("demo" in input) return { demo: true };
  return turnstileToken ? { url: input.url, turnstileToken } : { url: input.url };
}

const KINDS: ReadonlySet<string> = new Set(["image", "video", "unsupported"]);
const optionalText = (value: unknown) => value === undefined || typeof value === "string";
const optionalNumber = (value: unknown) => value === undefined || (typeof value === "number" && Number.isFinite(value));

function isAssetItem(value: unknown): value is AssetItem {
  if (value === null || typeof value !== "object") return false;
  const item: Record<string, unknown> = { ...value };
  return typeof item.id === "string" && typeof item.name === "string" && typeof item.url === "string"
    && typeof item.kind === "string" && KINDS.has(item.kind)
    && optionalText(item.format) && optionalText(item.ticket) && optionalText(item.previewUrl) && optionalText(item.reason)
    && optionalNumber(item.bytes) && optionalNumber(item.width) && optionalNumber(item.height);
}

/** The scan answer is used as the API sends it; this only refuses a body without its shape. */
export function parseScanResponse(value: unknown): ScanResponse | null {
  if (value === null || typeof value !== "object") return null;
  const body: Record<string, unknown> = { ...value };
  const valid = typeof body.pageUrl === "string" && typeof body.truncated === "boolean"
    && typeof body.expiresAt === "string" && !Number.isNaN(Date.parse(body.expiresAt))
    && Array.isArray(body.assets) && body.assets.every(isAssetItem);
  return valid ? value as ScanResponse : null;
}

/** A preview address from the scan answer: this app's own preview route and nothing else. */
export function isPreviewPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREVIEW_PATH_PREFIX) && value.length > PREVIEW_PATH_PREFIX.length;
}

function caller(fetcher: Fetcher | undefined): Fetcher {
  // Called as a plain function: the browser's fetch refuses to run as a method of another object.
  return fetcher ?? ((input, init) => fetch(input, init));
}

function aborted(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true || (error instanceof DOMException && error.name === "AbortError");
}

/** POST /api/scan. The only place the screen sends a scan. */
export async function postScan(input: ScanInput, options: { signal?: AbortSignal; turnstileToken?: string; fetcher?: Fetcher } = {}): Promise<ApiCall<ScanResponse>> {
  const { signal } = options;
  let response: Response;
  try {
    response = await caller(options.fetcher)(SCAN_PATH, {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal,
      body: JSON.stringify(scanRequestBody(input, options.turnstileToken)),
    });
  } catch (error) {
    return aborted(error, signal) ? { ok: false, aborted: true } : { ok: false, aborted: false, error: networkError() };
  }
  if (!response.ok) return { ok: false, aborted: false, error: await readApiError(response) };
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    return aborted(error, signal) ? { ok: false, aborted: true } : { ok: false, aborted: false, error: { code: "UNKNOWN", message: UNREADABLE_MESSAGE, status: response.status } };
  }
  const scan = parseScanResponse(body);
  return scan ? { ok: true, value: scan } : { ok: false, aborted: false, error: { code: "UNKNOWN", message: UNREADABLE_MESSAGE, status: response.status } };
}

/** POST /api/download {tickets}. The ZIP is read to the end, so a stream that breaks off counts as a failure. */
export async function postDownload(tickets: readonly string[], options: { signal?: AbortSignal; fetcher?: Fetcher } = {}): Promise<ApiCall<Blob>> {
  const { signal } = options;
  try {
    const response = await caller(options.fetcher)(DOWNLOAD_PATH, {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal,
      body: JSON.stringify({ tickets }),
    });
    if (!response.ok) return { ok: false, aborted: false, error: await readApiError(response) };
    return { ok: true, value: await response.blob() };
  } catch (error) {
    return aborted(error, signal) ? { ok: false, aborted: true } : { ok: false, aborted: false, error: networkError(DOWNLOAD_INCOMPLETE_MESSAGE) };
  }
}

/**
 * GET one preview for the preview queue. An image answer becomes a Blob; an error answer gives its status, code and
 * wait. A failed connection or an abort rejects, which the queue handles.
 */
export async function fetchPreview(path: string, signal: AbortSignal, fetcher?: Fetcher): Promise<PreviewFetchResult<Blob>> {
  const response = await caller(fetcher)(path, { signal, cache: "no-store", credentials: "same-origin" });
  if (response.ok) {
    if (!/^image\//i.test(response.headers.get("content-type") ?? "")) {
      await response.body?.cancel().catch(() => undefined);
      return { ok: false, status: 415 };
    }
    return { ok: true, value: await response.blob() };
  }
  const error = await readApiError(response);
  return { ok: false, status: response.status, code: error.code, ...(error.retryAfterSec === undefined ? {} : { retryAfterSec: error.retryAfterSec }) };
}
