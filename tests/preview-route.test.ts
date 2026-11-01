import { test } from "node:test";
import assert from "node:assert/strict";
import { BUSY_MESSAGE, createLimiter, PREVIEW_CONCURRENCY, type Limiter } from "../src/lib/limiter";
import { handlePreview, type PreviewRouteDeps } from "../src/lib/preview-api";
import { PREVIEW_DEADLINE_MS } from "../src/lib/preview-stream";
import { TICKET_TTL_SECONDS } from "../src/lib/ticket";
import { capturingConsole, fakeSite, png, type FakeRoute } from "./helpers/fake-site";
import { context, issue, previewRequest, DEMO_IMAGE, DEMO_VIDEO, IP, LIVE_IMAGE, LIVE_VIDEO, OPEN_ENV, T0, type ContextOptions } from "./helpers/guard-fixtures";

const IMAGE = png(3000);

function harness(options: { readonly context?: ContextOptions; readonly routes?: Record<string, FakeRoute>; readonly limiter?: Limiter } = {}) {
  const run = context(options.context);
  const site = fakeSite(options.routes ?? { [LIVE_IMAGE.url]: { headers: { "content-type": "image/png" }, body: IMAGE } });
  const limiter = options.limiter ?? createLimiter(PREVIEW_CONCURRENCY, 3);
  const deps: PreviewRouteDeps = { context: () => run.ctx, createFetcher: site.createFetcher, limiter, previewOptions: { scheduleDeadline: (_expire, milliseconds) => { assert.equal(milliseconds, PREVIEW_DEADLINE_MS); return () => undefined; } } };
  return { deps, calls: run.calls, site, limiter };
}
async function codeOf(response: Response): Promise<[number, string]> {
  return [response.status, (await response.json() as { code: string }).code];
}

test("preview API: a live image ticket shows the image from the ticket's URL only, with no-store and nosniff, after PREVIEW_LIMITER", async () => {
  const run = harness();
  const response = await handlePreview(previewRequest(`t=${await issue(LIVE_IMAGE)}`), run.deps);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), IMAGE);
  assert.deepEqual(run.site.fetched, [LIVE_IMAGE.url]);
  assert.deepEqual(run.calls, ["limit:preview"]);
  assert.equal(run.limiter.active, 0);
});

test("preview API: a demo ticket shows the built-in SVG without any fetch, even while live fetching is paused", async () => {
  const run = harness({ context: { env: { ...OPEN_ENV, PAGECRATE_PAUSED: "1" } } });
  const response = await handlePreview(previewRequest(`t=${await issue(DEMO_IMAGE)}`), run.deps);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/svg+xml");
  assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; sandbox");
  assert.match(await response.text(), /ORIGINAL DEMO ARTWORK/);
  assert.equal(run.site.created(), 0);
  // A demo ticket for a URL outside the built-in images is refused as an invalid ticket.
  const stranger = await issue({ ...DEMO_IMAGE, url: "https://pagecrate.example/assets/not-built-in.png" });
  assert.deepEqual(await codeOf(await handlePreview(previewRequest(`t=${stranger}`), harness().deps)), [400, "INVALID_TICKET"]);
});

test("preview API: external SVG is refused with 415 UNSUPPORTED_PREVIEW, and an answer that is not an image is 415 too", async () => {
  const svgUrl = "https://cdn.example.net/photos/vector.svg";
  const run = harness({ routes: { [svgUrl]: { headers: { "content-type": "image/svg+xml" }, body: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") }, [LIVE_IMAGE.url]: { headers: { "content-type": "text/html" }, body: Buffer.from("<html>") } } });
  const svg = await handlePreview(previewRequest(`t=${await issue({ ...LIVE_IMAGE, url: svgUrl })}`), run.deps);
  const svgBody = await svg.json() as { code: string; message: string };
  assert.deepEqual([svg.status, svgBody.code], [415, "UNSUPPORTED_PREVIEW"]);
  assert.match(svgBody.message, /SVG/);
  assert.equal(svg.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await codeOf(await handlePreview(previewRequest(`t=${await issue(LIVE_IMAGE)}`), run.deps)), [415, "UNSUPPORTED_PREVIEW"]);
  assert.equal(run.limiter.active, 0);
});

test("preview API: an expired ticket is 410, a forged, malformed, missing or video ticket is 400 — before any slot or fetch", async () => {
  const ticket = await issue(LIVE_IMAGE);
  const expired = harness({ context: { now: T0 + TICKET_TTL_SECONDS * 1000 } });
  const answer = await handlePreview(previewRequest(`t=${ticket}`), expired.deps);
  const body = await answer.json() as { code: string; message: string };
  assert.deepEqual([answer.status, body.code], [410, "EXPIRED"]);
  assert.match(body.message, /もう一度ページを取得/);
  const [payload, mac] = ticket.split(".");
  for (const query of [`t=${payload}.${mac.slice(0, -2)}${mac.endsWith("AA") ? "BA" : "AA"}`, "t=not-a-ticket", "", `t=${await issue(LIVE_VIDEO)}`, `t=${await issue(DEMO_VIDEO)}`]) {
    const run = harness();
    assert.deepEqual(await codeOf(await handlePreview(previewRequest(query), run.deps)), [400, "INVALID_TICKET"], query.slice(0, 12));
    assert.deepEqual([run.site.created(), run.limiter.active], [0, 0]);
  }
  assert.equal(expired.site.created(), 0);
});

test("preview API: a third concurrent preview is BUSY (503, Retry-After 3) without fetching; a slot frees when a preview ends", async () => {
  const limiter = createLimiter(PREVIEW_CONCURRENCY, 3);
  const run = harness({ limiter });
  const ticket = await issue(LIVE_IMAGE);
  const first = await handlePreview(previewRequest(`t=${ticket}`), run.deps);
  const second = await handlePreview(previewRequest(`t=${ticket}`), run.deps);
  assert.deepEqual([first.status, second.status, limiter.active], [200, 200, 2]);
  const fetchedBefore = run.site.fetched.length;
  const third = await handlePreview(previewRequest(`t=${ticket}`), run.deps);
  const body = await third.json() as { code: string; message: string; retryAfterSec: number };
  assert.deepEqual([third.status, third.headers.get("retry-after"), body.code, body.message, body.retryAfterSec], [503, "3", "BUSY", BUSY_MESSAGE, 3]);
  assert.equal(run.site.fetched.length, fetchedBefore);
  await first.body!.cancel();
  assert.equal(limiter.active, 1);
  const fourth = await handlePreview(previewRequest(`t=${ticket}`), run.deps);
  assert.equal(fourth.status, 200);
  await second.arrayBuffer(); await fourth.arrayBuffer();
  assert.equal(limiter.active, 0);
});

test("preview API: a blocked host is 403 — whether the ticket's host is blocked now or a redirect leads there — and an internal redirect is 422", async () => {
  const blockedNow = harness({ context: { env: { ...OPEN_ENV, PAGECRATE_BLOCKED_HOSTS: "cdn.example.net" } } });
  assert.deepEqual(await codeOf(await handlePreview(previewRequest(`t=${await issue(LIVE_IMAGE)}`), blockedNow.deps)), [403, "BLOCKED_HOST"]);
  assert.equal(blockedNow.site.created(), 0);
  const redirected = harness({ routes: { [LIVE_IMAGE.url]: { location: "https://img.blocked.example/a.png" } } });
  assert.deepEqual(await codeOf(await handlePreview(previewRequest(`t=${await issue(LIVE_IMAGE)}`), redirected.deps)), [403, "BLOCKED_HOST"]);
  assert.deepEqual(redirected.site.fetched, [LIVE_IMAGE.url]);
  assert.equal(redirected.site.resolved.includes("img.blocked.example"), false);
  assert.equal(redirected.limiter.active, 0);
  const internal = harness({ routes: { [LIVE_IMAGE.url]: { location: "http://[::1]/a.png" } } });
  assert.deepEqual(await codeOf(await handlePreview(previewRequest(`t=${await issue(LIVE_IMAGE)}`), internal.deps)), [422, "PRIVATE_ADDRESS"]);
});

test("preview API: an unreadable request context closes as BUSY; nothing is logged and no error body names the URL, the ticket or the address", async () => {
  const site = fakeSite({});
  const noContext = await handlePreview(previewRequest(`t=${await issue(LIVE_IMAGE)}`), { context: () => { throw new Error("no Cloudflare context"); }, createFetcher: site.createFetcher, limiter: createLimiter(2, 3) });
  assert.deepEqual([noContext.status, noContext.headers.get("retry-after")], [503, "30"]);
  const ticket = await issue(LIVE_IMAGE);
  const bodies: string[] = [];
  const printed = await capturingConsole(async () => {
    for (const run of [harness({ routes: { [LIVE_IMAGE.url]: { location: "https://img.blocked.example/a.png" } } }), harness({ routes: {} }), harness({ context: { limits: { preview: false } } })]) {
      const response = await handlePreview(previewRequest(`t=${ticket}`), run.deps);
      bodies.push(await response.text());
    }
  });
  assert.deepEqual(printed, []);
  for (const body of bodies) for (const secret of [LIVE_IMAGE.url, "cdn.example.net", "blocked.example", ticket, IP]) assert.equal(body.includes(secret), false, body.slice(0, 60));
});
