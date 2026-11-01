import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { POLICY_VERSION } from "../../src/lib/policy";
import { delay, DEMO_BUTTON, liveScan, open, PAGE_URL, PAUSE_WORDS, PREVIEW, PREVIEW_PNG, replaceApi, RIGHTS_NOTE, scanPage, zipWith } from "./support";

// The workspace (tasks.md 4.4) on the Workers preview: the demo runs on the real API; a live page is never fetched,
// its scan, previews and ZIP are replaced with page.route. Every test starts as a visitor who has confirmed the policy
// (support.ts open), with the fake bot check: a page scan carries "fake-token-N".

test("demo on the real API: scan, filter, previews two at a time, select, and a ZIP holding the image and the video", async ({ page, context }) => {
  const previewStatuses: number[] = [];
  page.on("response", response => { if (PREVIEW.test(response.url())) previewStatuses.push(response.status()); });
  await page.setViewportSize({ width: 1280, height: 1400 });
  await open(page, "/demo");
  await page.getByRole("button", { name: "デモを始める", exact: true }).click();
  await expect(page.getByRole("heading", { name: /見つかった素材/ })).toBeVisible();
  await expect(page.locator(".asset-card")).toHaveCount(7);
  await expect(page.getByText("取得元：PageCrate デモ（内蔵サンプル）")).toBeVisible();
  await page.locator(".asset-grid").scrollIntoViewIfNeeded();
  await expect(page.locator('[data-preview="loaded"]')).toHaveCount(5);
  const poster = page.getByRole("img", { name: "studio-poster.svg のプレビュー" });
  await expect(poster).toHaveJSProperty("naturalWidth", 960);
  expect(await poster.getAttribute("src")).toMatch(/^blob:/);
  expect(previewStatuses).toEqual([200, 200, 200, 200, 200]);
  await expect(page.getByRole("checkbox", { name: "live.m3u8 を選択" })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "studio-poster.svg を選択" }).check();
  await page.getByRole("button", { name: /^動画\s*1$/ }).click();
  await expect(page.locator(".asset-card")).toHaveCount(1);
  await expect(page.getByText("うち1点は絞り込みで非表示")).toBeVisible();
  await page.getByRole("checkbox", { name: "motion-study.webm を選択" }).check();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /ZIPで保存/ }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("pagecrate-demo.zip");
  const archive = unzipSync(new Uint8Array(await readFile((await download.path())!)));
  expect(Object.keys(archive).sort()).toEqual(["README.txt", "image-demo-image-0.svg", "manifest.json", "video-demo-video.webm"]);
  const manifest = JSON.parse(strFromU8(archive["manifest.json"]));
  expect([manifest.requested, manifest.saved]).toEqual([2, 2]);
  expect(manifest.files.map((file: { mime: string }) => file.mime).sort()).toEqual(["image/svg+xml", "video/webm"]);
  await expect(page.getByText("2/2点をZIPに保存")).toBeVisible();
  await page.getByRole("button", { name: "すべて解除" }).click();
  await expect(page.getByRole("complementary", { name: "選択した素材を保存" })).toHaveCount(0);
  expect(await context.cookies()).toEqual([]);
});

test("a live scan with replaced answers: URL then button, filter, previews, and the save sends only tickets", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  const scan = liveScan();
  const sent = await replaceApi(page, [scan]);
  await open(page, "/app");
  // This preview is open: no pause note (paused.spec covers a paused site).
  await expect(page.locator("body")).not.toContainText(PAUSE_WORDS);
  await expect(page.locator("#rights-note")).toHaveText(RIGHTS_NOTE);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await scanPage(page);
  await expect(page.locator(".asset-card")).toHaveCount(scan.assets.length);
  expect(sent.scan).toEqual([{ url: PAGE_URL, turnstileToken: "fake-token-1" }]);
  await expect(page.getByText("取得元：example.com")).toBeVisible();
  await expect(page.getByText(/\d{2}:\d{2} まで保存できます/)).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(7);
  for (const name of ["refused.png", "live.m3u8"]) await expect(page.getByRole("checkbox", { name: `${name} を選択` })).toHaveCount(0);
  await expect(page.getByText("このサイトは、運営者の設定により取得できません。")).toBeVisible();
  await page.locator(".asset-grid").scrollIntoViewIfNeeded();
  await expect(page.getByRole("img", { name: "photo-1.png のプレビュー" })).toHaveJSProperty("naturalWidth", 64);
  await page.getByRole("searchbox").fill("photo-2");
  await expect(page.locator(".asset-card")).toHaveCount(1);
  await page.getByRole("checkbox", { name: "photo-2.png を選択" }).check();
  await page.getByRole("button", { name: "絞り込みを解除", exact: true }).click();
  await page.getByRole("combobox", { name: "最小幅で絞り込む" }).selectOption("1000");
  await expect(page.locator(".asset-card")).toHaveCount(3);
  await page.getByRole("combobox", { name: "最小幅で絞り込む" }).selectOption("");
  await page.getByRole("checkbox", { name: "clip.mp4 を選択" }).check();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /ZIPで保存/ }).click();
  expect((await pending).suggestedFilename()).toBe("pagecrate-assets.zip");
  expect(sent.download).toEqual([{ tickets: ["ticket-img1", "ticket-clip"] }]);
  await expect(page.getByText("2/2点をZIPに保存")).toBeVisible();
  expect(sent.preview.length).toBeGreaterThan(0);
  expect(sent.preview.every(ticket => /^ticket-img\d$/.test(ticket))).toBe(true);
});

test("previews: two 503 answers, then success; every preview shows and no more than two are ever in flight", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  let inFlight = 0;
  let maxInFlight = 0;
  const answers: number[] = [];
  await page.route("**/api/scan", route => route.fulfill({ json: liveScan() }));
  await page.route(PREVIEW, async route => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await delay(150);
    inFlight -= 1;
    if (answers.length < 2) {
      answers.push(503);
      return route.fulfill({ status: 503, headers: { "Retry-After": "1" }, json: { code: "BUSY", message: "混み合っています。", retryAfterSec: 1 } });
    }
    answers.push(200);
    return route.fulfill({ contentType: "image/png", body: PREVIEW_PNG });
  });
  await open(page, "/app");
  await scanPage(page);
  await page.locator(".asset-grid").scrollIntoViewIfNeeded();
  await expect(page.locator('[data-preview="loaded"]')).toHaveCount(6, { timeout: 15_000 });
  expect(answers.slice(0, 2)).toEqual([503, 503]);
  expect(answers.filter(status => status === 200)).toHaveLength(6);
  expect(maxInFlight).toBe(2);
});

test("an expired result keeps the list, stops previews and saving, and gets the same page again in place", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  const expired = liveScan({ expiresInMs: -1_000 });
  const sent = await replaceApi(page, [expired, liveScan()]);
  await open(page, "/app");
  await scanPage(page);
  await expect(page.locator(".asset-card")).toHaveCount(expired.assets.length);
  const band = page.locator(".status-band");
  await expect(band.getByText("取得から30分が過ぎました", { exact: true })).toBeVisible();
  await expect(page.locator(".expires-label")).toHaveText("保存期限が切れました");
  await page.locator(".asset-grid").scrollIntoViewIfNeeded();
  await expect(page.locator('[data-preview="expired"]').first()).toBeVisible();
  await expect(page.getByText("期限切れのため表示できません").first()).toBeVisible();
  for (const checkbox of await page.getByRole("checkbox").all()) await expect(checkbox).toBeDisabled();
  await expect(page.getByRole("button", { name: "表示中を選択" })).toBeDisabled();
  expect(sent.preview).toEqual([]);
  await page.getByLabel("素材を集めたいページのURL", { exact: true }).fill("");
  await band.getByRole("button", { name: "もう一度取得" }).click();
  await expect(band.getByText("取得から30分が過ぎました", { exact: true })).toHaveCount(0);
  // A page scan waits for a new bot-check token first.
  await expect.poll(() => sent.scan.length).toBe(2);
  expect(sent.scan).toEqual([{ url: PAGE_URL, turnstileToken: "fake-token-1" }, { url: PAGE_URL, turnstileToken: "fake-token-2" }]);
  await expect(page.getByRole("checkbox", { name: "photo-1.png を選択" })).toBeEnabled();
});

test("a save answered 410 counts as expired: saving stops and 'もう一度取得' replaces the save button", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  const sent = await replaceApi(page, [liveScan(), liveScan()]);
  await page.route("**/api/download", route => {
    sent.download.push(route.request().postDataJSON());
    return route.fulfill({ status: 410, json: { code: "EXPIRED", message: "取得から30分が過ぎたため、この結果は使えません。もう一度ページを取得してください。" } });
  });
  await open(page, "/app");
  await scanPage(page);
  await page.getByRole("checkbox", { name: "photo-1.png を選択" }).check();
  await page.getByRole("button", { name: /ZIPで保存/ }).click();
  const problem = page.getByRole("group", { name: "取得から30分が過ぎました" });
  await expect(problem).toBeFocused();
  await expect(problem).toContainText("取得から30分が過ぎたため");
  const bar = page.getByRole("complementary", { name: "選択した素材を保存" });
  await expect(bar.getByRole("button", { name: /ZIPで保存/ })).toHaveCount(0);
  await expect(bar).toContainText("保存期限が切れました");
  await expect(page.getByRole("checkbox", { name: "photo-2.png を選択" })).toBeDisabled();
  await bar.getByRole("button", { name: "もう一度取得" }).click();
  await expect(page.getByRole("checkbox", { name: "photo-2.png を選択" })).toBeEnabled();
  expect(sent.scan).toHaveLength(2);
  expect(sent.download).toHaveLength(1);
});

test("a preview answered 410 shows the card as expired and the band offers 'もう一度取得'", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  await replaceApi(page, [liveScan()]);
  await page.route(PREVIEW, route => route.fulfill({ status: 410, json: { code: "EXPIRED", message: "期限切れです。" } }));
  await open(page, "/app");
  await scanPage(page);
  await page.locator(".asset-grid").scrollIntoViewIfNeeded();
  await expect(page.locator('[data-preview="expired"]')).toHaveCount(6);
  await expect(page.locator(".status-band").getByRole("button", { name: "もう一度取得" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "clip.mp4 を選択" })).toBeDisabled();
});

test("a partly failed ZIP reports the saved and failed counts, with the reason for each", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  await replaceApi(page, [liveScan()], zipWith({ requested: 2, saved: 1, files: [
    { id: "img0", status: "saved" }, { id: "clip", status: "failed", reason: "取得先がHTTP 403を返しました。" },
  ] }));
  await open(page, "/app");
  await scanPage(page);
  await page.getByRole("checkbox", { name: "photo-1.png を選択" }).check();
  await page.getByRole("checkbox", { name: "clip.mp4 を選択" }).check();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /ZIPで保存/ }).click();
  await pending;
  await expect(page.getByText("2点中、1点をZIPに保存しました", { exact: true })).toBeVisible();
  await expect(page.getByText("clip.mp4：取得先がHTTP 403を返しました。")).toBeVisible();
  const bar = page.getByRole("complementary", { name: "選択した素材を保存" });
  await expect(bar).toContainText("1/2点をZIPに保存");
  await bar.getByRole("link", { name: "未取得の詳細" }).click();
  await expect(page.locator("#download-report")).toBeFocused();
});

test("a refused scan keeps the previous result and selection, waits out the server's seconds, then retries", async ({ page }) => {
  await open(page, "/app");
  await page.getByRole("button", { name: DEMO_BUTTON, exact: true }).click();
  await expect(page.locator(".asset-card")).toHaveCount(7);
  await page.getByRole("checkbox", { name: "studio-poster.svg を選択" }).check();
  let refused = 0;
  await page.route("**/api/scan", route => {
    refused += 1;
    return route.fulfill({ status: 503, headers: { "Retry-After": "2" }, json: { code: "BUSY", message: "混み合っています。少し待ってから、もう一度お試しください。", retryAfterSec: 2 } });
  });
  await page.locator(".collection-actions").getByRole("button", { name: "もう一度取得" }).click();
  const problem = page.getByRole("group", { name: "混み合っています" });
  await expect(problem).toBeFocused();
  await expect(problem).toContainText("混み合っています。少し待ってから");
  await expect(problem).toContainText("前回の取得結果と選択は、そのまま残しています。");
  await expect(problem).toContainText(/あと[12]秒ほどで、もう一度試せます。/);
  const retry = problem.getByRole("button", { name: "もう一度試す" });
  await expect(retry).toBeDisabled();
  await expect(page.locator(".asset-card")).toHaveCount(7);
  await expect(page.getByRole("checkbox", { name: "studio-poster.svg を選択" })).toBeChecked();
  await expect(retry).toBeEnabled({ timeout: 4_000 });
  await retry.click();
  await expect.poll(() => refused).toBe(2);
  await page.unroute("**/api/scan");
  await expect(page.getByRole("group", { name: "混み合っています" }).getByRole("button", { name: "もう一度試す" })).toBeEnabled({ timeout: 4_000 });
  await page.getByRole("group", { name: "混み合っています" }).getByRole("button", { name: "もう一度試す" }).click();
  await expect(page.getByText("7点の素材が見つかりました。")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "studio-poster.svg を選択" })).not.toBeChecked();
});

test("URL then button: nothing is sent until the URL is a public page address, and the keyboard alone completes a save", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  const sent = await replaceApi(page, [liveScan({ images: 2 })], zipWith({ requested: 1, saved: 1, files: [] }));
  await open(page, "/app");
  const input = page.getByLabel("素材を集めたいページのURL", { exact: true });
  const button = page.getByRole("button", { name: "素材を見つける", exact: true });
  const help = page.locator("#url-help");
  await expect(button).toBeEnabled();
  await button.click();
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(help).toHaveText("素材を集めたいページのURLを入力してください。");
  for (const invalid of ["example.com", "ftp://example.com/file", "https://user:synthetic@example.test/"]) {
    await input.fill(invalid);
    await button.click();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(help).toContainText("https:// または http://");
  }
  expect(sent.scan).toEqual([]);
  await input.fill(PAGE_URL);
  await expect(input).toHaveAttribute("aria-invalid", "false");
  await expect(input).toHaveAttribute("aria-describedby", "url-help rights-note");
  // The rights note follows the field in reading order, before the button.
  expect(await page.locator("#rights-note").evaluate(note => Boolean(document.getElementById("page-url")!.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING)
    && Boolean(note.compareDocumentPosition(document.querySelector(".scan-form button[type=submit]")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await input.press("Enter");
  await expect(page.locator(".asset-card")).toHaveCount(5);
  expect(sent.scan).toEqual([{ url: PAGE_URL, turnstileToken: "fake-token-1" }]);
  const checkbox = page.getByRole("checkbox", { name: "photo-1.png を選択" });
  for (let step = 0; step < 40 && !(await checkbox.evaluate(element => element === document.activeElement)); step++) await page.keyboard.press("Tab");
  await expect(checkbox).toBeFocused();
  await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked();
  const save = page.getByRole("button", { name: /ZIPで保存/ });
  for (let step = 0; step < 80 && !(await save.evaluate(element => element === document.activeElement)); step++) await page.keyboard.press("Tab");
  await expect(save).toBeFocused();
  const pending = page.waitForEvent("download");
  await page.keyboard.press("Enter");
  await pending;
  expect(sent.download).toEqual([{ tickets: ["ticket-img0"] }]);
});

test("API: another Origin or none is refused, and an arbitrary preview ticket is rejected", async ({ request }) => {
  const foreign = await request.post("/api/scan", { headers: { Origin: "https://foreign.example" }, data: { demo: true } });
  expect(foreign.status()).toBe(403);
  expect(await foreign.json()).toMatchObject({ code: "FORBIDDEN" });
  const noOrigin = await request.post("/api/scan", { data: { demo: true } });
  expect(noOrigin.status()).toBe(403);
  const unknown = await request.get("/api/preview?t=arbitrary");
  expect(unknown.status()).toBe(400);
  expect(await unknown.json()).toMatchObject({ code: "INVALID_TICKET" });
});

test("documents: no sideways scrolling and no accessibility violations", async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/terms", "/privacy", "/cookies"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations;
      expect(violations.map(item => ({ path, id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
    }
  }
});

test("documents: Cloudflare's page on Turnstile opens in a new tab without a referrer, and the version shown is the current one", async ({ page }) => {
  await page.goto("/privacy");
  const link = page.getByRole("link", { name: /^Cloudflare の Turnstile のプライバシーに関する案内/ });
  await expect(link).toHaveAttribute("href", "https://www.cloudflare.com/turnstile-privacy-policy/");
  await expect(link).toHaveAttribute("target", "_blank");
  expect((await link.getAttribute("rel"))?.split(/\s+/).sort()).toEqual(["noopener", "noreferrer"]);
  await expect(link).toContainText("（新しいタブで開きます）");
  await expect(page.getByText(`文書版 ${POLICY_VERSION}`, { exact: false })).toBeVisible();
});

for (const width of [390, 768, 1440]) {
  test(`layout, keyboard and accessibility at ${width}px`, async ({ page }) => {
    const height = width === 390 ? 844 : 1000;
    await page.setViewportSize({ width, height });
    await open(page, "/app");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "メインコンテンツへ" })).toBeFocused();
    // The field, the rights note and the main button fit on the first screen, without scrolling (design-ux.md).
    for (const target of [page.getByRole("button", { name: "素材を見つける", exact: true }), page.locator("#rights-note")]) {
      const box = await target.boundingBox();
      expect(box && box.y + box.height <= height).toBe(true);
    }
    await expect(page.getByRole("link", { name: /ログイン|アカウント/ })).toHaveCount(0);
    await expect(page.getByText("PRIVATE PILOT")).toHaveCount(0);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.map(item => item.id)).toEqual([]);
    // Capture the settled page, not the focused skip link.
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await page.screenshot({ path: `.agent-harness/evidence/impl-ch4b-app-idle-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: DEMO_BUTTON, exact: true }).click();
    await expect(page.locator(".asset-card")).toHaveCount(7);
    await page.getByRole("article", { name: "studio-poster.svg" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("img", { name: "studio-poster.svg のプレビュー" })).toHaveJSProperty("naturalWidth", 960);
    await page.getByRole("checkbox", { name: "studio-poster.svg を選択" }).check();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Scroll past every card as a person would, so each preview is asked for while on screen.
    for (const card of await page.locator(".asset-card").all()) await card.scrollIntoViewIfNeeded();
    await expect(page.locator('[data-preview="loaded"]')).toHaveCount(5);
    await page.getByRole("article", { name: "studio-poster.svg" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.agent-harness/evidence/impl-ch4b-demo-grid-${width}.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `.agent-harness/evidence/impl-ch4b-demo-result-${width}.png`, fullPage: true });
    const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations;
    expect(violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  });
}
