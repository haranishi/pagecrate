import { test, expect, type Page } from "@playwright/test";
import { SHARE_TEXT, SHARE_TITLE, shareLinks } from "../../src/lib/share-links";
import { BASE_URL, watchPage } from "./support";

// tasks.md 4.7: four ways to share (X, LINE, the device's share sheet, copying the link) and OGP with canonical.
// Nothing is loaded from X or LINE: their links are plain links that open only when pressed.
const ORIGIN = new URL(BASE_URL).origin;
const SHARED = `${ORIGIN}/`;
const PAGES = ["/", "/demo", "/app"] as const;
/** The note under the buttons names only what the browser offers. */
const NOTE_WITH_SHARE_SHEET = "Instagram や YouTube には、端末の共有かリンクのコピーを使ってください。";
const NOTE_WITHOUT_SHARE_SHEET = "Instagram や YouTube には、リンクのコピーを使ってください。";

function shareSection(page: Page) {
  return page.getByRole("region", { name: "PageCrate を共有する" });
}

test("share links: X and LINE open their own share screens for this origin, in a new tab, without a referrer", async ({ page }) => {
  const watch = await watchPage(page);
  const expected = shareLinks(SHARED);
  for (const path of PAGES) {
    await page.goto(path);
    const section = shareSection(page);
    await expect(section, path).toHaveCount(1);
    const x = section.getByRole("link", { name: /X で共有/ });
    const line = section.getByRole("link", { name: /LINE で送る/ });
    await expect(x).toHaveAttribute("href", expected.x);
    await expect(line).toHaveAttribute("href", expected.line);
    for (const link of [x, line]) {
      await expect(link).toHaveAttribute("target", "_blank");
      expect((await link.getAttribute("rel"))?.split(/\s+/).sort()).toEqual(["noopener", "noreferrer"]);
      await expect(link).toContainText("（新しいタブで開きます）");
    }
    const xUrl = new URL(expected.x);
    expect([xUrl.searchParams.get("text"), xUrl.searchParams.get("url")]).toEqual([SHARE_TEXT, SHARED]);
    const canShare = await page.evaluate(() => typeof navigator.share === "function");
    await expect(section).toContainText(canShare ? NOTE_WITH_SHARE_SHEET : NOTE_WITHOUT_SHARE_SHEET);
    // Loading a page asks nothing of another origin, and prepares no connection to one.
    await expect(page.locator("link[rel=preconnect], link[rel=dns-prefetch]")).toHaveCount(0);
  }
  expect(watch.external).toEqual([]);
});

test("device share: the button shows only where navigator.share exists, and passes the top page", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    (window as unknown as { __shared: unknown[] }).__shared = calls;
    Object.defineProperty(Navigator.prototype, "share", { configurable: true, value: async (data: unknown) => { calls.push(data); } });
  });
  await page.goto("/");
  const section = shareSection(page);
  await expect(section).toContainText(NOTE_WITH_SHARE_SHEET);
  await section.getByRole("button", { name: "端末の共有" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared)).toEqual([{ title: SHARE_TITLE, text: SHARE_TEXT, url: SHARED }]);
  await expect(section.getByRole("status")).toHaveText("");
});

test("device share: without navigator.share there is no button for it", async ({ page }) => {
  await page.addInitScript(() => { Reflect.deleteProperty(Navigator.prototype, "share"); });
  for (const path of PAGES) {
    await page.goto(path);
    await expect(shareSection(page).getByRole("link", { name: /X で共有/ })).toHaveAttribute("href", /x\.com/);
    await expect(shareSection(page).getByRole("button", { name: "端末の共有" }), path).toHaveCount(0);
    await expect(shareSection(page).getByRole("button", { name: "リンクをコピー" })).toBeVisible();
    await expect(shareSection(page)).toContainText(NOTE_WITHOUT_SHARE_SHEET);
    await expect(shareSection(page)).not.toContainText("端末の共有");
  }
});

test("copy link: the top page's address is copied and the result is announced; a refusal says what to do", async ({ page }) => {
  await page.addInitScript(() => {
    const state = { copied: [] as string[], refuse: false };
    (window as unknown as { __clipboard: typeof state }).__clipboard = state;
    Object.defineProperty(Navigator.prototype, "clipboard", { configurable: true, get: () => ({
      writeText: async (text: string) => { if (state.refuse) throw new DOMException("denied", "NotAllowedError"); state.copied.push(text); },
    }) });
  });
  await page.goto("/app");
  const section = shareSection(page);
  await section.getByRole("button", { name: "リンクをコピー" }).click();
  await expect(section.getByRole("status")).toHaveText("リンクをコピーしました。");
  expect(await page.evaluate(() => (window as unknown as { __clipboard: { copied: string[] } }).__clipboard.copied)).toEqual([SHARED]);
  await page.evaluate(() => { (window as unknown as { __clipboard: { refuse: boolean } }).__clipboard.refuse = true; });
  await section.getByRole("button", { name: "リンクをコピー" }).click();
  await expect(section.getByRole("status")).toHaveText("コピーできませんでした。ブラウザーのアドレス欄から、URLをコピーしてください。");
});

test("OGP: / and /app carry og:title, og:description, an absolute og:image and canonical, and the image is a 1200×630 PNG", async ({ page, request }) => {
  for (const [path, own] of [["/", ORIGIN], ["/app", `${ORIGIN}/app`]] as const) {
    await page.goto(path);
    const content = (selector: string) => page.locator(selector).first().getAttribute("content");
    expect(await content('meta[property="og:title"]'), path).toBe("PageCrate — ページの画像と動画を、ひとつの ZIP に。");
    expect(await content('meta[property="og:description"]')).toMatch(/ログインも登録も要りません/);
    expect(await content('meta[property="og:image"]')).toBe(`${ORIGIN}/og.png`);
    expect([await content('meta[property="og:image:width"]'), await content('meta[property="og:image:height"]')]).toEqual(["1200", "630"]);
    expect(await content('meta[property="og:image:alt"]')).toBeTruthy();
    expect(await content('meta[property="og:locale"]')).toBe("ja_JP");
    expect(await content('meta[property="og:type"]')).toBe("website");
    expect(await content('meta[name="twitter:card"]')).toBe("summary_large_image");
    expect(await content('meta[name="robots"]')).toBe("noindex, nofollow");
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical?.replace(/\/$/, ""), path).toBe(own);
    expect((await content('meta[property="og:url"]'))?.replace(/\/$/, "")).toBe(own);
    // A link preview crawler gets the tags in the HTML head itself.
    const html = await (await request.get(path, { headers: { "User-Agent": "Twitterbot/1.0" } })).text();
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).toContain(`<meta property="og:image" content="${ORIGIN}/og.png"/>`);
    expect(head).toMatch(new RegExp(`<link rel="canonical" href="${own.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?"/>`));
  }
  const image = await request.get("/og.png");
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");
  const body = await image.body();
  expect([...body.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect([body.readUInt32BE(16), body.readUInt32BE(20)]).toEqual([1200, 630]);
});
