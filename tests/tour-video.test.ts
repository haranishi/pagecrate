import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MAX_TOUR_VIDEO_BYTES, serveTourVideo } from "../src/lib/tour-video";

const origin = "https://pagecrate.example.test";
const path = "/tour/pagecrate-tour.mp4";
const fixture = new TextEncoder().encode("0123456789");
const request = (headers: HeadersInit = {}, method = "GET", target = path) => new Request(`${origin}${target}`, { method, headers });
const source = (body: BodyInit | null = fixture, headers: HeadersInit = {}) => new Response(body, { headers: { "content-type": "video/mp4", "content-length": String(fixture.byteLength), etag: '"fixture-video"', ...headers } });
const responseFor = async (range?: string) => {
  const response = await serveTourVideo(request(range ? { Range: range } : {}), async () => source());
  assert.ok(response); return response;
};

test("only the two exact bundled paths are handled and non-read methods never fetch", async () => {
  let calls = 0;
  const fetchAsset = async () => { calls++; return source(); };
  for (const target of ["/", "/tour/other.mp4", "/tour/pagecrate-tour.mp4/extra", "/tour/pagecrate-tour.ja.vtt", "/tour/pagecrate-tour-poster.webp"]) assert.equal(await serveTourVideo(request({}, "GET", target), fetchAsset), null);
  for (const method of ["POST", "PUT", "DELETE"]) {
    const response = await serveTourVideo(request({}, method), fetchAsset);
    assert.equal(response?.status, 405); assert.equal(response?.headers.get("allow"), "GET, HEAD");
  }
  assert.equal(calls, 0);
});

test("GET returns a full bounded representation with range metadata and strips request secrets/conditions", async () => {
  const response = await serveTourVideo(request({ Cookie: "synthetic=test", Authorization: "synthetic", "If-None-Match": '"old"', "If-Modified-Since": "yesterday" }, "GET", `${path}?synthetic=discard`), async input => {
    assert.equal(input.url, `${origin}${path}`);
    assert.equal(input.method, "GET");
    assert.deepEqual([...input.headers], [["accept-encoding", "identity"]]);
    return source();
  });
  assert.equal(response?.status, 200); assert.equal(await response?.text(), "0123456789");
  assert.equal(response?.headers.get("accept-ranges"), "bytes");
  assert.equal(response?.headers.get("content-length"), "10");
  assert.equal(response?.headers.get("content-range"), null);
  assert.equal(response?.headers.get("etag"), '"fixture-video"');
  assert.equal(response?.headers.get("set-cookie"), null);
});

test("single closed, open-ended and suffix ranges return exact bytes with 206", async () => {
  for (const [range, expected, contentRange] of [
    ["bytes=0-1", "01", "bytes 0-1/10"], ["bytes=3-", "3456789", "bytes 3-9/10"],
    ["bytes=-3", "789", "bytes 7-9/10"], ["bytes=9-99", "9", "bytes 9-9/10"],
    ["bytes=-9999999999999999999999999", "0123456789", "bytes 0-9/10"],
    ["bytes=1-9999999999999999999999999", "123456789", "bytes 1-9/10"],
  ]) {
    const response = await responseFor(range);
    assert.equal(response.status, 206, range); assert.equal(await response.text(), expected);
    assert.equal(response.headers.get("content-range"), contentRange);
    assert.equal(response.headers.get("content-length"), String(expected.length));
  }
});

test("invalid or unsatisfiable byte ranges return 416 with the actual full length", async () => {
  for (const range of ["bytes=10-", "bytes=8-3", "bytes=-0", "bytes=-", "bytes=abc-def", "bytes=9999999999999999999999999-", `bytes=${"1".repeat(129)}-`]) {
    const response = await responseFor(range);
    assert.equal(response.status, 416, range);
    assert.equal(response.headers.get("content-range"), "bytes */10");
    assert.equal(response.headers.get("content-length"), "0");
    assert.equal(await response.text(), "");
  }
  for (const range of ["items=0-1", "bytes=0-1,4-5"]) {
    const ignored = await responseFor(range); assert.equal(ignored.status, 200); assert.equal(await ignored.text(), "0123456789");
  }
});

test("HEAD advertises the full size without reading a body and ignores Range", async () => {
  let read = false, cancelled = false;
  const response = await serveTourVideo(request({ Range: "bytes=0-1" }, "HEAD"), async input => {
    assert.equal(input.method, "HEAD"); assert.equal(input.headers.has("range"), false);
    return source(new ReadableStream({ pull() { read = true; }, cancel() { cancelled = true; } }, { highWaterMark: 0 }));
  });
  assert.equal(response?.status, 200); assert.equal(response?.body, null);
  assert.equal(response?.headers.get("content-length"), "10");
  assert.equal(response?.headers.get("accept-ranges"), "bytes");
  assert.equal(response?.headers.get("content-range"), null);
  assert.equal(read, false); assert.equal(cancelled, true);
});

test("If-Range requires a matching strong ETag and is never forwarded to the asset binding", async () => {
  for (const validator of ['"fixture-video"', '"old-video"', 'W/"fixture-video"', "Sun, 06 Nov 1994 08:49:37 GMT"]) {
    const response = await serveTourVideo(request({ Range: "bytes=1-2", "If-Range": validator }), async input => {
      assert.equal(input.headers.has("range"), false); assert.equal(input.headers.has("if-range"), false); return source();
    });
    assert.equal(response?.status, validator === '"fixture-video"' ? 206 : 200);
    assert.equal(await response?.text(), validator === '"fixture-video"' ? "12" : "0123456789");
  }
});

test("oversized declared and chunked bodies are cancelled before exceeding the one-MiB budget", async () => {
  for (const declared of [true, false]) {
    let cancelled = false, pulls = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(256 * 1024)); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
    const response = await serveTourVideo(request(), async () => new Response(body, { headers: { "Content-Type": "video/mp4", ...(declared ? { "Content-Length": String(MAX_TOUR_VIDEO_BYTES + 1) } : {}) } }));
    assert.equal(response?.status, 502); assert.equal(cancelled, true);
    assert.equal(pulls, declared ? 0 : 5);
  }
});

test("incomplete, wrong-type, encoded, missing and failed asset responses fail closed", async () => {
  for (const fetchAsset of [
    async () => source(fixture, { "content-length": "11" }),
    async () => source(fixture, { "content-type": "text/html" }),
    async () => source(fixture, { "content-encoding": "gzip" }),
    async () => new Response(null, { status: 404 }),
    async () => { throw new Error("synthetic upstream failure"); },
  ]) {
    const response = await serveTourVideo(request(), fetchAsset);
    assert.equal(response?.status, 502); assert.equal(response?.headers.get("cache-control"), "no-store");
  }
});

test("request cancellation cancels a pending asset read without exposing an upstream error", async () => {
  const abort = new AbortController();
  let entered!: () => void, cancelled = false;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const response = serveTourVideo(new Request(`${origin}${path}`, { signal: abort.signal }), async () => source(new ReadableStream({ pull() { entered(); }, cancel() { cancelled = true; } }, { highWaterMark: 0 })));
  await ready; abort.abort();
  assert.equal((await response)?.status, 502); assert.equal(cancelled, true);
});

test("both actual self-owned video files are under one MiB and their prefix/tail ranges preserve originals", async () => {
  for (const extension of ["mp4", "webm"]) {
    const body = await readFile(new URL(`../public/tour/pagecrate-tour.${extension}`, import.meta.url));
    assert.ok(body.byteLength > 0 && body.byteLength <= MAX_TOUR_VIDEO_BYTES);
    for (const range of ["bytes=0-100", "bytes=-101"]) {
      const response = await serveTourVideo(request({ Range: range }, "GET", `/tour/pagecrate-tour.${extension}`), async () => new Response(body, { headers: { "Content-Type": `video/${extension}`, "Content-Length": String(body.byteLength) } }));
      assert.equal(response?.status, 206); assert.equal(response?.headers.get("content-length"), "101");
      assert.deepEqual(new Uint8Array(await response!.arrayBuffer()), new Uint8Array(range === "bytes=-101" ? body.subarray(-101) : body.subarray(0, 101)));
    }
  }
});
