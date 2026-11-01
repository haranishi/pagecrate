import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { API_MESSAGES } from "../../src/lib/api";
import { acknowledgePolicy, buttonGeometry, delay, DEMO_BUTTON, fakeTurnstile, lockPlacement, OLD_WORDING, PAGE_URL, palette, PAUSE_LEAD, PAUSE_NOTE, PAUSE_WORDS, PHRASES, TOP_PAUSE_NOTE, watchPage, wrapsBetween } from "./support";

// The demo-only public site (PAGECRATE_PAUSED=1, docs/operations.md). The screen knows the pause from the first view:
// /app says so at the top of the URL card, a page scan is refused at once (no policy check, no bot-check script, nothing
// sent to /api/scan) and the band offers the demo, which works as usual. It needs a Workers preview started with the
// pause on, so it runs only with PAGECRATE_TEST_PAUSED=1. The usual run is open: it skips this file, and app.spec,
// intro.spec and ui-layout.spec check that an open site shows none of this. UI scoring of the paused screens, round 1: one
// way of saying it, the demo in the note, a calm band, and phrases kept whole on phones.
test.skip(process.env.PAGECRATE_TEST_PAUSED !== "1", "needs a Workers preview started with PAGECRATE_PAUSED=1 (PAGECRATE_TEST_PAUSED=1)");

const GATE = "使う前に、プライバシーポリシーをお読みください";
const PAUSED_TITLE = "実サイトの取得は、いまお休み中です";
/** The band's own sentence while the screen knows the pause (LIVE_PAUSED.message): the next step, not the heading again. */
const PAUSED_BODY = "デモなら、自作の素材で同じ流れを試せます。";
const PAUSED_ESTIMATE = "再開の時期は未定です。";
const URL_FIELD = "素材を集めたいページのURL";
/** What reads as if a page could be fetched now, or names the demo another way: never shown while paused. */
const FETCH_NOW = ["ログイン不要の公開ページを1ページずつ取得します。", "使い方を試したいときは、サンプル素材で体験できます。", "デモで試してみる", "実際のページは、URLを入れて取得できます。", "「素材を見つける」を押します"];

/** The body of every request the page sends to /api/scan. */
function scanRequests(page: Page) {
  const bodies: (string | null)[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/scan") bodies.push(request.postData()); });
  return bodies;
}

/** The band's box for the pause, by its heading. */
const pausedBox = (page: Page) => page.locator(".status-band").getByRole("group", { name: PAUSED_TITLE });
/** Whatever box the band shows (for what does not depend on the heading). */
const bandBox = (page: Page) => page.locator(".status-band [role=group]").first();
/** The top page's hero note. */
const heroNote = (page: Page) => page.locator("section[aria-labelledby=intro-title] > p").last();

async function pressStart(page: Page) {
  await page.getByLabel(URL_FIELD, { exact: true }).fill(PAGE_URL);
  await page.getByRole("button", { name: "素材を見つける", exact: true }).click();
}

/** WCAG contrast of an element's text against the backgrounds painted behind it. Runs in the page. */
function textContrast(element: Element): number {
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

test("paused /app: the note at the top of the URL card says the pause in bold and holds 'デモを試す', the one filled button; the URL button is outlined but can be pressed; nothing reads as if a page could be fetched now, not even the first step", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app");
  // The always-on note: in the URL card, above the field (so not under the rights note), never folded away, and read
  // with the field. Its first sentence is the one way every screen says the pause, in bold.
  const box = page.locator(".entry-panel .pause-note");
  const note = page.locator("#pause-note");
  await expect(note).toHaveText(PAUSE_NOTE);
  await expect(note.locator("strong")).toHaveText(PAUSE_LEAD);
  expect(Number(await note.locator("strong").evaluate(element => getComputedStyle(element).fontWeight)), "the first sentence is bold").toBeGreaterThanOrEqual(600);
  const [boxRect, fieldBox] = [await box.boundingBox(), await page.locator(".url-field").boundingBox()];
  expect(boxRect && fieldBox && boxRect.y + boxRect.height <= fieldBox.y, "the note is above the URL field").toBe(true);
  expect(await box.evaluate(element => element.closest("details, dialog, [hidden], [aria-hidden=true]") === null)).toBe(true);
  // The way into the demo is in the note: the card has no other.
  await expect(box.getByRole("button", { name: DEMO_BUTTON, exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".entry-panel").getByRole("button", { name: /デモ/ })).toHaveCount(1);
  // Nothing says a page can be fetched now: the help line under the field and the card's foot are gone.
  const words = await page.locator("main").innerText();
  expect(FETCH_NOW.filter(item => words.includes(item)), "words that read as fetching now").toEqual([]);
  await expect(page.locator("#url-help, .entry-footer")).toHaveCount(0);
  await expect(page.getByLabel(URL_FIELD, { exact: true })).toHaveAttribute("aria-describedby", "pause-note rights-note");
  // The URL button can be pressed: the band then says why (not disabled, which would hide the reason). It is outlined,
  // like the page's other secondary buttons, so the demo is the one filled button of the card (UI scoring of the paused
  // screens, round 2: the URL button, which cannot do its job now, was the loudest thing on the screen).
  const start = page.getByRole("button", { name: "素材を見つける", exact: true });
  await expect(start).toBeEnabled();
  await expect(start).not.toHaveAttribute("aria-disabled", "true");
  const demo = box.getByRole("button", { name: DEMO_BUTTON, exact: true });
  await expect(demo).toHaveClass(/\bbutton-primary\b/);
  await expect(start).toHaveClass(/\bbutton-outline\b/);
  await expect(start).not.toHaveClass(/\bbutton-primary\b/);
  await expect(page.locator(".entry-panel .button-primary"), "the demo is the card's one filled button").toHaveCount(1);
  const fills = { demo: await demo.evaluate(element => getComputedStyle(element).backgroundColor), start: await start.evaluate(element => getComputedStyle(element).backgroundColor) };
  expect(fills.demo, JSON.stringify(fills)).not.toBe(fills.start);
  // The note is read first: 14px, its first sentence 15px (it was 12px, smaller than the example text of the field).
  const sizes = await note.evaluate(element => ({ body: parseFloat(getComputedStyle(element).fontSize), lead: parseFloat(getComputedStyle(element.querySelector("strong") as Element).fontSize) }));
  expect(sizes.body, JSON.stringify(sizes)).toBeGreaterThanOrEqual(14);
  expect(sizes.lead, JSON.stringify(sizes)).toBeGreaterThanOrEqual(15);
  // The first of the three steps under the card is the demo's: it must not tell people to paste a URL and press the button.
  const firstStep = page.locator(".how-step").first();
  await expect(firstStep).toContainText(DEMO_BUTTON);
  await expect(firstStep).not.toContainText("素材を見つける");
});

for (const visitor of ["a first visit", "a visitor who confirmed the policy before"] as const) {
  test(`paused /app, ${visitor}: a page scan shows the pause in the band at once, with no policy check, no bot-check script and nothing sent`, async ({ page, context }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const watch = await watchPage(page);
    if (visitor !== "a first visit") await acknowledgePolicy(page);
    const turnstile = await fakeTurnstile(page);
    const scans = scanRequests(page);
    await page.goto("/app");
    await page.waitForLoadState("networkidle");
    await pressStart(page);
    const start = page.getByRole("button", { name: "素材を見つける", exact: true });
    // Whatever comes first (the band, or the old way's policy check), then what the page asked for on the way.
    await expect(bandBox(page).or(page.getByRole("dialog", { name: GATE }))).toBeVisible();
    await delay(300);
    expect({ policyCheck: await page.getByRole("dialog", { name: GATE }).count(), scriptRequests: turnstile.requests.length, scans }, "after pressing 素材を見つける")
      .toEqual({ policyCheck: 0, scriptRequests: 0, scans: [] });
    // The heading says the pause; the body says what to do instead (not the server's sentence, not the heading again).
    const band = bandBox(page);
    expect({ heading: await band.locator("strong").first().innerText(), body: await band.locator("p").first().innerText() })
      .toEqual({ heading: PAUSED_TITLE, body: PAUSED_BODY });
    const box = pausedBox(page);
    await expect(box).toBeFocused();
    await expect(box).not.toContainText(API_MESSAGES.PAUSED);
    await expect(box.locator(".status-estimate")).toHaveText(`目安${PAUSED_ESTIMATE}`);
    await expect(box.getByRole("button", { name: DEMO_BUTTON, exact: true })).toBeVisible();
    // Pressing again says the same; nothing ever leaves the page.
    await start.click();
    await expect(pausedBox(page)).toBeFocused();
    await delay(500);
    expect({ policyCheck: await page.getByRole("dialog", { name: GATE }).count(), scriptRequests: turnstile.requests.length, scans, external: watch.external, violations: await watch.violations() })
      .toEqual({ policyCheck: 0, scriptRequests: 0, scans: [], external: [], violations: [] });
    // A first visit was never shown the check, so nothing was kept on the device.
    if (visitor === "a first visit") expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
    expect(await context.cookies()).toEqual([]);
  });
}

for (const where of ["the note", "the band"] as const) {
  test(`paused /app: 'デモを試す' in ${where} starts the built-in demo (the policy check the first time, then its seven items), without the bot check`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const turnstile = await fakeTurnstile(page);
    const scans = scanRequests(page);
    await page.goto("/app");
    if (where === "the band") await pressStart(page);
    const holder = where === "the note" ? page.locator(".pause-note") : bandBox(page);
    await holder.getByRole("button", { name: DEMO_BUTTON, exact: true }).click({ timeout: 5_000 });
    const dialog = page.getByRole("dialog", { name: GATE });
    await expect(dialog).toBeVisible();
    expect(scans, "nothing is sent before '進む'").toEqual([]);
    await dialog.getByRole("checkbox", { name: "プライバシーポリシーを読みました" }).check();
    await dialog.getByRole("button", { name: "進む" }).click();
    await expect(page.locator(".asset-card")).toHaveCount(7);
    await expect(page.getByText("取得元：PageCrate デモ（内蔵サンプル）")).toBeVisible();
    expect(scans).toEqual([JSON.stringify({ demo: true })]);
    expect(turnstile.requests).toEqual([]);
    await expect(page.locator("#pause-note")).toHaveText(PAUSE_NOTE);
  });
}

for (const [width, height] of [[390, 844], [1440, 900]] as const) {
  test(`paused /app at ${width}×${height}: the band is calm like the note (its colours and the info mark, not the warning), and both 'デモを試す' buttons put the arrow after the words, are 44px or taller, fill their box at 390px and come near the main button at 1440px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await fakeTurnstile(page);
    await page.goto("/app");
    const note = page.locator(".pause-note");
    const mainHeight = await page.getByRole("button", { name: "素材を見つける", exact: true }).evaluate(element => parseFloat(getComputedStyle(element).minHeight));
    const noteButton = await note.getByRole("button", { name: DEMO_BUTTON, exact: true }).evaluate(buttonGeometry, undefined, { timeout: 5_000 });
    await pressStart(page);
    const band = bandBox(page);
    await expect(band).toBeVisible();
    const look = {
      colours: await band.evaluate(palette),
      warning: await band.evaluate(element => element.classList.contains("error-box")),
      // The info mark is a circle; the warning mark is a triangle.
      infoMark: await band.locator(":scope > svg circle").count(),
    };
    expect(look).toEqual({ colours: await note.evaluate(palette), warning: false, infoMark: 1 });
    const bandButton = await band.getByRole("button", { name: DEMO_BUTTON, exact: true }).evaluate(buttonGeometry);
    for (const [label, button] of [["note", noteButton], ["band", bandButton]] as const) {
      expect(button.arrowAfterWords, `${label}: the arrow after the words`).toBe(true);
      expect(button.height, `${label}: height`).toBeGreaterThanOrEqual(44);
      if (width <= 390) expect([Math.abs(button.left) <= 1, Math.abs(button.right) <= 1], `${label}: the box's width ${JSON.stringify(button)}`).toEqual([true, true]);
    }
    if (width > 390) expect(bandButton.height, `band: near the main button (its height rule ${mainHeight}px)`).toBeGreaterThanOrEqual(mainHeight - 1);
  });
}

test("paused top page: the hero's note is replaced by two sentences in body text (14px or more, dark), each on its own line at 390px; the closing band and /demo say the pause instead of '実際のページは…'", async ({ page }) => {
  const watch = await watchPage(page);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const note = heroNote(page);
    await expect(note).toHaveText(TOP_PAUSE_NOTE);
    expect(await note.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), `${width}px: size`).toBeGreaterThanOrEqual(14);
    // The body's dark ink, not the faint grey of an open site's note (about 4.7:1).
    expect(await note.evaluate(textContrast), `${width}px: contrast`).toBeGreaterThanOrEqual(7);
    if (width === 390) expect((await wrapsBetween(note, PHRASES.topPause)).lines).toEqual(["実サイトの取得は、いまお休み中です。", "デモなら入力なしで、すぐに試せます。"]);
  }
  await expect(page.locator("section[aria-labelledby=try-title] p", { hasText: "使う前に、権利者の許諾" })).toHaveText(`${PAUSE_LEAD}使う前に、権利者の許諾と対象サイトの規約を確認してください。`);
  await page.goto("/demo");
  const next = page.locator(".demo-next");
  await expect(next).toContainText(PAUSE_LEAD);
  await expect(next).not.toContainText("実際のページは");
  await expect(next.getByRole("link", { name: "自分のURLで使う" })).toHaveAttribute("href", "/app");
  expect(watch.external).toEqual([]);
});

test("paused wording: /, /app and /demo say the pause one way, with no '止めています', nothing that reads as fetching now and none of the old pilot wording; the band does not say '実際のサイト'", async ({ page }) => {
  await fakeTurnstile(page);
  for (const path of ["/", "/app", "/demo"]) {
    await page.goto(path);
    const text = await page.locator("body").innerText();
    expect(text.includes(PAUSE_WORDS), `${path}: the pause is said`).toBe(true);
    expect([...FETCH_NOW, "止めています"].filter(item => text.includes(item)), path).toEqual([]);
    for (const word of OLD_WORDING) expect(text.includes(word), `${path}: ${word}`).toBe(false);
  }
  await page.goto("/app");
  await pressStart(page);
  const band = await bandBox(page).innerText();
  expect(["止めています", "実際のサイト"].filter(item => band.includes(item)), band).toEqual([]);
});

for (const [width, height] of [[390, 844], [1440, 900]] as const) {
  test(`paused layout at ${width}×${height}: no sideways scrolling and no accessibility violations on /app (the note, then the pause in the band) and on /; the note is readable and the field, the rights note and the main button stay on the first screen`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const watch = await watchPage(page);
    await fakeTurnstile(page);
    const check = async (name: string, wcagOnly: boolean) => {
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0); });
      await page.screenshot({ path: `.agent-harness/evidence/impl-demo-only-${name}-${width}.png`, fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: no sideways scrolling`).toBe(true);
      const axe = wcagOnly ? new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]) : new AxeBuilder({ page });
      expect((await axe.analyze()).violations.map(item => ({ name, id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
    };
    const readable = async (target: Locator, label: string) => {
      // Body text on a phone is 14px or more (UI scoring round 2), 12px elsewhere; the words keep 4.5:1.
      expect(await target.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), `${label} size`).toBeGreaterThanOrEqual(width <= 390 ? 14 : 12);
      expect(await target.evaluate(textContrast), `${label} contrast`).toBeGreaterThanOrEqual(4.5);
    };

    await page.goto("/app");
    await page.waitForLoadState("networkidle");
    const note = page.locator("#pause-note");
    await readable(note, "note");
    const panel = await page.locator(".entry-panel").boundingBox();
    const noteBox = await page.locator(".pause-note").boundingBox();
    expect(panel && noteBox && noteBox.x >= panel.x && noteBox.x + noteBox.width <= panel.x + panel.width, "the note fits the URL card").toBe(true);
    for (const [label, target] of [["note", page.locator(".pause-note")], ["field", page.locator(".url-field")], ["rights note", page.locator("#rights-note")], ["main button", page.getByRole("button", { name: "素材を見つける", exact: true })]] as const) {
      const box = await target.boundingBox();
      expect(box && box.y + box.height <= height, `${label} on the first screen: ${JSON.stringify(box)}`).toBe(true);
    }
    await check("app-idle", true);

    await pressStart(page);
    await expect(pausedBox(page)).toBeFocused();
    await check("app-paused", true);

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await readable(heroNote(page), "top sentence");
    // The settled page, not Chromium's transient video controls (intro.spec).
    await page.waitForTimeout(1_800);
    await check("landing", false);
    expect(watch.external).toEqual([]);
  });
}

test("paused wrapping at 390×844: the note, the rights note, the notes under the card, the band's estimate, the top page's note and /demo's line wrap only between phrases; each sentence of the note starts a line, the 目安 label starts its sentence's line, and the lock stays with its first line", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fakeTurnstile(page);
  const wraps: Record<string, Awaited<ReturnType<typeof wrapsBetween>>> = {};
  const locks: Record<string, Awaited<ReturnType<typeof lockPlacement>> & { centred: boolean }> = {};
  /** The lock and every line of the note under the card sit in the middle together. */
  const lockOf = async (name: string, phrases: readonly string[]) => {
    const under = page.locator(".privacy-note");
    wraps[name] = await wrapsBetween(under, phrases);
    const lock = await under.evaluate(lockPlacement);
    const edges = await under.locator("p").evaluate(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { left: rect.left + parseFloat(style.paddingLeft), right: rect.right - parseFloat(style.paddingRight) };
    });
    const lines = wraps[name].boxes.map((line, index) => ({ left: index === 0 && lock.found ? lock.iconLeft : line.left, right: line.right }));
    locks[name] = { ...lock, centred: lines.every(line => Math.abs((line.left - edges.left) - (edges.right - line.right)) <= 2) };
  };
  await page.goto("/app");
  wraps.note = await wrapsBetween(page.locator("#pause-note"), PHRASES.pause);
  wraps.rights = await wrapsBetween(page.locator("#rights-note"), PHRASES.rights);
  await lockOf("privacy", PHRASES.privacy);
  await pressStart(page);
  wraps.estimate = await wrapsBetween(bandBox(page).locator(".status-estimate"), ["目安再開の時期は", "未定です。"]);
  await page.goto("/");
  wraps.top = await wrapsBetween(heroNote(page), PHRASES.topPause);
  await page.goto("/demo");
  wraps.demoNext = await wrapsBetween(page.locator(".demo-next > span"), ["実サイトの取得は、", "いまお休み中です。"]);
  await lockOf("privacyDemo", PHRASES.privacyDemo);
  // The words are the phrases joined, and every line starts where a phrase does (soft: both are reported).
  expect.soft(Object.fromEntries(Object.entries(wraps).map(([name, seen]) => [name, seen.text]))).toEqual({
    note: PHRASES.pause.join(""), rights: PHRASES.rights.join(""), privacy: PHRASES.privacy.join(""), estimate: `目安${PAUSED_ESTIMATE}`,
    top: PHRASES.topPause.join(""), demoNext: PAUSE_LEAD, privacyDemo: PHRASES.privacyDemo.join(""),
  });
  expect(Object.entries(wraps).filter(([, seen]) => seen.outside.length > 0).map(([name, seen]) => `${name}: ${seen.outside.join(", ")} (${seen.lines.join(" ／ ")})`)).toEqual([]);
  // Each sentence of the note and of the rights note starts a line; the top page's note is one sentence a line.
  expect(wraps.note.boxes.some(line => line.start === PAUSE_LEAD.length), wraps.note.lines.join(" ／ ")).toBe(true);
  expect(wraps.rights.boxes.some(line => line.start === "取得できても、再利用の許諾ではありません。".length), wraps.rights.lines.join(" ／ ")).toBe(true);
  expect(wraps.top.lines).toEqual(["実サイトの取得は、いまお休み中です。", "デモなら入力なしで、すぐに試せます。"]);
  // The lock: on the first line, right before its first word, and centred with the lines below it.
  for (const [name, lock] of Object.entries(locks)) {
    expect({ found: lock.found, onFirstLine: lock.onFirstLine, nextToWords: lock.gap >= 0 && lock.gap <= 12, centred: lock.centred }, `${name}: ${JSON.stringify(lock)} ${wraps[name].lines.join(" ／ ")}`)
      .toEqual({ found: true, onFirstLine: true, nextToWords: true, centred: true });
  }
});
