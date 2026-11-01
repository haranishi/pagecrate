import { test, expect } from "@playwright/test";
import { acknowledgePolicy, fakeTurnstile, liveScan, PAGE_URL, replaceApi, scanPage, TURNSTILE_SCRIPT, watchPage } from "./support";

// Independent review P1: a Content-Security-Policy belongs to the document that was loaded first. Following a
// next/link to /app swaps the screen without loading a new document, so the bot check must be allowed by the policy of
// the page the visitor came from. Each case starts on another page, follows its link to /app inside the same document,
// and runs a page scan there (the policy is already confirmed, the bot check is the fake, the API is replaced).
// The top page has the same link twice (under the tour video and at the end): the one at the end is the case here.
const ENTRIES = [
  { from: "/", region: "まずは、自作のサンプルで。", link: "自分のURLで使う" },
  { from: "/demo", region: null, link: "自分のURLで使う" },
  { from: "/privacy", region: null, link: "素材を集める" },
] as const;

const MARK = "same-document";

for (const { from, region, link } of ENTRIES) {
  test(`navigation: from ${from}, the link "${link}" opens /app in the same document, and a page scan gets its bot check`, async ({ page }) => {
    const watch = await watchPage(page);
    await acknowledgePolicy(page);
    const turnstile = await fakeTurnstile(page);
    const scan = liveScan();
    const sent = await replaceApi(page, [scan]);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(from);
    await page.waitForLoadState("networkidle");
    await page.evaluate(mark => { (window as unknown as { __navigationMark?: string }).__navigationMark = mark; }, MARK);

    await (region ? page.getByRole("region", { name: region }) : page).getByRole("link", { name: link, exact: true }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByLabel("素材を集めたいページのURL", { exact: true })).toBeVisible();
    // A new document would have dropped the mark: this is the in-app navigation the review describes.
    expect(await page.evaluate(() => (window as unknown as { __navigationMark?: string }).__navigationMark)).toBe(MARK);
    expect(await page.evaluate(() => performance.getEntriesByType("navigation").map(entry => new URL(entry.name).pathname))).toEqual([from]);
    expect(turnstile.requests, "nothing before the scan starts").toEqual([]);

    await scanPage(page);
    // Soft: on a failure the next line still runs and shows the script requests, the scan and the violations at once.
    await expect.soft(page.locator(".asset-card")).toHaveCount(scan.assets.length, { timeout: 8_000 });
    expect({ scriptRequests: turnstile.requests.length, scans: sent.scan, violations: await watch.violations() }).toEqual({
      scriptRequests: 1, scans: [{ url: PAGE_URL, turnstileToken: "fake-token-1" }], violations: [],
    });
    expect(watch.external.filter(url => !TURNSTILE_SCRIPT.test(url))).toEqual([]);
  });
}
