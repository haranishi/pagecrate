import { test } from "node:test";
import assert from "node:assert/strict";
import { apiErrorResponse, DOWNLOAD_BODY_MAX_BYTES } from "../src/lib/api";
import { guardTicketRoute, DEPENDENCY_RETRY_SEC, MAX_DOWNLOAD_TICKETS } from "../src/lib/guard";
import { TICKET_TTL_SECONDS } from "../src/lib/ticket";
import {
  context, downloadRequest, issue, previewRequest, refused,
  DEMO_IMAGE, DEMO_VIDEO, LIVE_IMAGE, LIVE_VIDEO, OPEN_ENV, ORIGIN, OTHER_SECRET, T0, type ContextOptions,
} from "./helpers/guard-fixtures";

const PAUSED_ENV = { ...OPEN_ENV, PAGECRATE_PAUSED: "1" };

test("ticket guard (preview): Origin → ticket → pause → PREVIEW_LIMITER → blocklist, and the earliest failure answers", async () => {
  const good = await issue(LIVE_IMAGE);
  const blockedAsset = await issue({ ...LIVE_IMAGE, url: "https://img.blocked.example/a.png" });
  const blockedPage = await issue({ ...LIVE_IMAGE, pageOrigin: "https://blocked.example" });
  const passing = context();
  const result = await guardTicketRoute(previewRequest(`t=${good}`), "preview", passing.ctx);
  assert.ok(result.ok);
  assert.equal(result.demo, false);
  assert.match(result.clientKey, /^[0-9a-f]{16}$/);
  assert.deepEqual(result.claims.map(claim => [claim.u, claim.k, claim.d]), [[LIVE_IMAGE.url, "image", false]]);
  assert.deepEqual(passing.calls, ["limit:preview"]);
  const cases: Array<{ name: string; query: string; headers?: Record<string, string | null>; options?: ContextOptions; code: string; calls: string[] }> = [
    { name: "cross-site before the ticket", query: "t=forged", headers: { "sec-fetch-site": "cross-site" }, options: { env: PAUSED_ENV }, code: "FORBIDDEN", calls: [] },
    { name: "ticket before the pause", query: "t=forged", options: { env: PAUSED_ENV, limits: { preview: false } }, code: "INVALID_TICKET", calls: [] },
    { name: "pause before the rate limit", query: `t=${blockedAsset}`, options: { env: PAUSED_ENV, limits: { preview: false } }, code: "PAUSED", calls: [] },
    { name: "rate limit before the blocklist", query: `t=${blockedAsset}`, options: { limits: { preview: false } }, code: "RATE_LIMITED", calls: ["limit:preview"] },
    { name: "blocked asset host", query: `t=${blockedAsset}`, code: "BLOCKED_HOST", calls: ["limit:preview"] },
    { name: "blocked page host", query: `t=${blockedPage}`, code: "BLOCKED_HOST", calls: ["limit:preview"] },
  ];
  for (const item of cases) {
    const run = context(item.options);
    assert.equal(refused(await guardTicketRoute(previewRequest(item.query, item.headers), "preview", run.ctx), item.name).code, item.code, item.name);
    assert.deepEqual(run.calls, item.calls, item.name);
  }
});

test("ticket guard: demo tickets skip the pause, closed settings and the blocklist but are still rate limited; a ZIP mixing live tickets is paused", async () => {
  const demo = await issue(DEMO_IMAGE);
  const demoVideo = await issue(DEMO_VIDEO);
  const live = await issue(LIVE_IMAGE);
  const shut: ContextOptions = { env: { PAGECRATE_PUBLIC_ORIGIN: ORIGIN, PAGECRATE_PAUSED: "1", PAGECRATE_DAILY_RENDER_CAP: "0", PAGECRATE_BLOCKED_HOSTS: "pagecrate.example" } };
  const preview = context(shut);
  const shown = await guardTicketRoute(previewRequest(`t=${demo}`), "preview", preview.ctx);
  assert.ok(shown.ok);
  assert.equal(shown.demo, true);
  assert.deepEqual(preview.calls, ["limit:preview"]);
  const zip = context(shut);
  const saved = await guardTicketRoute(downloadRequest({ tickets: [demo, demoVideo] }), "download", zip.ctx);
  assert.ok(saved.ok);
  assert.equal(saved.demo, true);
  assert.deepEqual(zip.calls, ["limit:download"]);
  for (const options of [{ env: PAUSED_ENV }, shut, { env: { ...OPEN_ENV, PAGECRATE_BLOCKED_HOSTS: "not a host/" } }] satisfies ContextOptions[]) {
    const mixed = context(options);
    assert.equal(refused(await guardTicketRoute(downloadRequest({ tickets: [demo, live] }), "download", mixed.ctx)).code, "PAUSED");
    assert.deepEqual(mixed.calls, []);
  }
  assert.equal(refused(await guardTicketRoute(previewRequest(`t=${demo}`), "preview", context({ ...shut, limits: { preview: false } }).ctx)).code, "RATE_LIMITED");
});

test("ticket guard: a mistyped, blank or missing pause value pauses live previews and ZIPs too (the pause fails closed)", async () => {
  const live = await issue(LIVE_IMAGE);
  const withoutPause: NonNullable<ContextOptions["env"]> = { PAGECRATE_PUBLIC_ORIGIN: ORIGIN, PAGECRATE_DAILY_RENDER_CAP: "5", PAGECRATE_BLOCKED_HOSTS: "blocked.example" };
  const envs: Array<[string, NonNullable<ContextOptions["env"]>]> = [
    ...["yes", "on", "off", "no", "paused", "１", "ｔｒｕｅ", "2", ""].map(value => [JSON.stringify(value), { ...OPEN_ENV, PAGECRATE_PAUSED: value }] as [string, NonNullable<ContextOptions["env"]>]),
    ["unset", withoutPause],
  ];
  for (const [name, env] of envs) {
    const preview = context({ env });
    assert.equal(refused(await guardTicketRoute(previewRequest(`t=${live}`), "preview", preview.ctx)).code, "PAUSED", `preview, pause ${name}`);
    assert.deepEqual(preview.calls, [], `preview, pause ${name}`);
    const zip = context({ env });
    assert.equal(refused(await guardTicketRoute(downloadRequest({ tickets: [live] }), "download", zip.ctx)).code, "PAUSED", `ZIP, pause ${name}`);
    assert.deepEqual(zip.calls, [], `ZIP, pause ${name}`);
  }
});

test("ticket guard: previews use PREVIEW_LIMITER and ZIPs DOWNLOAD_LIMITER — never the scan limiter, the bot check or the daily cap", async () => {
  const ticket = await issue(LIVE_IMAGE);
  const others: ContextOptions = { limits: { scan: false, download: false }, bot: { success: false }, reserve: new Error("no daily cap here") };
  const preview = context(others);
  assert.equal((await guardTicketRoute(previewRequest(`t=${ticket}`), "preview", preview.ctx)).ok, true);
  assert.deepEqual(preview.calls, ["limit:preview"]);
  const limitedPreview = refused(await guardTicketRoute(previewRequest(`t=${ticket}`), "preview", context({ limits: { preview: false }, period: 10 }).ctx));
  assert.deepEqual([limitedPreview.code, limitedPreview.retryAfterSec], ["RATE_LIMITED", 10]);
  const zip = context({ limits: { scan: false, preview: false }, bot: { success: false }, reserve: new Error("no daily cap here") });
  assert.equal((await guardTicketRoute(downloadRequest({ tickets: [ticket] }), "download", zip.ctx)).ok, true);
  assert.deepEqual(zip.calls, ["limit:download"]);
  const limitedZip = refused(await guardTicketRoute(downloadRequest({ tickets: [ticket] }), "download", context({ limits: { download: false } }).ctx));
  assert.deepEqual([limitedZip.code, limitedZip.retryAfterSec], ["RATE_LIMITED", 60]);
  assert.equal(apiErrorResponse(limitedZip).headers.get("retry-after"), "60");
});

test("ticket guard: forged or wrong-kind tickets are INVALID_TICKET (400), expired ones EXPIRED (410), and forgery outranks expiry", async () => {
  const image = await issue(LIVE_IMAGE);
  const video = await issue(LIVE_VIDEO);
  const [body, mac] = image.split(".");
  const forged = `${body}.${mac.slice(0, -2)}${mac.endsWith("AA") ? "BA" : "AA"}`;
  const invalid = async (request: Request, route: "preview" | "download", options: ContextOptions = {}) => refused(await guardTicketRoute(request, route, context(options).ctx));
  for (const query of [`t=${forged}`, `t=${video}`, "", "t=", `t=${image}&t=${image}`, "ticket=abc"]) {
    const error = await invalid(previewRequest(query), "preview");
    assert.equal(error.code, "INVALID_TICKET", query.slice(0, 20));
    assert.equal(apiErrorResponse(error).status, 400);
  }
  assert.equal((await guardTicketRoute(downloadRequest({ tickets: [video, image] }), "download", context().ctx)).ok, true);
  const later = { now: T0 + TICKET_TTL_SECONDS * 1000 };
  const expired = await invalid(previewRequest(`t=${image}`), "preview", later);
  assert.equal(expired.code, "EXPIRED");
  assert.equal(apiErrorResponse(expired).status, 410);
  assert.match(expired.message, /もう一度ページを取得/);
  assert.equal((await invalid(downloadRequest({ tickets: [image, forged] }), "download", later)).code, "INVALID_TICKET");
  assert.equal((await invalid(downloadRequest({ tickets: [image, video] }), "download", later)).code, "EXPIRED");
  assert.equal((await invalid(previewRequest(`t=${await issue(LIVE_IMAGE, T0, OTHER_SECRET)}`), "preview")).code, "INVALID_TICKET");
  for (const payload of [{}, { tickets: [] }, { tickets: "x" }, { tickets: [42] }, { ticket: [image] }]) {
    assert.equal((await invalid(downloadRequest(payload), "download")).code, "INVALID_TICKET", JSON.stringify(payload));
  }
  assert.equal((await invalid(downloadRequest("{"), "download")).code, "INVALID_TICKET");
  assert.equal((await invalid(downloadRequest(JSON.stringify({ tickets: [image] }), { "content-type": "text/plain" }), "download")).code, "INVALID_TICKET");
  const tooMany = await invalid(downloadRequest({ tickets: Array(MAX_DOWNLOAD_TICKETS + 1).fill(image) }), "download");
  assert.equal(tooMany.code, "LIMIT_EXCEEDED");
  assert.match(tooMany.message, /50件/);
  assert.equal(apiErrorResponse(tooMany).status, 413);
  // A ticket key that cannot be used means the deployment is not set up: closed, not the user's fault.
  for (const secret of [undefined, "short"]) {
    const run = context({ secret });
    assert.equal(refused(await guardTicketRoute(previewRequest(`t=${image}`), "preview", run.ctx)).code, "PAUSED");
    assert.deepEqual(run.calls, []);
  }
});

test("ticket guard: a GET preview passes with same-origin fetch metadata and no Origin; cross-site or a foreign Origin is refused; a ZIP needs its Origin", async () => {
  const ticket = await issue(LIVE_IMAGE);
  const accepted: Array<Record<string, string | null>> = [{}, { origin: ORIGIN }, { "sec-fetch-site": null }];
  for (const headers of accepted) {
    assert.equal((await guardTicketRoute(previewRequest(`t=${ticket}`, headers), "preview", context().ctx)).ok, true, JSON.stringify(headers));
  }
  const refusedHeaders: Array<Record<string, string | null>> = [{ "sec-fetch-site": "cross-site" }, { origin: "https://evil.example" }, { origin: "null" }, { host: "evil.example" }];
  for (const headers of refusedHeaders) {
    const run = context();
    const error = refused(await guardTicketRoute(previewRequest(`t=${ticket}`, headers), "preview", run.ctx), JSON.stringify(headers));
    assert.equal(error.code, "FORBIDDEN", JSON.stringify(headers));
    assert.equal(apiErrorResponse(error).status, 403);
    assert.deepEqual(run.calls, []);
  }
  assert.equal(refused(await guardTicketRoute(downloadRequest({ tickets: [ticket] }, { origin: null }), "download", context().ctx)).code, "FORBIDDEN");
  assert.equal((await guardTicketRoute(downloadRequest({ tickets: [ticket] }), "download", context().ctx)).ok, true);
  assert.equal(refused(await guardTicketRoute(previewRequest(`t=${ticket}`), "preview", context({ env: { ...OPEN_ENV, PAGECRATE_PUBLIC_ORIGIN: "https://pagecrate.example.com/sub" } }).ctx)).code, "PAUSED");
});

test("ticket guard: a ZIP request of 50 long tickets fits its 512 KiB body limit; a larger body is LIMIT_EXCEEDED before any check", async () => {
  const tickets = await Promise.all(Array.from({ length: MAX_DOWNLOAD_TICKETS }, (_, index) => issue({ ...LIVE_IMAGE, url: `https://cdn.example.net/${"p".repeat(3000)}/${index}.jpg` })));
  const body = JSON.stringify({ tickets });
  assert.ok(body.length > 16_000 && body.length < DOWNLOAD_BODY_MAX_BYTES, `body is ${body.length} bytes`);
  const run = context();
  const result = await guardTicketRoute(downloadRequest(body), "download", run.ctx);
  assert.ok(result.ok);
  assert.equal(result.claims.length, MAX_DOWNLOAD_TICKETS);
  const oversized = context();
  const error = refused(await guardTicketRoute(downloadRequest(JSON.stringify({ tickets: [tickets[0]], pad: "x".repeat(DOWNLOAD_BODY_MAX_BYTES) })), "download", oversized.ctx));
  assert.equal(error.code, "LIMIT_EXCEEDED");
  assert.deepEqual(oversized.calls, []);
});

test("ticket guard: a failing rate limiter closes with BUSY 503 and a 30-second hint", async () => {
  const ticket = await issue(LIVE_IMAGE);
  for (const [request, route] of [[previewRequest(`t=${ticket}`), "preview"], [downloadRequest({ tickets: [ticket] }), "download"]] as const) {
    const error = refused(await guardTicketRoute(request, route, context({ limits: { [route]: new Error("binding down") } }).ctx), route);
    assert.deepEqual([error.code, error.retryAfterSec], ["BUSY", DEPENDENCY_RETRY_SEC], route);
    assert.equal(apiErrorResponse(error).status, 503);
  }
});
