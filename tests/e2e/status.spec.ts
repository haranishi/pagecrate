import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { API_MESSAGES, type ApiErrorCode } from "../../src/lib/api";
import { acknowledgePolicy, delay, fakeTurnstile, liveScan, OLD_WORDING, open, PAGE_URL, PREVIEW, PREVIEW_PNG, replaceApi, replacePreviews, RIGHTS_NOTE, scanPage, zipWith } from "./support";

// tasks.md 4.6: every state of the status band has a heading, the server's sentence, an estimate and its next step;
// an expired result stops saving and previews; the old wording is gone. /api/scan and /api/download are replaced.
interface Case {
  readonly code: ApiErrorCode | "SOMETHING_NEW" | "NETWORK";
  readonly status: number;
  readonly retryAfterSec?: number;
  readonly title: string;
  readonly estimate: RegExp;
  /** The button of the next step, or the words of it when there is no button. */
  readonly button?: string;
  readonly next?: RegExp;
}

const SCAN_CASES: readonly Case[] = [
  { code: "RATE_LIMITED", status: 429, retryAfterSec: 2, title: "続けて使われています", estimate: /あと[12]秒ほどで、もう一度試せます。/, button: "もう一度試す" },
  { code: "BUSY", status: 503, retryAfterSec: 2, title: "混み合っています", estimate: /あと[12]秒ほどで、もう一度試せます。/, button: "もう一度試す" },
  { code: "RATE_LIMITED", status: 429, title: "続けて使われています", estimate: /あと(1分|60秒|59秒)ほどで、もう一度試せます。/, button: "もう一度試す" },
  { code: "PAUSED", status: 503, title: "実サイトの取得は、いまお休み中です", estimate: /再開の時期は未定です。/, button: "デモを試す" },
  { code: "DAILY_CAP_REACHED", status: 503, retryAfterSec: 3_600, title: "本日の分は終了しました", estimate: /日本時間の午前9時ごろに再開します/, button: "デモを試す" },
  { code: "BOT_CHECK_FAILED", status: 403, title: "確認に失敗しました", estimate: /確認を取り直してから/, button: "確認してもう一度試す" },
  { code: "BLOCKED_HOST", status: 403, title: "このサイトは取得できません", estimate: /別のページのURLなら/, button: "URL欄へ戻る" },
  { code: "PRIVATE_ADDRESS", status: 422, title: "公開されていない接続先です", estimate: /公開ページのURLなら/, button: "URL欄へ戻る" },
  { code: "INVALID_URL", status: 400, title: "URLを確かめてください", estimate: /URLを直せば/, button: "URL欄へ戻る" },
  { code: "SCAN_FAILED", status: 502, title: "ページを解析できませんでした", estimate: /数分おくと/, button: "もう一度試す" },
  { code: "FORBIDDEN", status: 403, title: "この画面からは受け付けられませんでした", estimate: /PageCrate の画面から操作すれば/, next: /開き直して/ },
  { code: "SOMETHING_NEW", status: 500, title: "ページを取得できませんでした", estimate: /少し待つと使えます/, button: "もう一度試す" },
  { code: "NETWORK", status: 0, title: "接続できませんでした", estimate: /接続が戻れば/, button: "もう一度試す" },
];

const DOWNLOAD_CASES: readonly Case[] = [
  { code: "RATE_LIMITED", status: 429, retryAfterSec: 2, title: "続けて使われています", estimate: /あと[12]秒ほどで/, button: "もう一度試す" },
  { code: "LIMIT_EXCEEDED", status: 413, title: "一度に送れる量を超えています", estimate: /50点・合計100MiB/, next: /選ぶ素材を減らして/ },
  { code: "PAUSED", status: 503, title: "実サイトの取得は、いまお休み中です", estimate: /再開の時期は未定です。/, button: "デモを試す" },
  { code: "INVALID_TICKET", status: 400, title: "素材の情報を確かめられませんでした", estimate: /新しい一覧から保存できます/, button: "もう一度取得" },
  { code: "EXPIRED", status: 410, title: "取得から30分が過ぎました", estimate: /そこから30分、保存とプレビューができます/, button: "もう一度取得" },
];

function message(code: Case["code"]): string {
  return code in API_MESSAGES ? API_MESSAGES[code as ApiErrorCode] : "新しい種類の失敗です。時間をおいて、もう一度お試しください。";
}

async function answer(route: Route, item: Case) {
  if (item.code === "NETWORK") return route.abort("failed");
  return route.fulfill({
    status: item.status,
    headers: item.retryAfterSec ? { "Retry-After": String(item.retryAfterSec) } : {},
    json: { code: item.code, message: message(item.code), ...(item.retryAfterSec ? { retryAfterSec: item.retryAfterSec } : {}) },
  });
}

/** The band's box for a case: heading, focus, the server's sentence, the estimate, and the next step. */
async function expectBox(page: Page, item: Case) {
  const box = page.locator(".status-band").getByRole("group", { name: item.title });
  await expect(box, item.code).toBeFocused();
  if (item.code !== "NETWORK") await expect(box).toContainText(item.code === "SOMETHING_NEW" ? "新しい種類の失敗です。" : message(item.code));
  await expect(box.locator(".status-estimate")).toContainText("目安");
  await expect(box.locator(".status-estimate")).toContainText(item.estimate);
  if (item.button) await expect(box.getByRole("button", { name: item.button })).toBeVisible();
  else {
    await expect(box.getByRole("button")).toHaveCount(0);
    await expect(box.locator(".status-next")).toContainText(item.next!);
  }
  // An error that needs an action takes the focus and is not inside a live region (nothing is read twice).
  expect(await box.evaluate(element => element.closest("[aria-live], [role=status], [role=alert]") === null)).toBe(true);
  return box;
}

test("status band: every refused scan shows its heading, the server's sentence, an estimate and its next step", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  let current: Case = SCAN_CASES[0];
  await page.route("**/api/scan", route => answer(route, current));
  await open(page, "/app");
  await page.getByLabel("素材を集めたいページのURL", { exact: true }).fill(PAGE_URL);
  for (const item of SCAN_CASES) {
    current = item;
    await page.getByRole("button", { name: "素材を見つける", exact: true }).click();
    const box = await expectBox(page, item);
    if (item.retryAfterSec === 2) {
      // The retry waits out the server's seconds; the end of the wait is announced once.
      const retry = box.getByRole("button", { name: "もう一度試す" });
      await expect(retry).toBeDisabled();
      await expect(retry).toBeEnabled({ timeout: 4_000 });
      await expect(box.getByRole("status")).toHaveText("もう一度試せます。");
      await expect(box.locator(".status-estimate")).toContainText("もう一度試せます。");
    }
    if (item.code === "BLOCKED_HOST") {
      await box.getByRole("button", { name: "URL欄へ戻る" }).click();
      const field = page.getByLabel("素材を集めたいページのURL", { exact: true });
      await expect(field).toBeFocused();
      expect(await field.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd, input.value.length])).toEqual([0, PAGE_URL.length, PAGE_URL.length]);
    }
  }
});

/** WCAG contrast of an element's text against the backgrounds painted behind it. Runs in the page. */
function contrastAgainstBackground(element: Element): number {
  type Color = { r: number; g: number; b: number; a: number };
  const parse = (value: string): Color => {
    const parts = (value.match(/[\d.]+/g) ?? ["0", "0", "0"]).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const over = (top: Color, bottom: Color): Color => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  const luminance = ({ r, g, b }: Color) => {
    const channel = (value: number) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const layers: Color[] = [];
  for (let node: Element | null = element; node; node = node.parentElement) {
    const color = parse(getComputedStyle(node).backgroundColor);
    if (color.a > 0) { layers.push(color); if (color.a >= 1) break; }
  }
  let behind: Color = { r: 255, g: 255, b: 255, a: 1 };
  for (const layer of layers.reverse()) behind = over(layer, behind);
  const style = getComputedStyle(element);
  const ink = parse(style.color);
  const text = over({ ...ink, a: ink.a * Number(style.opacity) }, behind);
  const [light, dark] = [luminance(text), luminance(behind)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

test("status band: a retry that must wait counts the seconds down on its button in dark text, and pressing it during the wait sends nothing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  let scans = 0;
  await page.route("**/api/scan", route => {
    scans += 1;
    return route.fulfill({ status: 503, headers: { "Retry-After": "4" }, json: { code: "BUSY", message: message("BUSY"), retryAfterSec: 4 } });
  });
  await open(page, "/app");
  await scanPage(page);
  const box = page.locator(".status-band").getByRole("group", { name: "混み合っています" });
  await expect(box).toBeFocused();
  // Its name stays "もう一度試す", so nothing new is read out; the words on it are the seconds left, one by one.
  const retry = box.getByRole("button", { name: "もう一度試す" });
  const seconds = retry.locator(".button-wait");
  await expect(seconds).toHaveText(/^あと[34]秒$/);
  await expect(seconds).toHaveAttribute("aria-hidden", "true");
  const first = Number((await seconds.textContent())?.match(/\d+/)?.[0]);
  await expect(seconds).toHaveText(`あと${first - 1}秒`, { timeout: 2_500 });
  // Not pressable yet: aria-disabled instead of the disabled attribute, and the words keep 4.5:1 or more.
  await expect(retry).toHaveAttribute("aria-disabled", "true");
  expect(await retry.evaluate(element => (element as HTMLButtonElement).disabled)).toBe(false);
  expect(await retry.evaluate(contrastAgainstBackground)).toBeGreaterThanOrEqual(4.5);
  await retry.click({ force: true });
  await delay(300);
  expect(scans, "pressing it during the wait sends nothing").toBe(1);
  // The wait ends: the words go back to "もう一度試す", and pressing it sends the page again.
  await expect(retry).toBeEnabled({ timeout: 6_000 });
  await expect(retry).toHaveText("もう一度試す");
  await expect(retry).not.toHaveAttribute("aria-disabled", "true");
  await retry.click();
  await expect.poll(() => scans).toBe(2);
});

test("status band: a closed day offers the demo, which starts right here", async ({ page }) => {
  await replacePreviews(page);
  await page.route("**/api/scan", route => route.request().postDataJSON()?.demo ? route.continue() : answer(route, SCAN_CASES[4]));
  await open(page, "/app");
  await scanPage(page);
  const box = await expectBox(page, SCAN_CASES[4]);
  await box.getByRole("button", { name: "デモを試す" }).click();
  await expect(page.locator(".asset-card")).toHaveCount(7);
  await expect(page.getByText("取得元：PageCrate デモ（内蔵サンプル）")).toBeVisible();
});

test("status band: every refused save shows its heading, estimate and next step; an expired one stops saving and previews", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const sent = await replaceApi(page, [liveScan(), liveScan()]);
  let current: Case = DOWNLOAD_CASES[0];
  await page.route("**/api/download", route => { sent.download.push(route.request().postDataJSON()); return answer(route, current); });
  await open(page, "/app");
  await scanPage(page);
  await page.getByRole("checkbox", { name: "photo-1.png を選択" }).check();
  const bar = page.getByRole("complementary", { name: "選択した素材を保存" });
  for (const item of DOWNLOAD_CASES) {
    current = item;
    await bar.getByRole("button", { name: /ZIPで保存/ }).click();
    const box = await expectBox(page, item);
    if (item.retryAfterSec) await expect(box.getByRole("button", { name: "もう一度試す" })).toBeDisabled();
  }
  // EXPIRED (the last one): the list stays, saving and previews stop, and "もう一度取得" leads.
  expect(sent.download).toHaveLength(DOWNLOAD_CASES.length);
  await expect(bar.getByRole("button", { name: /ZIPで保存/ })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "もう一度取得" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "photo-2.png を選択" })).toBeDisabled();
  await expect(page.locator(".asset-card")).toHaveCount(9);
  const previewsBefore = sent.preview.length;
  await page.locator(".asset-grid").scrollIntoViewIfNeeded();
  for (const card of await page.locator(".asset-card").all()) await card.scrollIntoViewIfNeeded();
  await delay(300);
  expect(sent.preview.length, "no preview is asked for after expiry").toBe(previewsBefore);
  await page.locator(".status-band").getByRole("button", { name: "もう一度取得" }).click();
  await expect.poll(() => sent.scan.length).toBe(2);
  await expect(page.getByRole("checkbox", { name: "photo-2.png を選択" })).toBeEnabled();
});

test("status band roles: information is announced and leaves the focus; an expired result is announced, not focused", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  // The answer is made when the scan is sent, so it expires 3 seconds after the result appears.
  await page.route("**/api/scan", route => route.fulfill({ json: liveScan({ expiresInMs: 3_000 }) }));
  await replacePreviews(page);
  await page.route("**/api/download", route => route.fulfill({ contentType: "application/zip", body: zipWith({ requested: 1, saved: 1, files: [] }) }));
  await open(page, "/app");
  const band = page.locator(".status-band");
  expect(await band.evaluate(element => [element.getAttribute("aria-live"), element.getAttribute("role")])).toEqual([null, null]);
  const live = band.locator(":scope > [role=status]").first();
  await scanPage(page);
  // A new result: the focus goes to its heading, which says the count; the band's notice is shown but not read again.
  await expect(page.getByRole("heading", { name: /見つかった素材/ })).toBeFocused();
  await expect(band.getByText("9点の素材が見つかりました。")).toBeVisible();
  await expect(live).toHaveText("");
  await page.getByRole("checkbox", { name: "photo-1.png を選択" }).check();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: /ZIPで保存/ }).click();
  await pending;
  await expect(live).toContainText("ZIPのダウンロードを開始しました");
  expect(await band.evaluate(element => element.contains(document.activeElement))).toBe(false);
  // The result expires on this device: announced, and the focus stays where it was.
  await page.evaluate(() => document.activeElement?.setAttribute("data-focus-probe", ""));
  await expect(live).toContainText("取得から30分が過ぎました。もう一度取得すると", { timeout: 6_000 });
  await expect(band.getByRole("group", { name: "取得から30分が過ぎました" })).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.hasAttribute("data-focus-probe"))).toBe(true);
  expect(await band.evaluate(element => element.contains(document.activeElement))).toBe(false);
});

test("preview limit: the band says how long previews wait (start and end announced), and they continue by themselves", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  let refused = 0;
  await page.route("**/api/scan", route => route.fulfill({ json: liveScan() }));
  await page.route(PREVIEW, route => {
    if (refused === 0) {
      refused += 1;
      return route.fulfill({ status: 429, headers: { "Retry-After": "2" }, json: { code: "RATE_LIMITED", message: API_MESSAGES.RATE_LIMITED, retryAfterSec: 2 } });
    }
    return route.fulfill({ contentType: "image/png", body: PREVIEW_PNG });
  });
  await open(page, "/app");
  await scanPage(page);
  await page.locator(".asset-grid").scrollIntoViewIfNeeded();
  const line = page.locator(".preview-wait-line");
  await expect(line).toContainText(/プレビューは1分あたりの回数に上限があります。あと[12]秒ほどで続きを表示します。/);
  const announced = page.locator(".status-band").locator(":scope > [role=status]").last();
  await expect(announced).toHaveText(/プレビューは1分あたりの回数に上限があります。[12]秒ほどで続きを表示します。/);
  await expect(page.locator('[data-preview="loaded"]')).toHaveCount(6, { timeout: 6_000 });
  await expect(line).toHaveCount(0);
  await expect(announced).toHaveText("プレビューの続きを表示しています。");
});

test("wording: no old pilot wording and no link to /login or /account on the six public pages", async ({ page }) => {
  for (const path of ["/", "/demo", "/app", "/terms", "/privacy", "/cookies"]) {
    await page.goto(path);
    const text = [
      await page.locator("body").innerText(),
      await page.title(),
      ...await page.locator("meta[name=description], meta[property^='og:'], meta[name^='twitter:']").evaluateAll(nodes => nodes.map(node => node.getAttribute("content") ?? "")),
    ].join("\n");
    for (const word of OLD_WORDING) expect(text.includes(word), `${path}: ${word}`).toBe(false);
    await expect(page.locator('a[href*="/login"], a[href*="/account"]'), path).toHaveCount(0);
  }
});

test("rights note: the sentence of requirement 6.1 is right under the URL field at 390px and 1440px", async ({ page }) => {
  await open(page, "/app");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const field = page.locator(".url-field");
    const note = page.locator("#rights-note");
    await expect(note).toBeVisible();
    await expect(note).toHaveText(RIGHTS_NOTE);
    const [fieldBox, noteBox] = [await field.boundingBox(), await note.boundingBox()];
    expect(fieldBox && noteBox && noteBox.y >= fieldBox.y + fieldBox.height - 1 && noteBox.y - (fieldBox.y + fieldBox.height) <= 24, `${width}px`).toBe(true);
  }
});

for (const width of [390, 1440]) {
  test(`evidence at ${width}px: the policy check, scanning, a result, expiry, crowding, the daily cap and a pause, with no accessibility violations`, async ({ page }) => {
    const height = width === 390 ? 844 : 1000;
    await page.setViewportSize({ width, height });
    await fakeTurnstile(page);
    await replacePreviews(page);
    let release: () => void = () => undefined;
    let hold = true;
    let next: Case | "expiring" | "result" = "result";
    await page.route("**/api/scan", async route => {
      if (hold) await new Promise<void>(resolve => { release = resolve; });
      if (next === "result") return route.fulfill({ json: liveScan() });
      if (next === "expiring") return route.fulfill({ json: liveScan({ expiresInMs: 1_500 }) });
      return answer(route, next);
    });
    const shot = async (name: string) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `.agent-harness/evidence/impl-ch4c-${name}-${width}.png`, fullPage: name !== "gate" });
      const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations;
      expect(violations.map(item => ({ name, id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: no sideways scrolling`).toBe(true);
    };
    await page.goto("/app");
    await page.getByLabel("素材を集めたいページのURL", { exact: true }).fill(PAGE_URL);
    await page.getByRole("button", { name: "素材を見つける", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "使う前に、プライバシーポリシーをお読みください" })).toBeVisible();
    await shot("gate");
    await page.getByRole("checkbox", { name: "プライバシーポリシーを読みました" }).check();
    await page.getByRole("button", { name: "進む" }).click();
    await expect(page.locator(".scan-progress")).toBeVisible();
    await shot("scanning");
    hold = false;
    release();
    await expect(page.locator(".asset-card")).toHaveCount(9);
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await shot("result");
    for (const [name, item] of [["busy", SCAN_CASES[1]], ["cap", SCAN_CASES[4]], ["paused", SCAN_CASES[3]]] as const) {
      next = item;
      await page.getByRole("button", { name: "素材を見つける", exact: true }).click();
      await expect(page.locator(".status-band").getByRole("group", { name: item.title })).toBeFocused();
      await shot(name);
    }
    next = "expiring";
    await page.getByRole("button", { name: "素材を見つける", exact: true }).click();
    await expect(page.locator(".status-band").getByRole("group", { name: "取得から30分が過ぎました" })).toBeVisible({ timeout: 5_000 });
    await shot("expired");
  });
}

test("the policy check and the bot check work without stored data: a fresh visitor gets the check before the first page scan", async ({ page }) => {
  // A guard for the shared setup: without acknowledgePolicy the check shows; with it, it does not.
  const turnstile = await fakeTurnstile(page);
  await page.route("**/api/scan", route => route.fulfill({ json: liveScan() }));
  await replacePreviews(page);
  await page.goto("/app");
  await scanPage(page);
  await expect(page.getByRole("dialog", { name: "使う前に、プライバシーポリシーをお読みください" })).toBeVisible();
  expect(turnstile.requests).toEqual([]);
  await acknowledgePolicy(page);
  await page.reload();
  await scanPage(page);
  await expect(page.locator(".asset-card")).toHaveCount(9);
  expect(turnstile.requests).toHaveLength(1);
});
