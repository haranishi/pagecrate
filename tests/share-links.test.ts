import { test } from "node:test";
import assert from "node:assert/strict";
import { SHARE_TEXT, shareLinks, shareTarget } from "../src/lib/share-links";

test("share: the shared address is the top page of the origin the page was opened at", () => {
  assert.equal(shareTarget("https://pagecrate.example"), "https://pagecrate.example/");
  assert.equal(shareTarget("http://127.0.0.1:8787"), "http://127.0.0.1:8787/");
  assert.equal(shareTarget("https://pagecrate.example/app?x=1#y"), "https://pagecrate.example/", "only the origin is kept");
  assert.throws(() => shareTarget("not a url"));
});

test("share: X's post screen and LINE's share screen, with every part encoded", () => {
  const links = shareLinks("https://pagecrate.example/");
  assert.equal(links.x, `https://x.com/intent/post?text=${encodeURIComponent(SHARE_TEXT)}&url=https%3A%2F%2Fpagecrate.example%2F`);
  assert.equal(links.line, "https://social-plugins.line.me/lineit/share?url=https%3A%2F%2Fpagecrate.example%2F");
  // Characters that would end or split a parameter stay inside it; the screens read back exactly what was given.
  const tricky = "画像 & 動画?#100% = ok/+";
  const encoded = shareLinks("https://a.example/?q=1&r=2#top", tricky);
  const x = new URL(encoded.x);
  assert.deepEqual([x.origin + x.pathname, [...x.searchParams.keys()]], ["https://x.com/intent/post", ["text", "url"]]);
  assert.equal(x.searchParams.get("text"), tricky);
  assert.equal(x.searchParams.get("url"), "https://a.example/?q=1&r=2#top");
  assert.equal(x.hash, "");
  const line = new URL(encoded.line);
  assert.deepEqual([line.origin + line.pathname, [...line.searchParams.keys()], line.searchParams.get("url")], ["https://social-plugins.line.me/lineit/share", ["url"], "https://a.example/?q=1&r=2#top"]);
  assert.equal(encoded.x.includes(" "), false, "a space is %20, never left raw");
  assert.ok(SHARE_TEXT.includes("PageCrate") && SHARE_TEXT.length <= 100, "short enough for a post with its link");
});
