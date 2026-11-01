import { createHash } from "node:crypto";
import type { Asset, AssetKind } from "./types";
import { validateUrl } from "./safe-fetch";

export interface Candidate { url: string; source: string; kind?: AssetKind; width?: number; height?: number; mime?: string; bytes?: number }
/** At most this many distinct candidates per scan; more are dropped and the result is marked truncated. */
export const MAX_CANDIDATES = 200;
export const UNSUPPORTED_REASON = "分割配信・blob形式は検出のみです。結合・DRM解除には対応していません。";
const videoExtensions = new Set(["mp4", "webm", "mov", "m4v", "ogv", "ogg"]);
const imageExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "bmp", "ico", "tiff", "tif"]);
export function extensionOf(url: string): string {
  try { return new URL(url).pathname.split(".").pop()?.toLowerCase().match(/^[a-z0-9]{1,6}$/)?.[0] ?? ""; } catch { return ""; }
}
/** HLS, DASH and blob URLs are detected only ("unsupported"): they are listed with a reason and never saved. */
export function inferKind(url: string, mime = ""): AssetKind | undefined {
  const extension = extensionOf(url);
  if (/mpegurl|dash\+xml/i.test(mime) || ["m3u8", "mpd"].includes(extension) || url.startsWith("blob:")) return "unsupported";
  if (mime.startsWith("image/") || imageExtensions.has(extension)) return "image";
  if (mime.startsWith("video/") || videoExtensions.has(extension)) return "video";
}
/** Asset ID: the first 20 hex digits of sha256(URL). The server recomputes it from a ticket and never trusts a client ID. */
export function assetIdFor(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 20);
}
export function safeFilename(input: string, fallback = "asset"): string {
  let decoded = input;
  try { decoded = decodeURIComponent(input); } catch { /* Keep undecodable name. */ }
  return decoded.normalize("NFKC").replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, "_").replace(/^\.+/, "").replace(/[. ]+$/, "").slice(0, 120) || fallback;
}
/**
 * Deduplicates candidates by exact URL (fragments dropped, queries kept), keeps public http(s) and blob URLs only,
 * and stops at MAX_CANDIDATES distinct entries. `truncated` is true when a further valid candidate was dropped.
 */
export function normalizeAssets(candidates: Candidate[], pageUrl: string): { assets: Asset[]; truncated: boolean } {
  const found = new Map<string, Asset>();
  let truncated = false;
  for (const candidate of candidates) {
    let url: string;
    const streamBlob = candidate.url.startsWith("blob:");
    try { url = streamBlob ? candidate.url : validateUrl(new URL(candidate.url, pageUrl).href).href; } catch { continue; }
    const existing = found.get(url);
    if (existing) {
      existing.width = Math.max(existing.width ?? 0, candidate.width ?? 0) || undefined;
      existing.height = Math.max(existing.height ?? 0, candidate.height ?? 0) || undefined;
      existing.bytes = existing.bytes ?? candidate.bytes;
      continue;
    }
    const kind = inferKind(url, candidate.mime) ?? candidate.kind;
    if (!kind) continue;
    if (found.size >= MAX_CANDIDATES) { truncated = true; continue; }
    const extension = extensionOf(url);
    const format = extension || candidate.mime?.split("/")[1]?.split(";")[0] || (kind === "unsupported" ? "STREAM" : "不明");
    const name = safeFilename(new URL(url).pathname.split("/").pop() || `${kind}-${found.size + 1}`);
    found.set(url, {
      id: assetIdFor(url), url, name, kind, format: format.toUpperCase(),
      width: candidate.width, height: candidate.height, bytes: candidate.bytes,
      ...(kind === "unsupported" ? { reason: UNSUPPORTED_REASON } : {}),
    });
  }
  const assets = [...found.values()].sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0));
  return { assets, truncated };
}

export function isExpectedMedia(mime: string, kind: AssetKind): boolean {
  return kind === "image" ? /^image\/(jpeg|png|gif|webp|avif|svg\+xml|bmp|x-icon|vnd\.microsoft\.icon|tiff)(;|$)/i.test(mime)
    : kind === "video" && /^video\/(mp4|webm|quicktime|x-m4v|ogg)(;|$)/i.test(mime);
}

export function mediaExtension(mime: string): string | undefined {
  const map: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif", "image/svg+xml": "svg", "image/bmp": "bmp", "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico", "image/tiff": "tif", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/x-m4v": "m4v", "video/ogg": "ogv" };
  return map[mime.split(";")[0].trim().toLowerCase()];
}
/** Every signature check below reads at most the first 4,096 bytes (the SVG check reads the most). */
export const MEDIA_SIGNATURE_BYTES = 4096;
export function validMediaBytes(body: Uint8Array, mime: string): boolean {
  // A view of the leading bytes, not a copy: checking a 25 MiB asset must not hold it in memory twice.
  const data = Buffer.from(body.buffer, body.byteOffset, Math.min(MEDIA_SIGNATURE_BYTES, body.byteLength));
  const extension = mediaExtension(mime);
  if (!data.length || !extension) return false;
  if (extension === "png") return data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === "jpg") return data[0] === 255 && data[1] === 216 && data[2] === 255;
  if (extension === "gif") return /^GIF8[79]a/.test(data.subarray(0, 6).toString("ascii"));
  if (extension === "webp") return data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP";
  if (["mp4", "mov", "m4v", "avif"].includes(extension)) return data.subarray(4, 8).toString() === "ftyp" && (extension !== "avif" || /avif|avis/.test(data.subarray(8, 40).toString()));
  if (extension === "webm") return data.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]));
  if (extension === "ogv") return data.subarray(0, 4).toString() === "OggS";
  if (extension === "bmp") return data.subarray(0, 2).toString() === "BM";
  if (extension === "ico") return data.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]));
  if (extension === "tif") return ["49492a00", "4d4d002a"].includes(data.subarray(0, 4).toString("hex"));
  if (extension === "svg") return /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(data.subarray(0, MEDIA_SIGNATURE_BYTES).toString("utf8"));
  return false;
}
