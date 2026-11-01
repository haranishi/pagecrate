import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { acknowledgePolicy, OLD_WORDING, PAUSE_WORDS } from "./support";

/** Technical words the captions must not use: they are written in plain Japanese for first-time visitors. */
const JARGON = ["Turnstile", "CSP", "署名", "チケット"];

test("first visit explains the product without account calls, tracking, or video preloading", async ({ page, context }) => {
  const requested: string[] = [];
  page.on("request", request => requested.push(request.url()));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ZIP");
  // This preview is open: the hero says nothing about a pause (paused.spec covers a paused site).
  await expect(page.locator("body")).not.toContainText(PAUSE_WORDS);
  await expect(page.getByRole("link", { name: "登録なしで試す", exact: true }).first()).toHaveAttribute("href", "/demo");
  await expect(page.getByRole("link", { name: "素材を集める", exact: true })).toHaveAttribute("href", "/app");
  const video = page.getByLabel("PageCrate の操作デモ", { exact: true });
  await expect(video).toHaveAttribute("preload", "none");
  await expect(video).not.toHaveAttribute("autoplay");
  await expect(video).toHaveJSProperty("paused", true);
  // The text alternative follows the video, the policy check included (tasks.md 5.2).
  await expect(page.locator("#tour-description")).toContainText("自作デモを開く → プライバシーポリシーを確認する → 画像を選ぶ");
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  expect(requested.filter(url => new URL(url).origin !== (process.env.PAGECRATE_TEST_URL ?? "http://127.0.0.1:4381"))).toEqual([]);
  expect(requested.filter(url => /\/api\/|\.(mp4|webm)(?:\?|$)/.test(url))).toEqual([]);
});

test("actual tour video decodes, plays, pauses, seeks, ends, and loads Japanese captions", async ({ page, context }) => {
  await page.goto("/");
  const video = page.getByLabel("PageCrate の操作デモ", { exact: true });
  await video.scrollIntoViewIfNeeded();
  await video.evaluate((element: HTMLVideoElement) => element.play());
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0.2);
  await expect(video).toHaveJSProperty("videoWidth", 1280);
  await expect(video).toHaveJSProperty("videoHeight", 720);
  const duration = await video.evaluate((element: HTMLVideoElement) => element.duration);
  expect(duration).toBeGreaterThanOrEqual(29);
  expect(duration).toBeLessThanOrEqual(31);
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.textTracks[0]?.cues?.length)).toBe(7);
  // The captions as people see them: at most two short lines each, in order inside the video, in plain words, with no
  // old wording, and the policy check is one of the scenes.
  const cues = await video.evaluate((element: HTMLVideoElement) => Array.from(element.textTracks[0]?.cues ?? [], cue => ({ start: cue.startTime, end: cue.endTime, text: (cue as VTTCue).text })));
  cues.forEach((cue, index) => {
    const lines = cue.text.split("\n");
    expect(lines.length, cue.text).toBeLessThanOrEqual(2);
    for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(30);
    for (const word of [...OLD_WORDING, ...JARGON]) expect(cue.text.includes(word), `${cue.text}: ${word}`).toBe(false);
    expect(cue.start, cue.text).toBeGreaterThanOrEqual(index === 0 ? 0 : cues[index - 1].end);
    expect(cue.end, cue.text).toBeGreaterThan(cue.start);
    expect(cue.end, cue.text).toBeLessThanOrEqual(duration + 0.1);
  });
  expect(cues.some(cue => cue.text.includes("プライバシーポリシー"))).toBe(true);
  await video.evaluate((element: HTMLVideoElement) => { element.pause(); element.currentTime = 12; });
  await expect(video).toHaveJSProperty("paused", true);
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.seeking)).toBe(false);
  expect(await video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeCloseTo(12, 0);
  await video.evaluate((element: HTMLVideoElement) => { element.currentTime = element.duration - 0.3; return element.play(); });
  await expect(video).toHaveJSProperty("ended", true);
  expect(await video.evaluate((element: HTMLVideoElement) => element.error)).toBeNull();
  expect(await context.cookies()).toEqual([]);
});

test("video load failure keeps a readable explanation and a working demo route", async ({ page }) => {
  await page.route(/\/tour\/pagecrate-tour\.(mp4|webm)/, route => route.fulfill({ status: 404, body: "" }));
  await page.goto("/");
  await page.getByLabel("PageCrate の操作デモ", { exact: true }).evaluate((element: HTMLVideoElement) => { void element.play().catch(() => {}); });
  await expect(page.getByText(/動画を読み込めませんでした/)).toBeVisible();
  await page.getByRole("link", { name: "登録なしで試す", exact: true }).first().click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole("button", { name: "デモを始める", exact: true })).toBeVisible();
});

test("intro to anonymous demo uses no cookie and saves real image/video ZIP", async ({ page, context }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "登録なしで試す", exact: true }).first().click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByLabel("素材を集めたいページのURL")).toHaveCount(0);
  await expect(page.getByText("このデモは内蔵素材だけを使用 · 外部サイトへのアクセスなし", { exact: true })).toBeVisible();
  await expect(page.getByText("取得時は対象サイトへアクセスします", { exact: true })).toHaveCount(0);
  expect(await context.cookies()).toEqual([]);
  await page.getByRole("button", { name: "デモを始める", exact: true }).click();
  // A first visit confirms the privacy policy before the demo starts (requirement 2.1).
  const check = page.getByRole("dialog", { name: "使う前に、プライバシーポリシーをお読みください" });
  await check.getByRole("checkbox", { name: "プライバシーポリシーを読みました" }).check();
  await check.getByRole("button", { name: "進む" }).click();
  await expect(page.locator(".asset-card")).toHaveCount(7);
  expect(await context.cookies()).toEqual([]);
  await page.getByRole("checkbox", { name: "studio-poster.svg を選択" }).check();
  await page.getByRole("button", { name: /^動画\s*1$/ }).click();
  await page.getByRole("checkbox", { name: "motion-study.webm を選択" }).check();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /ZIPで保存/ }).click();
  const files = unzipSync(new Uint8Array(await readFile((await (await pending).path())!)));
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  expect(manifest.saved).toBe(2);
  expect(manifest.files.map((file: { mime: string }) => file.mime).sort()).toEqual(["image/svg+xml", "video/webm"]);
  await expect(page.getByText("2/2点をZIPに保存", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "自分のURLで使う", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  for (const checkbox of await page.getByRole("checkbox").all()) await expect(checkbox).not.toBeChecked();
});

for (const width of [390, 768, 1440]) test(`intro and demo layout, keyboard and accessibility at ${width}px`, async ({ page }) => {
  await acknowledgePolicy(page);
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/", "/demo"]) {
    await page.goto(path);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "メインコンテンツへ" })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations.map(value => ({ id: value.id, targets: value.nodes.map(node => node.target) }))).toEqual([]);
    // Capture the settled, unfocused page, not Chromium's transient idle controls.
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    if (path === "/") await page.waitForTimeout(1800);
    await page.screenshot({ path: `.agent-harness/evidence/intro-${path === "/" ? "landing" : "demo"}-${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "デモを始める", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".asset-card")).toHaveCount(7);
  await page.getByRole("checkbox", { name: "studio-poster.svg を選択" }).check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `.agent-harness/evidence/intro-demo-result-${width}.png`, fullPage: true });
});
