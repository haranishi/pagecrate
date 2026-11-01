import { AppError } from "./errors";
import { isExpectedMedia, validMediaBytes } from "./assets";
import { demoAssetForUrl, demoBody } from "./demo";
import { safeFetch } from "./safe-fetch";

export const PREVIEW_MAX_BYTES = 2 * 1024 * 1024;
export const PREVIEW_CHUNK_BYTES = 64 * 1024;
export const PREVIEW_DEADLINE_MS = 20_000;
/** What a verified preview ticket names: the image URL and whether it is a built-in demo item (never fetched). */
export interface PreviewSource { readonly url: string; readonly demo: boolean }
export type PreviewOptions = {
  signal?: AbortSignal;
  fetcher?: typeof safeFetch;
  /** Test-only clock injection. Production always stops a preview after 20 seconds. */
  scheduleDeadline?: (expired: () => void, milliseconds: number) => () => void;
};

const NO_PREVIEW = "この画像はプレビューできません。元サイトで確認してください。";
const cancelled = () => new AppError("PREVIEW_CANCELLED", "画像の読み込みを中断しました。");

/** Built-in demo artwork (our own SVG) for a demo ticket's pseudo URL; anything else has no preview. */
async function builtInImage(url: string): Promise<{ body: Uint8Array; mime: string }> {
  const item = demoAssetForUrl(url);
  if (!item || item.kind !== "image") throw new AppError("NO_PREVIEW", NO_PREVIEW, 422);
  return demoBody(item.id);
}

/**
 * Streams one image of at most 2 MiB. A live image is fetched through `fetcher` and must be a non-SVG image whose
 * first bytes match its type; external SVG is refused as PREVIEW_SVG. `onDone` (the slot release) runs exactly once,
 * on EOF, cancel, deadline or failure, not when the Response object is created.
 */
export async function previewResponse(source: PreviewSource, onDone: () => void | Promise<void>, options: PreviewOptions = {}): Promise<Response> {
  const abort = new AbortController();
  let bytes: Uint8Array | undefined, mime = "", offset = 0, active = true, cancelledByReader = false;
  let failure: AppError | undefined, stream: ReadableStreamDefaultController<Uint8Array> | undefined;
  let loading: Promise<void> | undefined, pulling: Promise<void> | undefined, stopping: Promise<void> | undefined, cleanup: Promise<void> | undefined;
  let clearDeadline = () => {};
  const externalAbort = () => { void stop(cancelled()).catch(() => undefined); };
  const finish = () => cleanup ??= (async () => {
    clearDeadline(); options.signal?.removeEventListener("abort", externalAbort); abort.abort(); bytes = undefined;
    try { await onDone(); } catch { /* Releasing the slot never surfaces an error. */ }
  })();
  function stop(error?: AppError): Promise<void> {
    if (stopping) return stopping;
    active = false; failure = error; bytes = undefined; abort.abort();
    const pending = [loading, pulling];
    return stopping = (async () => {
      await Promise.allSettled(pending);
      await finish();
      if (error && !cancelledByReader) stream?.error(error);
    })();
  }
  const expire = () => { void stop(new AppError("PREVIEW_TIMEOUT", "画像の読み込みが時間切れになりました。", 504)).catch(() => undefined); };
  clearDeadline = options.scheduleDeadline
    ? options.scheduleDeadline(expire, PREVIEW_DEADLINE_MS)
    : (() => { const timer = setTimeout(expire, PREVIEW_DEADLINE_MS); return () => clearTimeout(timer); })();
  try {
    if (options.signal?.aborted) { await stop(cancelled()); throw failure; }
    options.signal?.addEventListener("abort", externalAbort, { once: true });
    loading = (async () => {
      let body: Uint8Array;
      if (source.demo) ({ body, mime } = await builtInImage(source.url));
      else {
        const response = await (options.fetcher ?? safeFetch)(source.url, { maxBytes: PREVIEW_MAX_BYTES, timeoutMs: 8000, signal: abort.signal });
        body = response.body; mime = response.headers["content-type"] ?? "";
        if (response.status !== 200) throw new AppError("NO_PREVIEW", NO_PREVIEW, 422);
        if (/svg/i.test(mime)) throw new AppError("PREVIEW_SVG", "外部のSVG画像は、安全のためプレビューしません。保存すると中身を確認できます。", 415);
        if (!isExpectedMedia(mime, "image") || !validMediaBytes(body, mime)) throw new AppError("NO_PREVIEW", NO_PREVIEW, 422);
      }
      if (body.byteLength > PREVIEW_MAX_BYTES) throw new AppError("PREVIEW_LIMIT", "プレビューは2MiBまでです。元の画像は選択して保存できます。", 413);
      if (!active) throw failure ?? cancelled();
      bytes = body;
    })();
    await loading;
    if (!active) { await stopping; throw failure; }
    const body = new ReadableStream<Uint8Array>({
      start(controller) { stream = controller; },
      pull() {
        if (!active) return stopping ?? finish();
        return pulling = (async () => {
          try {
            if (!bytes || offset >= bytes.byteLength) {
              active = false; await finish(); if (!cancelledByReader && !failure) stream?.close(); return;
            }
            // Copy only this small chunk, so a slow receiver cannot retain the full backing buffer.
            const chunk = new Uint8Array(Math.min(PREVIEW_CHUNK_BYTES, bytes.byteLength - offset));
            chunk.set(bytes.subarray(offset, offset + chunk.byteLength)); offset += chunk.byteLength;
            stream?.enqueue(chunk);
          } catch (error) {
            if (!active) return;
            active = false; failure = error instanceof AppError ? error : new AppError("NO_PREVIEW", "画像を読み込めませんでした。", 422);
            await finish(); if (!cancelledByReader) stream?.error(failure);
          }
        })();
      },
      async cancel() { cancelledByReader = true; await stop(); },
    }, { highWaterMark: 0 });
    return new Response(body, { headers: { "Content-Type": mime, "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; sandbox", "Cross-Origin-Resource-Policy": "same-origin", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { active = false; await finish(); throw failure ?? error; }
}
