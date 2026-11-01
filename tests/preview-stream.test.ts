import { test } from "node:test";
import assert from "node:assert/strict";
import { createLimiter, PREVIEW_CONCURRENCY } from "../src/lib/limiter";
import { previewResponse, PREVIEW_MAX_BYTES, PREVIEW_CHUNK_BYTES, PREVIEW_DEADLINE_MS, type PreviewOptions, type PreviewSource } from "../src/lib/preview-stream";
import type { safeFetch } from "../src/lib/safe-fetch";

const live: PreviewSource = { url: "https://fixture.example/image.png", demo: false };
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { resolve, promise }; }
function clock() {
  let callback!: () => void, clears = 0;
  const scheduleDeadline: NonNullable<PreviewOptions["scheduleDeadline"]> = (expire, duration) => { assert.equal(duration, PREVIEW_DEADLINE_MS); callback = expire; return () => { clears++; }; };
  return { scheduleDeadline, expire: () => callback(), clears: () => clears };
}
function png(size = PREVIEW_MAX_BYTES) { const body = Buffer.alloc(size); body.set([137, 80, 78, 71, 13, 10, 26, 10]); return body; }
function fetcher(body: Buffer = png(), type = "image/png", status = 200): typeof safeFetch {
  return async (url, options) => { assert.equal(options?.maxBytes, PREVIEW_MAX_BYTES); return { status, url, body, headers: { "content-type": type } }; };
}

test("two unread previews hold both slots and copy only one small chunk; a third is refused until one ends", async () => {
  const slots = createLimiter(PREVIEW_CONCURRENCY, 3);
  const a = clock(), b = clock(), source = png();
  const first = slots.acquire(), second = slots.acquire();
  assert.ok(first.ok && second.ok);
  const response = await previewResponse(live, first.release, { fetcher: fetcher(source), scheduleDeadline: a.scheduleDeadline });
  const other = await previewResponse(live, second.release, { fetcher: fetcher(), scheduleDeadline: b.scheduleDeadline });
  assert.equal(slots.acquire().ok, false);
  const reader = response.body!.getReader(), chunk = await reader.read();
  assert.equal(chunk.value!.byteLength, PREVIEW_CHUNK_BYTES); assert.notEqual(chunk.value!.buffer, source.buffer);
  assert.equal(slots.active, 2);
  await reader.cancel(); await other.body!.cancel();
  assert.equal(slots.active, 0);
  const next = slots.acquire(); assert.ok(next.ok); next.release();
});

test("preview EOF awaits asynchronous cleanup instead of releasing at Response creation", async () => {
  const deadline = clock(), entered = deferred(), release = deferred(); let cleanups = 0, ended = false;
  const response = await previewResponse(live, async () => { cleanups++; entered.resolve(); await release.promise; }, { fetcher: fetcher(png(100)), scheduleDeadline: deadline.scheduleDeadline });
  const reader = response.body!.getReader(); await reader.read();
  const eof = reader.read().then(result => { ended = true; return result; });
  await entered.promise; assert.equal(ended, false);
  release.resolve(); assert.equal((await eof).done, true);
  assert.equal(cleanups, 1); assert.equal(deadline.clears(), 1);
});

test("preview deadline releases an unread response and an active fetch exactly once", async () => {
  for (const duringFetch of [false, true]) {
    const deadline = clock(), fetching = deferred(); let cleanups = 0, aborted = 0;
    const blocked: typeof safeFetch = async (_url, options) => {
      fetching.resolve(); return new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => { aborted++; reject(new Error("synthetic abort")); }, { once: true }));
    };
    const response = previewResponse(live, () => { cleanups++; }, { fetcher: duringFetch ? blocked : fetcher(), scheduleDeadline: deadline.scheduleDeadline });
    if (duringFetch) {
      const failed = assert.rejects(response, { code: "PREVIEW_TIMEOUT" }); await fetching.promise; deadline.expire(); await failed;
    } else {
      const output = await response; deadline.expire(); await assert.rejects(output.body!.getReader().read(), { code: "PREVIEW_TIMEOUT" });
    }
    deadline.expire(); await Promise.resolve();
    assert.equal(cleanups, 1); assert.equal(aborted, duringFetch ? 1 : 0);
  }
});

test("cancel/deadline/request-abort race waits for one preview cleanup", async () => {
  const deadline = clock(), request = new AbortController(), entered = deferred(), release = deferred(); let cleanups = 0, ended = false;
  const response = await previewResponse(live, async () => { cleanups++; entered.resolve(); await release.promise; }, { fetcher: fetcher(), signal: request.signal, scheduleDeadline: deadline.scheduleDeadline });
  const reader = response.body!.getReader(); await reader.read();
  const cancellation = reader.cancel().then(() => { ended = true; }); deadline.expire(); request.abort();
  await entered.promise; assert.equal(ended, false); release.resolve(); await cancellation;
  assert.equal(cleanups, 1); assert.equal(deadline.clears(), 1);
});

test("preview size failure releases its slot once and the transport receives the 2 MiB cap", async () => {
  const deadline = clock(); let cleanups = 0;
  await assert.rejects(previewResponse(live, () => { cleanups++; }, { fetcher: fetcher(png(PREVIEW_MAX_BYTES + 1)), scheduleDeadline: deadline.scheduleDeadline }), { code: "PREVIEW_LIMIT" });
  assert.equal(cleanups, 1);
  // Two slots of at most 2 MiB each, copied out in 64 KiB chunks, stay far below a Worker's memory.
  assert.ok(PREVIEW_MAX_BYTES * PREVIEW_CONCURRENCY * 2 <= 8 * 1024 * 1024);
});

test("external SVG is refused as PREVIEW_SVG; other answers that are not a matching image are NO_PREVIEW; each releases once", async () => {
  const cases: Array<[typeof safeFetch, string]> = [
    [fetcher(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/svg+xml"), "PREVIEW_SVG"],
    [fetcher(Buffer.from("<svg/>"), "image/svg+xml; charset=utf-8", 404), "NO_PREVIEW"],
    [fetcher(Buffer.from("<html></html>"), "text/html"), "NO_PREVIEW"],
    [fetcher(Buffer.from("#!/bin/sh"), "image/png"), "NO_PREVIEW"],
    [fetcher(png(100), "image/png", 403), "NO_PREVIEW"],
  ];
  for (const [fake, code] of cases) {
    let cleanups = 0;
    await assert.rejects(previewResponse(live, () => { cleanups++; }, { fetcher: fake, scheduleDeadline: clock().scheduleDeadline }), { code }, code);
    assert.equal(cleanups, 1, code);
  }
  const svgError = await previewResponse(live, () => undefined, { fetcher: cases[0][0], scheduleDeadline: clock().scheduleDeadline }).catch((error: unknown) => error);
  assert.equal((svgError as { status?: number }).status, 415);
});

test("a demo preview serves the built-in SVG for its pseudo URL without fetching; other demo URLs have no preview", async () => {
  const mustNotFetch: typeof safeFetch = async () => { throw new Error("demo previews never fetch"); };
  const response = await previewResponse({ url: "https://pagecrate.example/assets/studio-poster.svg", demo: true }, () => undefined, { fetcher: mustNotFetch, scheduleDeadline: clock().scheduleDeadline });
  assert.equal(response.headers.get("content-type"), "image/svg+xml");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; sandbox");
  assert.match(await response.text(), /^<svg[^>]*width="960"/);
  for (const url of ["https://pagecrate.example/assets/motion-study.webm", "https://pagecrate.example/assets/live.m3u8", "https://photos.example.org/a.png"]) {
    await assert.rejects(previewResponse({ url, demo: true }, () => undefined, { fetcher: mustNotFetch, scheduleDeadline: clock().scheduleDeadline }), { code: "NO_PREVIEW" }, url);
  }
  // A live ticket's URL is the only thing fetched.
  const asked: string[] = [];
  await (await previewResponse(live, () => undefined, { fetcher: async (url, options) => { asked.push(url); return fetcher(png(100))(url, options); }, scheduleDeadline: clock().scheduleDeadline })).arrayBuffer();
  assert.deepEqual(asked, [live.url]);
});
