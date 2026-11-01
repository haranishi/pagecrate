import { test } from "node:test";
import assert from "node:assert/strict";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { validateUrl, isPublicAddress, resolvePublic, createSafeFetcher } from "../src/lib/safe-fetch";
import { assertLocalRequest, readJsonBody } from "../src/lib/api";
import { normalizeAssets, safeFilename, isExpectedMedia, validMediaBytes, MEDIA_SIGNATURE_BYTES } from "../src/lib/assets";
import { attributionUrl, zipStream } from "../src/lib/download";
import { demoScan } from "../src/lib/demo";
import { unzipSync, strFromU8 } from "fflate";
import { ByteBudget } from "../src/lib/budget";

test("shared byte budget bounds interleaved and failed transfers", () => {
  const budget = new ByteBudget(100);
  budget.consume(59); budget.consume(20); budget.consume(20);
  assert.throws(() => budget.consume(2), /上限/);
  assert.equal(budget.used, 100);
  assert.throws(() => budget.consume(1), /上限/);
});

test("URL guard blocks alternate private encodings, protocols, auth and special ports", () => {
  for (const url of ["http://127.0.0.1", "http://2130706433", "http://0x7f000001", "http://0177.0.0.1", "http://[::1]", "http://[::ffff:127.0.0.1]", "http://169.254.169.254", "http://10.0.0.1", "http://localhost.", "http://box.local", "file:///etc/passwd", "ftp://example.com", "https://name:pass@example.com", "https://example.com:8000", "http://printer"]) assert.throws(() => validateUrl(url), Error, url);
  assert.equal(validateUrl("https://example.com/picture?q=1#fragment").href, "https://example.com/picture?q=1");
});
test("public IP classifier denies private, multicast, documentation, transition and mapped ranges", () => {
  for (const ip of ["0.0.0.0", "100.64.0.1", "127.1.1.1", "192.168.1.1", "192.0.2.1", "198.18.0.1", "224.0.0.1", "255.255.255.255", "::", "::1", "fc00::1", "fe80::1", "ff02::1", "2001:db8::1", "2002:7f00:1::", "::ffff:10.0.0.1", "nonsense"]) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
});
test("DNS mixed public/private answers rejected; only validated addresses are selected", async () => {
  await assert.rejects(resolvePublic(new URL("https://example.com"), async () => [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }]), /内部/);
  const address = await resolvePublic(new URL("https://example.com"), async () => [{ address: "8.8.8.8", family: 4 }]);
  assert.deepEqual(address, { address: "8.8.8.8", family: 4 });
});
test("redirect every hop is checked and unsafe destination never reaches transport", async () => {
  const seen: string[] = [];
  const fetcher = createSafeFetcher(async () => [{ address: "8.8.8.8", family: 4 }], async (url, address) => {
    seen.push(url.hostname); assert.equal(address.address, "8.8.8.8");
    return { status: 302, headers: { location: "http://127.0.0.1/private" }, body: Buffer.alloc(0), url: url.href };
  });
  await assert.rejects(fetcher("https://example.com"), /内部/);
  assert.deepEqual(seen, ["example.com"]);
});
test("redirect limit stops loops and rebinding is checked at the next connection", async () => {
  let count = 0;
  const fetcher = createSafeFetcher(async () => [{ address: ++count === 1 ? "8.8.8.8" : "127.0.0.1", family: 4 }], async url => ({ status: 302, headers: { location: "/next" }, body: Buffer.alloc(0), url: url.href }));
  await assert.rejects(fetcher("https://example.com"), /内部/);
  const loop = createSafeFetcher(async () => [{ address: "8.8.8.8", family: 4 }], async url => ({ status: 302, headers: { location: "/again" }, body: Buffer.alloc(0), url: url.href }));
  await assert.rejects(loop("https://example.com", { redirects: 2 }), /転送回数/);
});
test("localhost API blocks foreign or missing Origin and hostile Host", () => {
  const request = (headers: Record<string, string>) => new Request("http://127.0.0.1:4381/api/scan", { headers });
  assertLocalRequest(request({ host: "127.0.0.1:4381", origin: "http://127.0.0.1:4381" }), true);
  assert.throws(() => assertLocalRequest(request({ host: "127.0.0.1:4381", origin: "https://evil.example" }), true));
  assert.throws(() => assertLocalRequest(request({ host: "127.0.0.1:4381" }), true));
  assert.throws(() => assertLocalRequest(request({ host: "evil.example:4381", origin: "http://evil.example:4381" }), true));
});
test("JSON input is bounded and invalid body is a safe user error", async () => {
  const request = (body: string) => new Request("http://localhost:4381", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  assert.deepEqual(await readJsonBody(request("{")), { ok: false, reason: "MALFORMED" });
  assert.deepEqual(await readJsonBody(request(JSON.stringify({ text: "x".repeat(16000) }))), { ok: false, reason: "TOO_LARGE" });
});
test("assets deduplicate exact URL but preserve query variants; streams are detected only", () => {
  const { assets: result, truncated } = normalizeAssets([
    { url: "/a.jpg#first", source: "img", width: 100 }, { url: "/a.jpg#second", source: "CSS背景", height: 50 },
    { url: "/a.jpg?w=200", source: "srcset", width: 200 }, { url: "/live.m3u8", source: "video", kind: "video" },
    { url: "http://127.0.0.1/photo.jpg", source: "img" }, { url: "blob:https://example.com/uuid", source: "video", kind: "video" },
  ], "https://example.com/page");
  assert.equal(result.length, 4);
  assert.equal(truncated, false);
  assert.deepEqual(result.filter(asset => asset.url.endsWith("/a.jpg")).map(asset => [asset.width, asset.height]), [[100, 50]]);
  assert.equal(result.filter(asset => asset.kind === "unsupported" && asset.reason).length, 2);
});
test("unsafe media and ZIP paths are rejected/sanitized, attribution removes query", () => {
  assert.equal(isExpectedMedia("text/html", "image"), false);
  assert.equal(isExpectedMedia("image/png", "image"), true);
  assert.equal(isExpectedMedia("video/mp4", "video"), true);
  assert.ok(!/[\\/]/.test(safeFilename("../../secret.png")));
  assert.equal(attributionUrl("https://example.com/pic.png?token=synthetic#hash"), "https://example.com");
  assert.equal(attributionUrl("https://example.com/short-token/file.png"), "https://example.com");
  assert.equal(validMediaBytes(Buffer.from("#!/bin/sh\n"), "image/png"), false);
});

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
test("media signature check: one fixed verdict per format, read from the leading bytes of any view", () => {
  const bytes = (...parts: Array<string | number[]>) => Buffer.concat(parts.map(part => typeof part === "string" ? Buffer.from(part, "latin1") : Buffer.from(part)));
  const ftyp = (brand: string) => bytes([0, 0, 0, 24], "ftyp", brand, [0, 0, 2, 0]);
  const svgAfter = (padding: number) => bytes(`<!--${"x".repeat(padding)}--><svg>`);
  const cases: Array<readonly [string, Buffer, boolean]> = [
    ["image/png", bytes(PNG_SIGNATURE), true], ["image/png", bytes([137, 80, 78, 71, 13, 10, 26, 11]), false],
    ["image/jpeg", bytes([255, 216, 255, 224]), true], ["image/jpeg", bytes([255, 216, 0]), false],
    ["image/gif", bytes("GIF89a"), true], ["image/gif", bytes("GIF87a"), true], ["image/gif", bytes("GIF88a"), false],
    ["image/webp", bytes("RIFF", [0, 0, 0, 0], "WEBP"), true], ["image/webp", bytes("RIFF", [0, 0, 0, 0], "WAVE"), false],
    ["video/mp4", ftyp("isom"), true], ["video/quicktime", ftyp("qt  "), true], ["video/x-m4v", ftyp("M4V "), true], ["video/mp4", bytes([0, 0, 0, 24], "ftip"), false],
    ["image/avif", ftyp("avif"), true], ["image/avif", ftyp("avis"), true], ["image/avif", ftyp("isom"), false],
    ["video/webm", bytes([26, 69, 223, 163]), true], ["video/webm", bytes([26, 69, 223, 0]), false],
    ["video/ogg", bytes("OggS"), true], ["video/ogg", bytes("OggT"), false], ["image/bmp", bytes("BM"), true], ["image/bmp", bytes("MB"), false],
    ["image/x-icon", bytes([0, 0, 1, 0]), true], ["image/vnd.microsoft.icon", bytes([0, 0, 2, 0]), false],
    ["image/tiff", bytes([0x49, 0x49, 0x2a, 0]), true], ["image/tiff", bytes([0x4d, 0x4d, 0, 0x2a]), true], ["image/tiff", bytes([0x49, 0x4d, 0x2a, 0]), false],
    ["image/svg+xml", bytes(' \n<?xml version="1.0"?>\n<!-- a -->\n<svg xmlns="http://www.w3.org/2000/svg"/>'), true], ["image/svg+xml", bytes("<html><svg>"), false],
    // The SVG check reads the first 4,096 bytes: "<svg>" ending exactly there passes, one byte later it does not.
    ["image/svg+xml", svgAfter(MEDIA_SIGNATURE_BYTES - 12), true], ["image/svg+xml", svgAfter(MEDIA_SIGNATURE_BYTES - 11), false],
    ["image/png", Buffer.alloc(0), false], ["text/html", bytes(PNG_SIGNATURE), false], ["IMAGE/PNG; name=x", bytes(PNG_SIGNATURE), true],
  ];
  for (const [mime, body, expected] of cases) {
    assert.equal(validMediaBytes(body, mime), expected, `${mime} ${body.subarray(0, 12).toString("hex")}`);
    // A long tail after the signature changes nothing.
    if (body.byteLength) assert.equal(validMediaBytes(Buffer.concat([body, Buffer.alloc(10_000, 0x41)]), mime), expected, `${mime} with a tail`);
  }
  assert.equal(MEDIA_SIGNATURE_BYTES, 4096);
  // A view that starts inside a larger buffer is read from its own first byte.
  const padded = Buffer.alloc(64);
  padded.set(PNG_SIGNATURE, 16);
  assert.equal(validMediaBytes(padded.subarray(16), "image/png"), true);
  assert.equal(validMediaBytes(padded.subarray(8), "image/png"), false);
  assert.equal(validMediaBytes(new Uint8Array(padded.buffer, padded.byteOffset + 16, 8), "image/png"), true);
});

test("media signature check: a 25 MiB body is read through a view, not copied (array buffer memory grows by under 1 MiB)", () => {
  setFlagsFromString("--expose-gc");
  const collectGarbage = runInNewContext("gc") as () => void;
  const body = Buffer.alloc(25 * 1024 * 1024);
  body.set(PNG_SIGNATURE);
  collectGarbage();
  const before = process.memoryUsage().arrayBuffers;
  assert.equal(validMediaBytes(body, "image/png"), true);
  const grown = process.memoryUsage().arrayBuffers - before;
  assert.ok(grown < 1024 * 1024, `array buffer memory grew by ${grown} bytes`);
});
// The old "selection IDs and cap" test (selectAssets) is gone with the function: ZIP requests now carry tickets,
// whose 1–50 limit and forgery checks are tested in guard-tickets.test.ts and download-route.test.ts.
test("demo ZIP has real image/video bytes, safe paths and matching manifest", async () => {
  let done = false;
  const demo = demoScan();
  const assets = demo.assets.flatMap(asset => asset.kind === "image" || asset.kind === "video" ? [{ id: asset.id, url: asset.url, kind: asset.kind }] : []);
  const picked = assets.filter(asset => asset.id === "demo-image-0" || asset.id === "demo-video");
  const stream = zipStream({ pageOrigin: new URL(demo.pageUrl).origin, demo: true, assets: picked }, () => { done = true; });
  const response = new Response(stream);
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  assert.equal(manifest.saved, 2);
  assert.equal(manifest.demo, true);
  // Files are named from the safe ID and the confirmed type, never from the external file name.
  assert.deepEqual(Object.keys(files).filter(name => name.startsWith("image-") || name.startsWith("video-")).sort(), ["image-demo-image-0.svg", "video-demo-video.webm"]);
  assert.ok(Object.keys(files).every(name => !name.includes("studio-poster") && !name.includes("motion-study")));
  assert.ok(Object.keys(files).every(name => !name.includes("/") && !name.includes("..")));
  assert.ok(Object.entries(files).find(([name]) => name.endsWith(".webm"))![1].length > 1000);
  assert.equal(done, true);
});
