import { test } from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { parseManifest, readDownloadReport } from "../src/lib/download-report";
import { zipStream } from "../src/lib/download";

test("download report: counts and failure reasons from the manifest; a manifest without its shape is refused", () => {
  assert.deepEqual(parseManifest({
    requested: 3, saved: 1,
    files: [
      { id: "a", status: "saved" },
      { id: "b", status: "failed", reason: "取得先がHTTP 403を返しました。" },
      { id: "c", status: "failed" },
      { status: "failed", reason: "no id" },
      null,
    ],
  }), { requested: 3, saved: 1, failures: [{ id: "b", reason: "取得先がHTTP 403を返しました。" }, { id: "c", reason: "素材を取得できませんでした。" }] });
  for (const broken of [null, [], { requested: 1 }, { requested: "2", saved: 1 }, { requested: 1, saved: 2 }, { requested: -1, saved: 0 }, { requested: 1.5, saved: 1 }]) {
    assert.equal(parseManifest(broken), null, JSON.stringify(broken));
  }
});

test("download report: read from a real ZIP of the server, and null when the ZIP or its manifest cannot be read", async () => {
  const stream = zipStream({ pageOrigin: "https://pagecrate.example", demo: true, assets: [{ id: "demo-image-0", url: "https://pagecrate.example/assets/studio-poster.svg", kind: "image" }] }, () => undefined);
  const zip = await new Response(stream).blob();
  assert.deepEqual(await readDownloadReport(zip), { requested: 1, saved: 1, failures: [] });
  assert.equal(await readDownloadReport(new Blob([strToU8("not a zip")])), null);
  assert.equal(await readDownloadReport(new Blob([zipSync({ "README.txt": strToU8("x") })])), null);
  assert.equal(await readDownloadReport(new Blob([zipSync({ "manifest.json": strToU8("{oops") })])), null);
});
