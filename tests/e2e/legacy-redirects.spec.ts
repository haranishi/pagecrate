import { test, expect, type Page } from "@playwright/test";
import { BASE_URL, OLD_WORDING, watchPage } from "./support";

// tasks.md 5.1 / requirement 1.3: the old sign-in and account screens offer nothing and lead to the workspace, and the
// old sign-in, account, consent and email APIs are gone (404).
const ORIGIN = new URL(BASE_URL).origin;
const OLD_SCREENS = [
  { path: "/login", query: "?error=oauth&next=%2Faccount" },
  { path: "/account", query: "?tab=delete" },
] as const;
const OLD_APIS = [
  "/api/login", "/api/logout", "/api/account", "/api/account/delete", "/api/consent", "/api/auth/session",
  "/api/auth/callback/google", "/api/email/start", "/api/email/verify", "/api/email/resend", "/api/email/cancel",
] as const;

/** The workspace shows its own heading and URL field, and nothing to sign in with. */
async function expectWorkspaceWithoutSignIn(page: Page, label: string) {
  await expect(page.getByRole("heading", { level: 1 }), label).toContainText("ページの素材を");
  await expect(page.getByLabel("素材を集めたいページのURL", { exact: true }), label).toBeVisible();
  await expect(page.locator('input[type="password"], input[type="email"], input[autocomplete="one-time-code"]'), label).toHaveCount(0);
  await expect(page.getByRole("button", { name: /ログイン|サインイン|アカウント|Google/ }), label).toHaveCount(0);
  await expect(page.getByRole("link", { name: /ログイン|サインイン|アカウント/ }), label).toHaveCount(0);
  await expect(page.locator('a[href*="/login"], a[href*="/account"]'), label).toHaveCount(0);
  const text = await page.locator("body").innerText();
  for (const word of OLD_WORDING) expect(text.includes(word), `${label}: ${word}`).toBe(false);
}

for (const { path, query } of OLD_SCREENS) {
  test(`old screen ${path}: the server sends it to /app without its query, and the workspace offers no sign-in`, async ({ page }) => {
    // The server itself answers with the redirect (not a page that moves later), and the query stays behind.
    for (const address of [path, `${path}${query}`]) {
      const answer = await page.request.get(address, { maxRedirects: 0 });
      expect(answer.status(), address).toBe(307);
      const location = new URL(answer.headers()["location"] ?? "", BASE_URL);
      expect(`${location.origin}${location.pathname}${location.search}`, address).toBe(`${ORIGIN}/app`);
      expect(answer.headers()["set-cookie"], address).toBeUndefined();
    }
    const watch = await watchPage(page);
    await page.goto(`${path}${query}`);
    await expect(page).toHaveURL(`${ORIGIN}/app`);
    await expectWorkspaceWithoutSignIn(page, path);
    expect(await page.context().cookies(), path).toEqual([]);
    expect(watch.external, path).toEqual([]);
  });
}

test("old APIs: the sign-in, account, consent and email addresses answer 404 to GET and POST, and set no cookie", async ({ request }) => {
  for (const address of OLD_APIS) {
    const get = await request.get(address, { maxRedirects: 0 });
    expect(get.status(), `GET ${address}`).toBe(404);
    expect(get.headers()["set-cookie"], `GET ${address}`).toBeUndefined();
    const post = await request.post(address, { headers: { origin: ORIGIN }, data: {}, maxRedirects: 0 });
    expect(post.status(), `POST ${address}`).toBe(404);
    expect(post.headers()["set-cookie"], `POST ${address}`).toBeUndefined();
  }
});
