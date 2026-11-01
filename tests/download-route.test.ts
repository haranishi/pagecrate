import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import { API_MESSAGES, DOWNLOAD_BODY_MAX_BYTES } from "../src/lib/api";
import { handleDownload, type DownloadRouteDeps } from "../src/lib/download-api";
import { ZIP_CHUNK_BYTES, ZIP_DEADLINE_MS, type ZipStreamOptions } from "../src/lib/download";
import { AppError } from "../src/lib/errors";
import { MAX_DOWNLOAD_TICKETS } from "../src/lib/guard";
import { BUSY_MESSAGE, createLimiter, ZIP_CONCURRENCY, type Limiter } from "../src/lib/limiter";
import { TICKET_TTL_SECONDS, type TicketInput } from "../src/lib/ticket";
import { capturingConsole, fakeSite, png, type FakeRoute } from "./helpers/fake-site";
import { context, downloadRequest, issue, DEMO_IMAGE, DEMO_VIDEO, IP, LIVE_IMAGE, OPEN_ENV, T0, type ContextOptions } from "./helpers/guard-fixtures";

const PNG_TYPE = { "content-type": "image/png" };
const liveImage = (index: number, query = ""): TicketInput => ({ ...LIVE_IMAGE, url: `https://cdn.example.net/photos/${index}.png${query}` });
const sha20 = (url: string) => createHash("sha256").update(url).digest("hex").slice(0, 20);

function clock() {
  let expired!: () => void, cleared = 0;
  const scheduleDeadline: NonNullable<ZipStreamOptions["scheduleDeadline"]> = (callback, milliseconds) => {
    assert.equal(milliseconds, ZIP_DEADLINE_MS); expired = callback;
    return () => { cleared++; };
  };
  return { scheduleDeadline, expire: () => expired(), cleared: () => cleared };
}
function harness(options: { readonly context?: ContextOptions; readonly routes?: Record<string, FakeRoute>; readonly limiter?: Limiter } = {}) {
  const run = context(options.context);
  const site = fakeSite(options.routes ?? {});
  const limiter = options.limiter ?? createLimiter(ZIP_CONCURRENCY, 10);
  const deadline = clock();
  const deps: DownloadRouteDeps = { context: () => run.ctx, createFetcher: site.createFetcher, limiter, zipOptions: { scheduleDeadline: deadline.scheduleDeadline } };
  return { deps, calls: run.calls, site, limiter, deadline };
}
async function unzipped(response: Response) {
  assert.equal(response.status, 200, response.status === 200 ? "" : await response.clone().text());
  assert.equal(response.headers.get("content-type"), "application/zip");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const raw = Buffer.from(await response.arrayBuffer());
  const files = unzipSync(new Uint8Array(raw));
  return { raw, files, manifest: JSON.parse(strFromU8(files["manifest.json"])) as { createdAt: unknown; requested: number; saved: number; demo: boolean; page: string; files: Array<Record<string, unknown>> } };
}
/** Entry names in the order their local headers ("PK\x03\x04", name length at +26, name at +30) were streamed. */
function streamedOrder(raw: Buffer, known: readonly string[]): string[] {
  const order: string[] = [];
  for (let at = raw.indexOf("PK\x03\x04"); at !== -1; at = raw.indexOf("PK\x03\x04", at + 4)) {
    const name = raw.subarray(at + 30, at + 30 + raw.readUInt16LE(at + 26)).toString("utf8");
    if (known.includes(name)) order.push(name);
  }
  return order;
}
/** The manifest is the last entry, both in the central directory and in the streamed bytes. */
function assertManifestLast(raw: Buffer, files: Record<string, Uint8Array>) {
  const names = Object.keys(files);
  assert.equal(names.at(-1), "manifest.json");
  assert.deepEqual(streamedOrder(raw, names), names);
}
async function codeOf(response: Response): Promise<[number, string]> {
  return [response.status, (await response.json() as { code: string }).code];
}

test("ZIP API (existing demo ZIP on the new entry): demo tickets give the built-in image and video, safe names, and the manifest last — nothing is fetched", async () => {
  const run = harness({ context: { env: { ...OPEN_ENV, PAGECRATE_PAUSED: "1" } } });
  const { raw, files, manifest } = await unzipped(await handleDownload(downloadRequest({ tickets: [await issue(DEMO_IMAGE), await issue(DEMO_VIDEO)] }), run.deps));
  assert.deepEqual(Object.keys(files), ["image-demo-image-0.svg", "video-demo-video.webm", "README.txt", "manifest.json"]);
  assertManifestLast(raw, files);
  assert.deepEqual([manifest.requested, manifest.saved, manifest.demo, manifest.page], [2, 2, true, "https://pagecrate.example"]);
  assert.ok(files["video-demo-video.webm"].length > 1000);
  assert.match(strFromU8(files["image-demo-image-0.svg"]), /^<svg/);
  assert.equal(run.site.created(), 0);
  assert.deepEqual(run.calls, ["limit:download"]);
  assert.equal(run.limiter.active, 0);
});

test("ZIP API (existing partial-failure ZIP on the new entry): originals unchanged, failures recorded without path, query or file name, manifest last", async () => {
  const good = png(500);
  const routes: Record<string, FakeRoute> = {
    [liveImage(0, "?token=synthetic-secret").url]: { headers: PNG_TYPE, body: good },
    [liveImage(1).url]: { status: 404, headers: PNG_TYPE },
    [liveImage(2).url]: { headers: { "content-type": "text/html" }, body: Buffer.from("<html>") },
    [liveImage(3).url]: { headers: PNG_TYPE, body: Buffer.from("#!/bin/sh\n") },
    // A failure whose sentence names a location must not carry it into the manifest.
    [liveImage(4).url]: { throws: new AppError("CONNECTION_FAILED", "cdn.example.net/photos/4.png?sig=synthetic-secret に接続できません。", 502) },
  };
  const run = harness({ routes });
  const tickets = await Promise.all([0, 1, 2, 3, 4].map(index => issue(liveImage(index, index === 0 ? "?token=synthetic-secret" : ""))));
  const { raw, files, manifest } = await unzipped(await handleDownload(downloadRequest({ tickets }), run.deps));
  const savedName = `image-${sha20(liveImage(0, "?token=synthetic-secret").url)}.png`;
  assert.deepEqual(files[savedName], new Uint8Array(good));
  assertManifestLast(raw, files);
  assert.deepEqual([manifest.requested, manifest.saved, manifest.demo, manifest.page], [5, 1, false, "https://photos.example.org"]);
  const failed = manifest.files.filter(file => file.status === "failed");
  assert.equal(failed.length, 4);
  assert.match(String(failed[3].reason), /取得できませんでした/);
  assert.ok(failed.every(file => typeof file.reason === "string" && file.source === "https://cdn.example.net"));
  assert.match(String(failed[0].reason), /HTTP 404/);
  const text = strFromU8(files["manifest.json"]);
  for (const secret of ["synthetic-secret", "token", "sig=", "/photos/", "0.png", "1.png", "4.png"]) assert.equal(text.includes(secret), false, secret);
  assert.ok(Object.keys(files).every(name => /^(?:image|video)-[0-9a-f]{20}\.[a-z0-9]+$|^README\.txt$|^manifest\.json$/.test(name)), Object.keys(files).join());
});

test("ZIP API: the manifest records when the ZIP was made, as an ISO 8601 UTC time taken during the request", async () => {
  // download.ts reads the real clock for createdAt (there is no clock to inject), so the time is checked against the request's own span.
  const run = harness({ routes: { [liveImage(0).url]: { headers: PNG_TYPE, body: png(100) }, [liveImage(1).url]: { status: 404, headers: PNG_TYPE } } });
  const tickets = [await issue(liveImage(0)), await issue(liveImage(1))];
  const before = Date.now();
  const { manifest } = await unzipped(await handleDownload(downloadRequest({ tickets }), run.deps));
  const after = Date.now();
  assert.deepEqual(manifest.files.map(file => file.status), ["saved", "failed"]);
  const { createdAt } = manifest;
  assert.ok(typeof createdAt === "string", `createdAt is ${typeof createdAt}`);
  assert.match(createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, "ISO 8601 in UTC, as Date#toISOString writes it");
  const at = Date.parse(createdAt);
  assert.ok(before <= at && at <= after, `${createdAt} is not a time within the request`);
});

test("ZIP API: 50 tickets are accepted; 51 tickets or a body over 512 KiB are 413 LIMIT_EXCEEDED before any slot or fetch", async () => {
  const routes = Object.fromEntries(Array.from({ length: MAX_DOWNLOAD_TICKETS }, (_, index) => [liveImage(index).url, { headers: PNG_TYPE, body: png(64) }]));
  const tickets = await Promise.all(Array.from({ length: MAX_DOWNLOAD_TICKETS }, (_, index) => issue(liveImage(index))));
  const run = harness({ routes });
  const { manifest } = await unzipped(await handleDownload(downloadRequest({ tickets }), run.deps));
  assert.deepEqual([manifest.requested, manifest.saved], [50, 50]);
  for (const body of [JSON.stringify({ tickets: [...tickets, tickets[0]] }), JSON.stringify({ tickets: [tickets[0]], pad: "x".repeat(DOWNLOAD_BODY_MAX_BYTES) })]) {
    const over = harness({ routes });
    const response = await handleDownload(downloadRequest(body), over.deps);
    assert.deepEqual(await codeOf(response), [413, "LIMIT_EXCEEDED"]);
    assert.deepEqual([over.site.created(), over.limiter.active], [0, 0]);
  }
});

test("ZIP API (existing size limits on the new entry): one file over 25 MiB fails, the 100 MiB total stops the fifth file, output stays in 64 KiB chunks", async () => {
  const oversized = harness({ routes: { [liveImage(0).url]: { headers: PNG_TYPE, body: png(25 * 1024 * 1024 + 1) } } });
  const { manifest } = await unzipped(await handleDownload(downloadRequest({ tickets: [await issue(liveImage(0))] }), oversized.deps));
  assert.equal(manifest.saved, 0);
  assert.match(String(manifest.files[0].reason), /25MiB/);
  const big = png(25 * 1024 * 1024);
  const routes = Object.fromEntries([0, 1, 2, 3, 4].map(index => [liveImage(index).url, { headers: PNG_TYPE, body: big }]));
  const run = harness({ routes });
  const response = await handleDownload(downloadRequest({ tickets: await Promise.all([0, 1, 2, 3, 4].map(index => issue(liveImage(index)))) }), run.deps);
  const reader = response.body!.getReader();
  const tail: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const item = await reader.read(); if (item.done) break;
    assert.ok(item.value.byteLength <= ZIP_CHUNK_BYTES); total += item.value.byteLength;
    tail.push(item.value); if (tail.length > 8) tail.shift();
  }
  assert.equal(run.site.fetched.length, 4);
  assert.ok(total > 100 * 1024 * 1024 && total < 100 * 1024 * 1024 + 100_000);
  const metadata = Buffer.concat(tail).toString();
  assert.match(metadata, /"saved": 4/); assert.match(metadata, /ZIP全体の100MiB/);
  assert.equal(run.limiter.active, 0);
});

test("ZIP API (existing streaming test on the new entry): a slow reader gets at most one 25 MiB asset in flight; cancel releases the slot once", async () => {
  const big = png(25 * 1024 * 1024);
  const run = harness({ routes: Object.fromEntries([0, 1, 2, 3].map(index => [liveImage(index).url, { headers: PNG_TYPE, body: big }])) });
  const response = await handleDownload(downloadRequest({ tickets: await Promise.all([0, 1, 2, 3].map(index => issue(liveImage(index)))) }), run.deps);
  const reader = response.body!.getReader();
  for (let index = 0; index < 5; index++) {
    const chunk = await reader.read(); assert.equal(chunk.done, false);
    assert.ok(chunk.value!.byteLength <= ZIP_CHUNK_BYTES);
    assert.equal(run.site.fetched.length, 1);
  }
  assert.equal(run.limiter.active, 1);
  await reader.cancel();
  assert.deepEqual([run.site.fetched.length, run.limiter.active, run.deadline.cleared()], [1, 0, 1]);
});

test("ZIP API: an expired ticket is 410, a forged one 400, and tickets from different results are 400 — before any slot or fetch", async () => {
  const ticket = await issue(liveImage(0));
  const expired = harness({ context: { now: T0 + TICKET_TTL_SECONDS * 1000 } });
  const answer = await handleDownload(downloadRequest({ tickets: [ticket] }), expired.deps);
  const body = await answer.json() as { code: string; message: string };
  assert.deepEqual([answer.status, body.code], [410, "EXPIRED"]);
  assert.match(body.message, /もう一度ページを取得/);
  const [payload, mac] = ticket.split(".");
  const forged = `${payload}.${mac.slice(0, -2)}${mac.endsWith("AA") ? "BA" : "AA"}`;
  const mixedPage = await issue({ ...liveImage(1), pageOrigin: "https://other.example.org" });
  const cases: Array<[unknown, number, string]> = [
    [{ tickets: [forged] }, 400, "INVALID_TICKET"], [{ tickets: [] }, 400, "INVALID_TICKET"], [{ tickets: "x" }, 400, "INVALID_TICKET"],
    [{ tickets: [ticket, mixedPage] }, 400, "INVALID_TICKET"], [{ tickets: [ticket, await issue(DEMO_IMAGE)] }, 400, "INVALID_TICKET"],
  ];
  for (const [payloadBody, status, code] of cases) {
    const run = harness();
    assert.deepEqual(await codeOf(await handleDownload(downloadRequest(payloadBody), run.deps)), [status, code], JSON.stringify(payloadBody).slice(0, 30));
    assert.deepEqual([run.site.created(), run.limiter.active], [0, 0]);
  }
  const mixed = await handleDownload(downloadRequest({ tickets: [ticket, mixedPage] }), harness().deps);
  assert.match((await mixed.json() as { message: string }).message, /別々に取得した結果/);
  // A demo ticket for a URL outside the built-in items, or of the wrong kind, is refused too.
  for (const input of [{ ...DEMO_IMAGE, url: "https://pagecrate.example/assets/not-built-in.svg" }, { ...DEMO_VIDEO, kind: "image" as const }]) {
    assert.deepEqual(await codeOf(await handleDownload(downloadRequest({ tickets: [await issue(input)] }), harness().deps)), [400, "INVALID_TICKET"]);
  }
});

test("ZIP API: a second concurrent ZIP is BUSY (503, Retry-After 10) without fetching; the slot frees when the first ZIP ends", async () => {
  const limiter = createLimiter(ZIP_CONCURRENCY, 10);
  const routes = { [liveImage(0).url]: { headers: PNG_TYPE, body: png(100) } };
  const first = harness({ routes, limiter });
  const ticket = await issue(liveImage(0));
  const running = await handleDownload(downloadRequest({ tickets: [ticket] }), first.deps);
  assert.equal(running.status, 200);
  const second = harness({ routes, limiter });
  const busy = await handleDownload(downloadRequest({ tickets: [ticket] }), second.deps);
  const body = await busy.json() as { code: string; message: string; retryAfterSec: number };
  assert.deepEqual([busy.status, busy.headers.get("retry-after"), body.code, body.message, body.retryAfterSec], [503, "10", "BUSY", BUSY_MESSAGE, 10]);
  assert.equal(second.site.created(), 0);
  await running.arrayBuffer();
  assert.equal(limiter.active, 0);
  assert.equal((await handleDownload(downloadRequest({ tickets: [ticket] }), harness({ routes, limiter }).deps)).status, 200);
});

test("ZIP API: a blocked host is refused — 403 up front when a ticket names it, and a redirect to it fails that file without contacting it", async () => {
  const blockedNow = harness({ context: { env: { ...OPEN_ENV, PAGECRATE_BLOCKED_HOSTS: "cdn.example.net" } } });
  assert.deepEqual(await codeOf(await handleDownload(downloadRequest({ tickets: [await issue(liveImage(0))] }), blockedNow.deps)), [403, "BLOCKED_HOST"]);
  assert.deepEqual([blockedNow.site.created(), blockedNow.limiter.active], [0, 0]);
  const run = harness({ routes: { [liveImage(0).url]: { location: "https://img.blocked.example/a.png" }, [liveImage(1).url]: { headers: PNG_TYPE, body: png(100) } } });
  const { manifest } = await unzipped(await handleDownload(downloadRequest({ tickets: [await issue(liveImage(0)), await issue(liveImage(1))] }), run.deps));
  assert.deepEqual([manifest.requested, manifest.saved], [2, 1]);
  assert.equal(manifest.files[0].status, "failed");
  assert.equal(manifest.files[0].reason, API_MESSAGES.BLOCKED_HOST);
  assert.equal(run.site.resolved.includes("img.blocked.example"), false);
  assert.equal(run.site.fetched.some(href => href.includes("blocked.example")), false);
});

test("ZIP API: a repeated ticket is saved once, and file IDs are recomputed from the URL on the server", async () => {
  const run = harness({ routes: { [liveImage(0).url]: { headers: PNG_TYPE, body: png(100) } } });
  const ticket = await issue(liveImage(0));
  const { files, manifest } = await unzipped(await handleDownload(downloadRequest({ tickets: [ticket, ticket, await issue(liveImage(0), T0 + 1000)] }), run.deps));
  assert.deepEqual([manifest.requested, manifest.saved], [1, 1]);
  assert.deepEqual(manifest.files.map(file => file.id), [sha20(liveImage(0).url)]);
  assert.ok(files[`image-${sha20(liveImage(0).url)}.png`]);
  assert.equal(run.site.fetched.length, 1);
});

test("ZIP API: an unreadable request context closes as BUSY; nothing is logged and no error body names the URL, the ticket or the address", async () => {
  const site = fakeSite({});
  const noContext = await handleDownload(downloadRequest({ tickets: ["x"] }), { context: () => { throw new Error("no Cloudflare context"); }, createFetcher: site.createFetcher, limiter: createLimiter(1, 10) });
  assert.deepEqual([noContext.status, noContext.headers.get("retry-after")], [503, "30"]);
  const ticket = await issue(liveImage(0));
  const bodies: string[] = [];
  const printed = await capturingConsole(async () => {
    const runs = [harness({ context: { limits: { download: false } } }), harness({ context: { env: { ...OPEN_ENV, PAGECRATE_PAUSED: "1" } } }), harness({ context: { env: { ...OPEN_ENV, PAGECRATE_BLOCKED_HOSTS: "cdn.example.net" } } })];
    for (const run of runs) bodies.push(await (await handleDownload(downloadRequest({ tickets: [ticket] }), run.deps)).text());
    // A ZIP whose file fails mid-stream keeps the failure inside the manifest, never in a log.
    await (await handleDownload(downloadRequest({ tickets: [ticket] }), harness({ routes: { [liveImage(0).url]: { location: "http://10.0.0.1/a.png" } } }).deps)).arrayBuffer();
  });
  assert.deepEqual(printed, []);
  for (const body of bodies) for (const secret of [liveImage(0).url, "cdn.example.net", ticket, IP]) assert.equal(body.includes(secret), false, body.slice(0, 60));
});
