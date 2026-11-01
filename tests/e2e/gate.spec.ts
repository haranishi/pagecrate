import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { POLICY_ACK_STORAGE_NAME, POLICY_VERSION } from "../../src/lib/policy";
import { acknowledgePolicy, delay, fakeTurnstile, liveScan, PAGE_URL, replacePreviews, scanPage, TURNSTILE_SCRIPT, watchPage } from "./support";

// tasks.md 4.5: the policy check before the first start, and the bot check that loads only when a page scan starts.
const GATE = "使う前に、プライバシーポリシーをお読みください";
const BOT_CHECK_FAILED = { code: "BOT_CHECK_FAILED", message: "自動化されたアクセスでないことを確認できませんでした。ページを読み込み直して、もう一度お試しください。" };
const axeViolations = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }));

function scanRequests(page: Page) {
  const bodies: (string | null)[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/scan") bodies.push(request.postData()); });
  return bodies;
}

async function confirmPolicy(page: Page) {
  const dialog = page.getByRole("dialog", { name: GATE });
  await dialog.getByRole("checkbox", { name: "プライバシーポリシーを読みました" }).check();
  await dialog.getByRole("button", { name: "進む" }).click();
}

test("policy check: the first start opens it, nothing is sent before '進む', Esc starts nothing and the focus goes back", async ({ page }) => {
  const scans = scanRequests(page);
  const turnstile = await fakeTurnstile(page);
  await replacePreviews(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const path of ["/demo", "/app"] as const) {
    await page.goto(path);
    if (path === "/app") await page.getByLabel("素材を集めたいページのURL", { exact: true }).fill(PAGE_URL);
    const start = page.getByRole("button", { name: path === "/demo" ? "デモを始める" : "素材を見つける", exact: true });
    await start.click();
    const dialog = page.getByRole("dialog", { name: GATE });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: GATE })).toBeFocused();
    // The focus stays inside: forward past the last control, and backward past the first.
    for (const key of ["Tab", "Tab", "Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab"]) {
      await page.keyboard.press(key);
      expect(await dialog.evaluate(element => element.contains(document.activeElement)), key).toBe(true);
    }
    expect(await axeViolations(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(start).toBeFocused();
    // "やめる" is the same as Esc.
    await start.click();
    await dialog.getByRole("button", { name: "やめる" }).click();
    await expect(dialog).toBeHidden();
    await expect(start).toBeFocused();
    expect(scans, path).toEqual([]);
    expect(turnstile.requests, `${path}: no bot check before the policy is confirmed`).toEqual([]);
  }
  await page.goto("/demo");
  await page.getByRole("button", { name: "デモを始める", exact: true }).click();
  await confirmPolicy(page);
  await expect(page.locator(".asset-card")).toHaveCount(7);
  expect(scans).toEqual([JSON.stringify({ demo: true })]);
  expect(turnstile.requests, "the demo never loads the bot check").toEqual([]);
});

test("first view: no request leaves this origin and the browser reports no CSP violation on any page", async ({ page }) => {
  const watch = await watchPage(page);
  for (const path of ["/", "/demo", "/app", "/terms", "/privacy", "/cookies"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await watch.violations(), path).toEqual([]);
  }
  expect(watch.external).toEqual([]);
});

test("bot check: its script is asked for when a page scan starts, once; every scan sends a new token; stopping the wait sends nothing", async ({ page }) => {
  const watch = await watchPage(page);
  await acknowledgePolicy(page);
  const turnstile = await fakeTurnstile(page);
  const bodies: unknown[] = [];
  await page.route("**/api/scan", route => {
    bodies.push(route.request().postDataJSON());
    return bodies.length === 2 ? route.fulfill({ status: 403, json: BOT_CHECK_FAILED }) : route.fulfill({ json: liveScan() });
  });
  await replacePreviews(page);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/app");
  await page.waitForLoadState("networkidle");
  expect(turnstile.requests, "nothing on the first view").toEqual([]);

  await scanPage(page);
  await expect(page.locator(".asset-card")).toHaveCount(9);
  expect(turnstile.requests).toHaveLength(1);
  expect(bodies).toEqual([{ url: PAGE_URL, turnstileToken: "fake-token-1" }]);

  // "もう一度取得" checks again; the answer is BOT_CHECK_FAILED and its retry checks once more.
  const rescan = page.locator(".collection-actions").getByRole("button", { name: "もう一度取得" });
  await rescan.click();
  const band = page.locator(".status-band");
  const problem = band.getByRole("group");
  await expect(problem).toContainText("自動化されたアクセスでないことを確認できませんでした");
  expect(bodies[1]).toEqual({ url: PAGE_URL, turnstileToken: "fake-token-2" });
  await problem.getByRole("button").click();
  await expect.poll(() => bodies.length).toBe(3);
  expect(bodies[2]).toEqual({ url: PAGE_URL, turnstileToken: "fake-token-3" });
  await expect(page.locator(".asset-card")).toHaveCount(9);

  // Held check, then "待機をやめる": nothing is sent, and a token arriving later is dropped.
  await page.evaluate(() => { (window as unknown as { __fakeTurnstileSettings: object }).__fakeTurnstileSettings = { hold: true }; });
  await rescan.click();
  await expect(band.getByText("ボット確認をしています", { exact: true })).toBeVisible();
  await expect(band.getByText("試験用のボット確認")).toBeVisible();
  await expect(page.getByRole("button", { name: "確認しています" })).toBeDisabled();
  await band.getByRole("button", { name: "待機をやめる" }).click();
  await expect(band.locator(".notice")).toHaveText("確認の待機をやめました。解析は始めていません。");
  await page.evaluate(() => (window as unknown as { __fakeTurnstileControl: { issueAll(): void } }).__fakeTurnstileControl.issueAll());
  await delay(300);
  expect(bodies).toHaveLength(3);

  // A failed check offers "もう一度確認する", which resets the same widget and then sends a new token.
  await rescan.click();
  await expect(band.getByText("試験用のボット確認")).toBeVisible();
  await page.evaluate(() => (window as unknown as { __fakeTurnstileControl: { failAll(): void } }).__fakeTurnstileControl.failAll());
  await expect(band.getByText("ボット確認を完了できませんでした", { exact: true })).toBeVisible();
  await page.evaluate(() => { (window as unknown as { __fakeTurnstileSettings: object }).__fakeTurnstileSettings = { hold: false }; });
  await band.getByRole("button", { name: "もう一度確認する" }).click();
  await expect.poll(() => bodies.length).toBe(4);
  expect(bodies[3]).toEqual({ url: PAGE_URL, turnstileToken: "fake-token-4" });

  const log = await turnstile.log();
  expect(log?.renders).toEqual(Array(5).fill({ sitekey: "1x00000000000000000000AA", action: "scan" }));
  expect([log?.resets, log?.removes]).toEqual([1, 5]);
  expect(turnstile.requests, "the script is asked for once per page").toHaveLength(1);
  expect(watch.external.filter(url => !TURNSTILE_SCRIPT.test(url))).toEqual([]);
  expect(await watch.violations()).toEqual([]);
});

test("policy record: only localStorage pagecrate.policy {version, ackedAt}, no cookie, and no request carries it", async ({ page, context }) => {
  const seen: string[] = [];
  page.on("request", request => seen.push([request.url(), JSON.stringify(request.headers()), request.postData() ?? ""].join("\n")));
  await replacePreviews(page);
  await page.goto("/demo");
  await page.getByRole("button", { name: "デモを始める", exact: true }).click();
  await confirmPolicy(page);
  await expect(page.locator(".asset-card")).toHaveCount(7);
  await page.reload();
  await page.getByRole("button", { name: "デモを始める", exact: true }).click();
  await expect(page.locator(".asset-card")).toHaveCount(7);
  await expect(page.getByRole("dialog", { name: GATE })).toBeHidden();
  const stored = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key) ?? ""])));
  expect(Object.keys(stored)).toEqual([POLICY_ACK_STORAGE_NAME]);
  const record: Record<string, unknown> = JSON.parse(stored[POLICY_ACK_STORAGE_NAME]);
  expect(Object.keys(record).sort()).toEqual(["ackedAt", "version"]);
  expect(record.version).toBe(POLICY_VERSION);
  expect(Number.isNaN(Date.parse(String(record.ackedAt)))).toBe(false);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  expect(await context.cookies()).toEqual([]);
  expect(seen.length).toBeGreaterThan(5);
  for (const text of seen) for (const value of [POLICY_VERSION, POLICY_ACK_STORAGE_NAME, String(record.ackedAt)]) expect(text.includes(value), value).toBe(false);
});

test("policy version: a confirmation of an older version asks again after a reload", async ({ page }) => {
  await replacePreviews(page);
  await page.goto("/demo");
  // The version before the logs and Turnstile disclosures were added: people who confirmed it are asked again.
  expect(POLICY_VERSION).not.toBe("2026-10-31.1");
  await page.evaluate(name => localStorage.setItem(name, JSON.stringify({ version: "2026-10-31.1", ackedAt: "2026-10-31T00:00:00.000Z" })), POLICY_ACK_STORAGE_NAME);
  await page.reload();
  await page.getByRole("button", { name: "デモを始める", exact: true }).click();
  await expect(page.getByRole("dialog", { name: GATE })).toBeVisible();
  await confirmPolicy(page);
  await expect(page.locator(".asset-card")).toHaveCount(7);
  expect(JSON.parse(await page.evaluate(name => localStorage.getItem(name) ?? "{}", POLICY_ACK_STORAGE_NAME)).version).toBe(POLICY_VERSION);
});

test("blocked storage: where localStorage throws, the confirmation lasts for this visit and is asked again after a reload", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("The operation is insecure.", "SecurityError"); } });
  });
  const scans = scanRequests(page);
  await replacePreviews(page);
  await page.goto("/demo");
  await page.getByRole("button", { name: "デモを始める", exact: true }).click();
  await confirmPolicy(page);
  await expect(page.locator(".asset-card")).toHaveCount(7);
  await page.getByRole("button", { name: "デモをやり直す" }).click();
  await expect.poll(() => scans.length).toBe(2);
  await expect(page.getByRole("dialog", { name: GATE })).toBeHidden();
  await page.reload();
  await page.getByRole("button", { name: "デモを始める", exact: true }).click();
  await expect(page.getByRole("dialog", { name: GATE })).toBeVisible();
  expect(scans).toHaveLength(2);
});
