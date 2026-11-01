import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { zipStream, ZIP_CHUNK_BYTES, ZIP_DEADLINE_MS, type ZipInput, type ZipStreamOptions } from "../src/lib/download";
import type { safeFetch } from "../src/lib/safe-fetch";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function clock() {
  let expired!: () => void, cleared = 0;
  const scheduleDeadline: NonNullable<ZipStreamOptions["scheduleDeadline"]> = (callback, milliseconds) => {
    assert.equal(milliseconds, ZIP_DEADLINE_MS); expired = callback;
    return () => { cleared++; };
  };
  return { scheduleDeadline, expire: () => expired(), cleared: () => cleared };
}
function scan(count = 4): ZipInput {
  return { pageOrigin: "https://fixture.example", demo: false,
    assets: Array.from({ length: count }, (_, index) => ({ id: `fixture-${index}`, url: `https://fixture.example/${index}.png?value=synthetic`, kind: "image" as const })),
  };
}
function png(bytes = 100): Buffer {
  const body = Buffer.alloc(bytes); body.set([137, 80, 78, 71, 13, 10, 26, 10]); return body;
}
function response(url: string, body: Buffer, status = 200) { return { status, headers: { "content-type": "image/png" }, body, url }; }

test("slow consumers fetch no more than one 25 MiB asset and receive at most 64 KiB per pull", async () => {
  const value = scan(), deadline = clock(), body = png(25 * 1024 * 1024);
  let fetches = 0, cleanups = 0;
  const fetcher: typeof safeFetch = async url => { fetches++; return response(url, body); };
  const stream = zipStream(value, () => { cleanups++; }, { fetcher, scheduleDeadline: deadline.scheduleDeadline });
  await Promise.resolve(); assert.equal(fetches, 0);
  const reader = stream.getReader();
  for (let index = 0; index < 5; index++) {
    const chunk = await reader.read(); assert.equal(chunk.done, false);
    assert.ok(chunk.value!.byteLength <= ZIP_CHUNK_BYTES);
    await Promise.resolve(); assert.equal(fetches, 1);
  }
  await reader.cancel();
  assert.equal(fetches, 1); assert.equal(cleanups, 1); assert.equal(deadline.cleared(), 1);
});

test("pull-based ZIP retains valid originals and partial-failure manifest without source queries", async () => {
  const value = scan(3), deadline = clock(), bytes = png(); let cleanups = 0;
  const fetcher: typeof safeFetch = async url => response(url, bytes, url.includes("/0.png") ? 200 : 404);
  const stream = zipStream(value, async () => { await Promise.resolve(); cleanups++; }, { fetcher, scheduleDeadline: deadline.scheduleDeadline });
  const files = unzipSync(new Uint8Array(await new Response(stream).arrayBuffer()));
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  assert.deepEqual(files["image-fixture-0.png"], new Uint8Array(bytes));
  assert.equal(manifest.saved, 1); assert.equal(manifest.requested, 3);
  assert.equal(manifest.files.filter((file: { status: string }) => file.status === "failed").length, 2);
  assert.equal(JSON.stringify(manifest).includes("synthetic"), false);
  assert.equal(cleanups, 1); assert.equal(deadline.cleared(), 1);
});

test("manifest records only type/subtype: a file name in Content-Type parameters reaches neither the manifest nor any ZIP name", async () => {
  for (const contentType of ['image/png; name="IMG_20261031_private-name.png"', "IMAGE/PNG", 'Image/PNG;Name="private-name.png"; x=1']) {
    const deadline = clock(), bytes = png();
    const fetcher: typeof safeFetch = async url => ({ status: 200, headers: { "content-type": contentType }, body: bytes, url });
    const raw = new Uint8Array(await new Response(zipStream(scan(1), () => {}, { fetcher, scheduleDeadline: deadline.scheduleDeadline })).arrayBuffer());
    const files = unzipSync(raw);
    const text = strFromU8(files["manifest.json"]);
    const manifest = JSON.parse(text);
    // The name inside the ZIP and its extension are decided as before: from the safe ID and the confirmed type.
    assert.deepEqual(Object.keys(files), ["image-fixture-0.png", "README.txt", "manifest.json"], contentType);
    assert.deepEqual([manifest.files[0].status, manifest.files[0].mime], ["saved", "image/png"], contentType);
    assert.equal(text.includes("private-name"), false, contentType);
    // Entries are stored uncompressed, so the raw archive bytes would show the name if any entry carried it.
    assert.equal(Buffer.from(raw).includes("private-name"), false, contentType);
  }
});

test("unread response reaches its global deadline and awaits one asynchronous cleanup", async () => {
  const value = scan(), deadline = clock(), entered = deferred(), release = deferred();
  let fetches = 0, cleanups = 0, settled = false;
  const fetcher: typeof safeFetch = async url => { fetches++; return response(url, png()); };
  const stream = zipStream(value, async () => { cleanups++; entered.resolve(); await release.promise; }, { fetcher, scheduleDeadline: deadline.scheduleDeadline });
  deadline.expire();
  const result = stream.getReader().read().then(() => { settled = true; return undefined; }, error => { settled = true; return error; });
  await entered.promise; assert.equal(settled, false); assert.equal(fetches, 0);
  release.resolve(); assert.equal((await result).code, "ZIP_TIMEOUT");
  deadline.expire(); await Promise.resolve();
  assert.equal(cleanups, 1); assert.equal(deadline.cleared(), 1);
});

test("deadline also stops a producer paused between pulls, without fetching another asset", async () => {
  const value = scan(), deadline = clock(); let fetches = 0, cleanups = 0;
  const fetcher: typeof safeFetch = async url => { fetches++; return response(url, png(ZIP_CHUNK_BYTES * 3)); };
  const reader = zipStream(value, () => { cleanups++; }, { fetcher, scheduleDeadline: deadline.scheduleDeadline }).getReader();
  await reader.read(); assert.equal(fetches, 1);
  deadline.expire();
  await assert.rejects(reader.read(), { code: "ZIP_TIMEOUT" });
  assert.equal(fetches, 1); assert.equal(cleanups, 1); assert.equal(deadline.cleared(), 1);
});

test("cancel aborts an active fetch and waits for cleanup once, including deadline/abort races", async () => {
  const value = scan(), deadline = clock(), started = deferred(), cleaning = deferred(), release = deferred(), request = new AbortController();
  let aborted = 0, cleanups = 0, cancelSettled = false;
  const fetcher: typeof safeFetch = async (_url, options) => {
    started.resolve();
    return new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => { aborted++; reject(new Error("synthetic abort")); }, { once: true }));
  };
  const reader = zipStream(value, async () => { cleanups++; cleaning.resolve(); await release.promise; }, { fetcher, signal: request.signal, scheduleDeadline: deadline.scheduleDeadline }).getReader();
  const read = reader.read(); await started.promise;
  const cancellation = reader.cancel().then(() => { cancelSettled = true; });
  deadline.expire(); request.abort();
  await cleaning.promise; assert.equal(cancelSettled, false);
  release.resolve(); await cancellation; assert.equal((await read).done, true);
  assert.equal(aborted, 1); assert.equal(cleanups, 1); assert.equal(deadline.cleared(), 1);
});

test("request abort before reading or during fetching releases exactly once", async () => {
  for (const beforeRead of [true, false]) {
    const value = scan(), deadline = clock(), request = new AbortController(), started = deferred();
    let fetches = 0, cleanups = 0;
    const fetcher: typeof safeFetch = async (_url, options) => {
      fetches++; started.resolve();
      return new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("synthetic abort")), { once: true }));
    };
    if (beforeRead) request.abort();
    const reader = zipStream(value, () => { cleanups++; }, { fetcher, signal: request.signal, scheduleDeadline: deadline.scheduleDeadline }).getReader();
    const failed = assert.rejects(reader.read(), { code: "ZIP_CANCELLED" });
    if (!beforeRead) { await started.promise; request.abort(); }
    await failed; deadline.expire(); await Promise.resolve();
    assert.equal(fetches, beforeRead ? 0 : 1); assert.equal(cleanups, 1); assert.equal(deadline.cleared(), 1);
  }
});

test("per-file 25 MiB limit rejects an oversized injected response", async () => {
  const value = scan(1), deadline = clock(); let cleanups = 0;
  const fetcher: typeof safeFetch = async url => response(url, png(25 * 1024 * 1024 + 1));
  const files = unzipSync(new Uint8Array(await new Response(zipStream(value, () => { cleanups++; }, { fetcher, scheduleDeadline: deadline.scheduleDeadline })).arrayBuffer()));
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  assert.equal(manifest.saved, 0); assert.match(manifest.files[0].reason, /25MiB/); assert.equal(cleanups, 1);
});

test("100 MiB total cap is preserved without buffering the whole response", async () => {
  const value = scan(5), deadline = clock(), body = png(25 * 1024 * 1024);
  let fetches = 0, total = 0, cleanups = 0;
  const fetcher: typeof safeFetch = async (url, options) => { fetches++; assert.equal(options?.maxBytes, body.length); return response(url, body); };
  const reader = zipStream(value, () => { cleanups++; }, { fetcher, scheduleDeadline: deadline.scheduleDeadline }).getReader();
  const tail: Uint8Array[] = [];
  while (true) {
    const item = await reader.read(); if (item.done) break;
    assert.ok(item.value.byteLength <= ZIP_CHUNK_BYTES); total += item.value.byteLength;
    tail.push(item.value); if (tail.length > 8) tail.shift();
  }
  assert.equal(fetches, 4); assert.ok(total > 100 * 1024 * 1024 && total < 100 * 1024 * 1024 + 100_000);
  const metadata = Buffer.concat(tail).toString();
  assert.match(metadata, /"saved": 4/); assert.match(metadata, /ZIP全体の100MiB/); assert.equal(cleanups, 1);
});
