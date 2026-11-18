import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { scanPage } from "../src/lib/scanner";
import type { SafeResponse } from "../src/lib/safe-fetch";
import { launchTestBrowser } from "./helpers/node-scanner";

test("parallel stylesheets are all read within the two-fetch limit", async () => {
  const origin = "https://fixture.example.com";
  const sheets = ["/base.css", "/theme.css", "/gallery.css"];
  const html = sheets.map(path => `<link rel="stylesheet" href="${path}">`).join("") + '<div class="cover"></div>';
  const fetched: string[] = [];
  let active = 0, peak = 0;
  const fetcher = async (url: string): Promise<SafeResponse> => {
    const path = new URL(url).pathname;
    if (path === "/") return { url, status: 200, headers: { "content-type": "text/html" }, body: Buffer.from(html) };
    if (sheets.includes(path)) {
      fetched.push(path);
      active++;
      peak = Math.max(peak, active);
      await delay(150);
      active--;
      const css = path === "/gallery.css" ? '.cover{height:40px;background-image:url("/cover.svg")}' : "";
      return { url, status: 200, headers: { "content-type": "text/css" }, body: Buffer.from(css) };
    }
    return { url, status: 200, headers: { "content-type": "image/svg+xml" }, body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"/>') };
  };
  const result = await scanPage(origin, fetcher, launchTestBrowser);
  assert.deepEqual(fetched.sort(), [...sheets].sort());
  assert.ok(peak <= 2);
  assert.ok(result.assets.some(asset => asset.url === origin + "/cover.svg"));
});
