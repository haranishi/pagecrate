/** design-contracts.md: an image, a plain video file, or a detected-only stream (HLS, DASH, blob). */
export type AssetKind = "image" | "video" | "unsupported";

/** A candidate as the scanner finds it, before the scan API attaches a ticket. `id` is sha256(URL), first 20 hex digits. */
export interface Asset {
  id: string;
  url: string;
  name: string;
  kind: AssetKind;
  format: string;
  width?: number;
  height?: number;
  bytes?: number;
  /** Why the candidate cannot be saved (set for `unsupported`). */
  reason?: string;
}

/** Scanner output: the page URL after redirects, at most 200 candidates, and whether a limit cut the list short. */
export interface ScanResult {
  pageUrl: string;
  assets: Asset[];
  /** More than 200 candidates were found, or the 40-second analysis was cut off. */
  truncated: boolean;
}

/** design-contracts.md: one candidate in the scan response. Only image and video candidates that can be fetched carry a ticket. */
export interface AssetItem {
  id: string;
  kind: AssetKind;
  name: string;
  url: string;
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
  ticket?: string;
  previewUrl?: string;
  reason?: string;
}

/** design-contracts.md: the body of a successful POST /api/scan. */
export interface ScanResponse {
  pageUrl: string;
  assets: AssetItem[];
  truncated: boolean;
  /** When every ticket in this response expires: 30 minutes after issue (ISO 8601). */
  expiresAt: string;
}
