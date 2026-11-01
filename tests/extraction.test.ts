import { test } from "node:test";
import assert from "node:assert/strict";
import { scanPage, rebaseCss } from "../src/lib/scanner";
import { validateUrl, type SafeResponse } from "../src/lib/safe-fetch";
import { launchTestBrowser } from "./helpers/node-scanner";

test("redirected CSS uses final resource base", () => {
  assert.match(rebaseCss('a{background:url(../img/a.png)} @import "theme.css";', "https://cdn.example.com/css/v1/main.css"), /https:\/\/cdn.example.com\/css\/img\/a.png/);
  assert.match(rebaseCss('@import "theme.css";', "https://cdn.example.com/css/main.css"), /https:\/\/cdn.example.com\/css\/theme.css/);
  assert.throws(() => rebaseCss("a{background:url(a)}".repeat(1500), `https://example.com/${"x".repeat(4000)}/main.css`), { code: "BODY_LIMIT" });
});

test("real Chromium extracts image/srcset/CSS/poster/video/lazy and blocks internal requests", { timeout: 45000 }, async () => {
  const blocked: string[] = [];
  const html = `<!doctype html><html><head><title>Controlled fixture</title><base href="/assets/"><style>.hero{height:400px;background-image:url('background.svg')}body{min-height:4000px}</style></head><body>
    <img src="first.svg" width="100" height="80"><picture><source srcset="large.svg 1200w, small.svg 400w"><img src="fallback.svg"></picture>
    <div class="hero"></div><video poster="poster.svg"><source src="clip.mp4" type="video/mp4"></video><video src="live.m3u8"></video>
    <img src="http://127.0.0.1/private.png"><iframe src="http://169.254.169.254/meta"></iframe>
    <img data-src="lazy.svg"><script>window.addEventListener('scroll',()=>{document.querySelector('[data-src]').src='lazy.svg';setTimeout(()=>{new Image().src='http://127.0.0.1/late-private.png'},500)},{once:true}); new WebSocket('wss://example.com/blocked');</script>
    </body></html>`;
  const transport = async (input: string): Promise<SafeResponse> => {
    try { validateUrl(input); } catch (error) { blocked.push("internal-request"); throw error; }
    const url = new URL(input);
    if (url.pathname === "/start") return { status: 200, headers: { "content-type": "text/html" }, body: Buffer.from(html), url: "https://fixture.example.com/final/page" };
    const mime = url.pathname.endsWith(".svg") ? "image/svg+xml" : url.pathname.endsWith(".mp4") ? "video/mp4" : "application/vnd.apple.mpegurl";
    return { status: 200, headers: { "content-type": mime }, body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"/>'), url: input };
  };
  const result = await scanPage("https://fixture.example.com/start", transport, launchTestBrowser);
  assert.equal(result.truncated, false);
  assert.equal(result.pageUrl, "https://fixture.example.com/final/page");
  for (const name of ["first.svg", "large.svg", "small.svg", "fallback.svg", "background.svg", "poster.svg", "clip.mp4", "lazy.svg"]) assert.ok(result.assets.some(asset => asset.url === `https://fixture.example.com/assets/${name}`), name);
  assert.equal(result.assets.find(asset => asset.name === "live.m3u8")?.kind, "unsupported");
  assert.ok(!result.assets.some(asset => asset.url.includes("127.0.0.1") || asset.url.includes("169.254")));
  assert.ok(blocked.length >= 1);
});
