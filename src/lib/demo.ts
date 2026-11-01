import { DEMO_VIDEO_BASE64 } from "./demo-video";
import type { Asset, ScanResult } from "./types";

/**
 * Built-in demo: self-authored artwork under pseudo URLs on a reserved domain (.example never resolves). The URLs only
 * identify the items inside signed demo tickets (d:true); they are never fetched. Each URL maps to a fixed ID, and
 * the preview and ZIP serve the built-in bytes for that ID.
 */
export const DEMO_PAGE_URL = "https://pagecrate.example/studio";
const DEMO_ORIGIN = "https://pagecrate.example";

const palettes = [
  ["#e4dfd0", "#234f48", "#d99969"], ["#dae4e4", "#447773", "#f9f1df"],
  ["#eeded2", "#ab644c", "#f9f5e9"], ["#e1e3d6", "#787e54", "#faf4db"],
  ["#e8e0d8", "#554d47", "#caba9f"],
];
const names = ["studio-poster.svg", "coastal-study.svg", "sunset-texture.svg", "garden-cover.svg", "object-study.svg"];

function svg(index: number): Buffer {
  const [paper, ink, accent] = palettes[index];
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720"><rect width="960" height="720" fill="${paper}"/><circle cx="${660 - index * 30}" cy="245" r="152" fill="${accent}"/><path d="M0 610 Q240 ${200 + index * 50} 520 485 T960 370 V720 H0Z" fill="${ink}"/><path d="M0 690 Q240 370 620 575 T960 510 V720 H0Z" fill="${accent}" opacity=".72"/><rect x="70" y="70" width="44" height="6" fill="${ink}"/><text x="70" y="117" font-family="Helvetica, sans-serif" font-size="19" letter-spacing="5" fill="${ink}">PAGECRATE / STUDY 0${index + 1}</text><text x="70" y="658" font-family="Helvetica, sans-serif" font-size="15" letter-spacing="3" fill="${paper}">ORIGINAL DEMO ARTWORK</text></svg>`);
}

const DEMO_ASSETS: readonly Readonly<Asset>[] = [
  ...names.map((name, index): Asset => ({ id: `demo-image-${index}`, url: `${DEMO_ORIGIN}/assets/${name}`, name, kind: "image", format: "SVG", width: 960, height: 720, bytes: svg(index).length })),
  { id: "demo-video", url: `${DEMO_ORIGIN}/assets/motion-study.webm`, name: "motion-study.webm", kind: "video", format: "WEBM", width: 320, height: 180 },
  { id: "demo-stream", url: `${DEMO_ORIGIN}/assets/live.m3u8`, name: "live.m3u8", kind: "unsupported", format: "M3U8", reason: "HLSの分割配信です。このバージョンでは動画の結合に対応していません。" },
];

/** The demo listing, in the same shape the scanner returns. Nothing external is fetched. */
export function demoScan(): ScanResult {
  return { pageUrl: DEMO_PAGE_URL, assets: DEMO_ASSETS.map(asset => ({ ...asset })), truncated: false };
}

/** The demo item behind a pseudo URL from a demo ticket, or undefined for any other URL. */
export function demoAssetForUrl(url: string): Readonly<Asset> | undefined {
  return DEMO_ASSETS.find(asset => asset.url === url);
}

export async function demoBody(id: string): Promise<{ body: Buffer; mime: string }> {
  const match = /^demo-image-([0-4])$/.exec(id);
  if (match) return { body: svg(Number(match[1])), mime: "image/svg+xml" };
  if (id === "demo-video") return { body: Buffer.from(DEMO_VIDEO_BASE64, "base64"), mime: "video/webm" };
  throw new Error("Unknown demo asset");
}
