import { Zip, ZipPassThrough } from "fflate";
import { demoBody } from "./demo";
import { AppError, locationFreeMessage, publicError } from "./errors";
import { isExpectedMedia, mediaExtension, validMediaBytes } from "./assets";
import { safeFetch } from "./safe-fetch";

const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const ZIP_CHUNK_BYTES = 64 * 1024;
export const ZIP_DEADLINE_MS = 120_000;
export type ZipStreamOptions = {
  signal?: AbortSignal;
  fetcher?: typeof safeFetch;
  /** Test-only clock injection. Production always uses the two-minute deadline. */
  scheduleDeadline?: (expired: () => void, milliseconds: number) => () => void;
};
/** One verified asset: `id` is the safe name used inside the ZIP, never the external file name. */
export interface ZipAsset { readonly id: string; readonly url: string; readonly kind: "image" | "video" }
/** The least the ZIP needs, built from verified tickets: the page origin, whether it is the demo, and the assets. */
export interface ZipInput { readonly pageOrigin: string; readonly demo: boolean; readonly assets: readonly ZipAsset[] }
// Path/query may themselves be credentials. Persist only the origin, never the external filename.
export function attributionUrl(input: string): string {
  try {
    const url = new URL(input);
    return url.origin;
  } catch { return "REDACTED"; }
}
/** The media type alone (type/subtype, lowercase): parameters are dropped, since name="..." may carry the file name. */
function mediaTypeOnly(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}
/** The fixed sentence of a failure; text that could name a location (or a foreign error) becomes the generic one. */
function failureReason(error: unknown): string {
  const generic = publicError(undefined).message;
  return error instanceof AppError ? locationFreeMessage(error.message) ?? generic : generic;
}

async function* zipChunks(input: ZipInput, signal: AbortSignal, fetcher: typeof safeFetch): AsyncGenerator<Uint8Array, void> {
  const queued: Uint8Array[] = [];
  let zipError: Error | undefined;
  const zip = new Zip((error, data) => {
    if (error) zipError = error;
    else if (data.byteLength) queued.push(data);
  });
  function* drain() {
    if (zipError) throw new AppError("ZIP_FAILED", "ZIPの作成を完了できませんでした。");
    while (queued.length) {
      const chunk = queued.shift()!;
      for (let offset = 0; offset < chunk.byteLength; offset += ZIP_CHUNK_BYTES) {
        signal.throwIfAborted();
        yield chunk.subarray(offset, offset + ZIP_CHUNK_BYTES);
      }
    }
  }
  function* addFile(name: string, data: Uint8Array) {
    const entry = new ZipPassThrough(name); zip.add(entry);
    if (!data.byteLength) entry.push(data, true);
    for (let offset = 0; offset < data.byteLength; offset += ZIP_CHUNK_BYTES) {
      signal.throwIfAborted();
      entry.push(data.subarray(offset, offset + ZIP_CHUNK_BYTES), offset + ZIP_CHUNK_BYTES >= data.byteLength);
      yield* drain();
    }
    yield* drain();
  }
  try {
    let totalBytes = 0;
    const files: Array<Record<string, unknown>> = [];
    for (const asset of input.assets) {
      signal.throwIfAborted();
      let body: Uint8Array, mime: string;
      try {
        if (totalBytes >= MAX_TOTAL_BYTES) throw new AppError("ZIP_LIMIT", "ZIP全体の100MiB上限に達しました。");
        if (input.demo) ({ body, mime } = await demoBody(asset.id));
        else {
          const result = await fetcher(asset.url, { timeoutMs: 12_000, maxBytes: Math.min(MAX_FILE_BYTES, MAX_TOTAL_BYTES - totalBytes), signal });
          if (result.status !== 200) throw new AppError("ASSET_UNAVAILABLE", `取得先がHTTP ${result.status}を返しました。`);
          body = result.body; mime = result.headers["content-type"] ?? "";
          if (!isExpectedMedia(mime, asset.kind)) throw new AppError("INVALID_MEDIA", "画像・動画として確認できない形式です。");
        }
        signal.throwIfAborted();
        if (body.byteLength > MAX_FILE_BYTES) throw new AppError("ASSET_LIMIT", "素材が25MiBの上限を超えています。");
        if (!validMediaBytes(body, mime)) throw new AppError("INVALID_MEDIA", "応答内容を画像・動画ファイルとして確認できませんでした。");
        if (totalBytes + body.byteLength > MAX_TOTAL_BYTES) throw new AppError("ZIP_LIMIT", "ZIP全体の100MiB上限に達しました。");
      } catch (error) {
        if (signal.aborted) throw error;
        files.push({ id: asset.id, source: attributionUrl(asset.url), status: "failed", reason: failureReason(error) });
        continue;
      }
      totalBytes += body.byteLength;
      const filename = `${asset.kind}-${asset.id}.${mediaExtension(mime)}`;
      yield* addFile(filename, body);
      files.push({ id: asset.id, filename, source: attributionUrl(asset.url), kind: asset.kind, mime: mediaTypeOnly(mime), bytes: body.byteLength, status: "saved" });
    }
    const manifest = { app: "PageCrate", createdAt: new Date().toISOString(), page: attributionUrl(input.pageOrigin), demo: input.demo, requested: input.assets.length, saved: files.filter(file => file.status === "saved").length, note:"秘密を含み得るため、出典はorigin（ドメイン）だけ記録し、ファイル名はIDに置き換えています。正確なURLは解析画面で確認してください。取得できても再利用の許諾を意味しません。status=failedの素材はZIPに含まれません。", files };
    yield* addFile("README.txt", new TextEncoder().encode("PageCrate — 保存結果\n\nmanifest.json の saved と files[].status を必ず確認してください。取得できなかった素材は reason を記録しています。\n取得元のquery/fragmentは安全のため保存しません。サイトの規約・権利者の許諾を確認して利用してください。\n"));
    // The manifest is always the last entry: it records every success and failure that came before it.
    yield* addFile("manifest.json", new TextEncoder().encode(JSON.stringify(manifest, null, 2)));
    zip.end(); yield* drain();
  } finally { zip.terminate(); queued.length = 0; }
}

export function zipStream(input: ZipInput, onDone: () => void | Promise<void>, options: ZipStreamOptions = {}): ReadableStream<Uint8Array> {
  const abort = new AbortController();
  const iterator = zipChunks(input, abort.signal, options.fetcher ?? safeFetch);
  let open = true, cancelled = false;
  let stream: ReadableStreamDefaultController<Uint8Array>;
  let pulling: Promise<void> | undefined, stopping: Promise<void> | undefined, cleanup: Promise<void> | undefined;
  let clearDeadline = () => {};
  const externalAbort = () => { void stop(new AppError("ZIP_CANCELLED", "ダウンロードを中断しました。")).catch(() => undefined); };
  const finish = () => cleanup ??= (async () => {
    clearDeadline(); options.signal?.removeEventListener("abort", externalAbort); abort.abort();
    // The caller's slot release runs once and is awaited on every terminal path.
    try { await onDone(); } catch { /* Releasing the slot never surfaces an error. */ }
  })();
  function stop(error?: AppError): Promise<void> {
    if (stopping) return stopping;
    open = false; abort.abort();
    const activePull = pulling;
    return stopping = (async () => {
      try { await activePull; await iterator.return(); }
      finally {
        await finish();
        if (error && !cancelled) stream.error(error);
      }
    })();
  }
  return new ReadableStream<Uint8Array>({
    start(controller) {
      stream = controller;
      const expire = () => { void stop(new AppError("ZIP_TIMEOUT", "ZIPの取得時間上限に達しました。もう一度保存してください。")).catch(() => undefined); };
      clearDeadline = options.scheduleDeadline
        ? options.scheduleDeadline(expire, ZIP_DEADLINE_MS)
        : (() => { const timer = setTimeout(expire, ZIP_DEADLINE_MS); return () => clearTimeout(timer); })();
      if (options.signal?.aborted) externalAbort();
      else options.signal?.addEventListener("abort", externalAbort, { once: true });
    },
    pull() {
      if (!open) return stopping ?? finish();
      return pulling = (async () => {
        try {
          const next = await iterator.next();
          if (!open) return;
          if (next.done) { await finish(); if (open) { open = false; stream.close(); } }
          else stream.enqueue(next.value);
        } catch {
          if (!open) return;
          open = false; await finish();
          if (!cancelled) stream.error(new AppError("ZIP_FAILED", "ZIPの作成に失敗しました。"));
        }
      })();
    },
    async cancel() { cancelled = true; await stop(); },
  }, { highWaterMark: 0 });
}
