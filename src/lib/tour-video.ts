export const MAX_TOUR_VIDEO_BYTES = 1024 * 1024;
type AssetFetcher = (request: Request) => Promise<Response>;
type ByteRange = { start: number; end: number } | "invalid" | null;

function rangeFor(value: string | null, size: number): ByteRange {
  if (!value) return null;
  const header = value.trim();
  if (!/^bytes=/i.test(header)) return null; // RFC 9110: ignore unknown range units.
  if (header.length > 128) return "invalid";
  if (header.includes(",")) return null; // Multipart is unnecessary for these two small videos.
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header);
  if (!match || (!match[1] && !match[2])) return "invalid";
  const length = BigInt(size);
  if (!match[1]) {
    const suffix = BigInt(match[2]);
    return suffix === 0n ? "invalid" : { start: Number(suffix >= length ? 0n : length - suffix), end: size - 1 };
  }
  const start = BigInt(match[1]), end = match[2] ? BigInt(match[2]) : length - 1n;
  if (start >= length || end < start) return "invalid";
  return { start: Number(start), end: Number(end >= length ? length - 1n : end) };
}

function declaredSize(response: Response): number | undefined {
  const value = response.headers.get("content-length");
  if (value === null) return undefined;
  if (!/^\d{1,12}$/.test(value)) throw new Error("Invalid asset size");
  const size = Number(value);
  if (size < 1 || size > MAX_TOUR_VIDEO_BYTES) throw new Error("Asset size limit");
  return size;
}

async function readVideo(response: Response, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const expected = declaredSize(response), reader = response.body?.getReader();
  if (!reader) throw new Error("Missing asset body");
  const chunks: Uint8Array[] = [];
  let size = 0, finished = false;
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const next = await reader.read();
      signal.throwIfAborted();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_TOUR_VIDEO_BYTES) throw new Error("Asset size limit");
      chunks.push(next.value);
    }
    if (!size || (expected !== undefined && expected !== size)) throw new Error("Incomplete asset");
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    finished = true;
    return body;
  } finally {
    signal.removeEventListener("abort", cancel);
    if (!finished) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Only the two bundled, self-owned tour videos. The injected fetcher must be ASSETS.fetch, never global fetch. */
export async function serveTourVideo(request: Request, fetchAsset: AssetFetcher): Promise<Response | null> {
  const url = new URL(request.url);
  const mime = url.pathname === "/tour/pagecrate-tour.mp4" ? "video/mp4"
    : url.pathname === "/tour/pagecrate-tour.webm" ? "video/webm" : undefined;
  if (!mime) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
  url.search = ""; url.hash = "";
  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal]);
  const timer = setTimeout(() => abort.abort(), 5000);
  let source: Response | undefined;
  try {
    signal.throwIfAborted();
    // Do not forward Range, conditions, credentials or caller-controlled headers.
    source = await fetchAsset(new Request(url, { method: request.method, headers: { "Accept-Encoding": "identity" }, redirect: "manual", signal }));
    if (source.status !== 200 || source.headers.get("content-type")?.split(";")[0].trim() !== mime || ![null, "identity"].includes(source.headers.get("content-encoding"))) throw new Error("Invalid bundled asset");
    const headers = new Headers({ "Content-Type": mime, "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=0, must-revalidate, no-transform", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" });
    const etag = source.headers.get("etag");
    if (etag) headers.set("ETag", etag);
    if (request.method === "HEAD") {
      const size = declaredSize(source);
      if (size === undefined) throw new Error("Missing asset size");
      await source.body?.cancel();
      headers.set("Content-Length", String(size));
      return new Response(null, { status: 200, headers }); // Range is defined for GET, not HEAD.
    }
    const body = await readVideo(source, signal);
    const ifRange = request.headers.get("if-range");
    // Only an exact, strong ETag is a proven validator; otherwise return the full current video.
    const range = !ifRange || (ifRange.startsWith('"') && ifRange === etag) ? rangeFor(request.headers.get("range"), body.byteLength) : null;
    if (range === "invalid") {
      headers.set("Content-Range", `bytes */${body.byteLength}`);
      headers.set("Content-Length", "0");
      headers.set("Cache-Control", "no-store");
      return new Response(null, { status: 416, headers });
    }
    if (range) {
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${body.byteLength}`);
      headers.set("Content-Length", String(range.end - range.start + 1));
      return new Response(body.subarray(range.start, range.end + 1), { status: 206, headers });
    }
    headers.set("Content-Length", String(body.byteLength));
    return new Response(body, { status: 200, headers });
  } catch {
    await source?.body?.cancel().catch(() => undefined);
    return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  } finally { clearTimeout(timer); abort.abort(); }
}
