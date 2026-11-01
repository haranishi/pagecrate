/**
 * What a saved ZIP holds, read back from its manifest.json (the last entry, design-contracts.md): how many assets were
 * asked for, how many were saved, and why the others failed. The screen shows this next to the save button.
 */
export interface DownloadFailure { readonly id: string; readonly reason: string }
export interface DownloadReport { readonly requested: number; readonly saved: number; readonly failures: readonly DownloadFailure[] }

const DEFAULT_REASON = "素材を取得できませんでした。";
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

/** The report in a parsed manifest, or null when the manifest does not have the expected shape. */
export function parseManifest(value: unknown): DownloadReport | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const manifest: Record<string, unknown> = { ...value };
  if (!count(manifest.requested) || !count(manifest.saved) || manifest.saved > manifest.requested) return null;
  const failures: DownloadFailure[] = [];
  if (Array.isArray(manifest.files)) {
    for (const file of manifest.files) {
      if (file === null || typeof file !== "object") continue;
      const entry: Record<string, unknown> = { ...file };
      if (entry.status !== "failed" || typeof entry.id !== "string") continue;
      failures.push({ id: entry.id, reason: typeof entry.reason === "string" && entry.reason.trim() !== "" ? entry.reason : DEFAULT_REASON });
    }
  }
  return { requested: manifest.requested, saved: manifest.saved, failures };
}

/** Reads manifest.json out of a ZIP. Null when the ZIP or the manifest cannot be read; the ZIP is still saved. */
export async function readDownloadReport(zip: Blob): Promise<DownloadReport | null> {
  try {
    const { unzipSync, strFromU8 } = await import("fflate");
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()), { filter: file => file.name === "manifest.json" });
    const manifest = files["manifest.json"];
    return manifest ? parseManifest(JSON.parse(strFromU8(manifest))) : null;
  } catch {
    return null;
  }
}
