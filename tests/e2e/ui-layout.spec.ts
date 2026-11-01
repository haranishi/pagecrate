import { test, expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { POLICY_SUMMARY } from "../../src/lib/policy-content";
import { API_MESSAGES } from "../../src/lib/api";
import { acknowledgePolicy, buttonGeometry, delay, DEMO_BUTTON, fakeTurnstile, liveScan, lockPlacement, PAGE_URL, palette, PAUSE_WORDS, PHRASES, replacePreviews, RIGHTS_NOTE, scanPage, wrapsBetween, zipWith } from "./support";

// UI scoring round 1: the policy check on short screens, the status band
// and the fixed selection bar, text sizes, Japanese line breaking and one shared header. Round 2 (impl-ui-fix-r2.md):
// the checkbox in the check's fixed part, expiry by the clock alone, the top page's width, processing buttons, 14px
// text on phones, the closing note, the width filter's words and keyboard focus rings. Live scans and previews are
// answered with page.route; the bot check is the fake (support.ts). The countdown of a waiting retry is in status.spec.ts.

const GATE = "使う前に、プライバシーポリシーをお読みください";
const GATE_HELP = "チェックを入れると「進む」を押せます。";
const BUSY = { code: "BUSY", message: "混み合っています。少し待ってから、もう一度お試しください。", retryAfterSec: 30 };
const PAGES = ["/", "/demo", "/app", "/terms", "/privacy", "/cookies"] as const;

interface Box { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number }
const boxOf = (locator: Locator): Promise<Box> => locator.evaluate(element => {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
});
const inside = (inner: Box, outer: Box) => inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5 && inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5;
const axeViolations = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }));
const setFakeTurnstile = (page: Page, settings: { hold: boolean }) => page.evaluate(value => { (window as unknown as { __fakeTurnstileSettings: object }).__fakeTurnstileSettings = value; }, settings);

/** WCAG contrast of an element's text against the backgrounds painted behind it (its own included). Runs in the page. */
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

/**
 * Round 2: the checkbox, its note and the two buttons of the policy check. Each must be inside the dialog and the
 * screen, show itself at its centre and at four points 5px in from its corners (nothing covers it), and not overlap
 * the others. Runs in the page.
 */
function gateSight(dialog: Element, help: string) {
  const note = [...dialog.querySelectorAll("p")].find(element => element.textContent === help) ?? null;
  const found: (Element | null)[] = [dialog.querySelector("label"), note, ...dialog.querySelectorAll("button")];
  const targets = found.filter((element): element is Element => element !== null);
  const frame = dialog.getBoundingClientRect();
  const rows = targets.map(element => {
    const rect = element.getBoundingClientRect();
    const within = rect.top >= frame.top - 0.5 && rect.bottom <= frame.bottom + 0.5 && rect.left >= frame.left - 0.5 && rect.right <= frame.right + 0.5 && rect.top >= -0.5 && rect.bottom <= window.innerHeight + 0.5;
    const points: [number, number][] = [[(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2], [rect.left + 5, rect.top + 5], [rect.right - 5, rect.top + 5], [rect.left + 5, rect.bottom - 5], [rect.right - 5, rect.bottom - 5]];
    const covered = points.filter(([x, y]) => { const hit = document.elementFromPoint(x, y); return hit === null || !(hit === element || element.contains(hit)); }).length;
    return { name: (element.textContent ?? "").trim().slice(0, 14), rect, within, covered };
  });
  const overlaps: string[] = [];
  for (let a = 0; a < rows.length; a++) for (let b = a + 1; b < rows.length; b++) {
    const [one, two] = [rows[a].rect, rows[b].rect];
    if (one.left < two.right - 0.5 && two.left < one.right - 0.5 && one.top < two.bottom - 0.5 && two.top < one.bottom - 0.5) overlaps.push(`${rows[a].name} × ${rows[b].name}`);
  }
  return {
    frame: `${Math.round(frame.top)}–${Math.round(frame.bottom)}`,
    count: rows.length,
    bad: rows.filter(row => !row.within || row.covered > 0).map(row => `${row.name} ${Math.round(row.rect.top)}–${Math.round(row.rect.bottom)}${row.within ? "" : " outside"}${row.covered ? ` covered at ${row.covered}/5 points` : ""}`),
    overlaps,
  };
}

/** The focused element is inside the dialog and shows itself at its centre (the fixed part does not cover it). */
function focusInSight(dialog: Element): string {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !dialog.contains(active)) return "the focus is outside the dialog";
  const rect = active.getBoundingClientRect();
  const frame = dialog.getBoundingClientRect();
  const hit = document.elementFromPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2);
  const onTop = hit !== null && (hit === active || active.contains(hit));
  const within = rect.top >= frame.top - 0.5 && rect.bottom <= frame.bottom + 0.5;
  return onTop && within ? "ok" : `${active.tagName.toLowerCase()} 「${(active.textContent ?? "").trim().slice(0, 12)}」 ${Math.round(rect.top)}–${Math.round(rect.bottom)}, dialog ${Math.round(frame.top)}–${Math.round(frame.bottom)}, ${onTop ? "on top" : `covered by ${hit?.tagName.toLowerCase()}`}`;
}

// 1. The policy check fits short screens: the buttons stay in sight and the body scrolls. Round 2: the checkbox and its
// note are in the fixed part above the buttons, so the required step is never hidden (review-ui-r2, finding 3).
for (const [width, height] of [[390, 844], [360, 640], [1280, 720]] as const) {
  test(`policy check at ${width}×${height}: the checkbox, its note and both buttons are wholly in sight, apart and uncovered; a cue shows while more is below; Tab goes heading → full text → checkbox → やめる → 進む and the keyboard rules hold`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const turnstile = await fakeTurnstile(page);
    await page.goto("/app");
    await page.getByLabel("素材を集めたいページのURL", { exact: true }).fill(PAGE_URL);
    const start = page.getByRole("button", { name: "素材を見つける", exact: true });
    await start.click();
    const dialog = page.getByRole("dialog", { name: GATE });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: GATE })).toBeFocused();
    const screen: Box = { top: 0, left: 0, bottom: height, right: width };
    const buttons = [dialog.getByRole("button", { name: "やめる" }), dialog.getByRole("button", { name: "進む" })];
    const row = buttons[0].locator("xpath=..");
    // Round 2: the fixed part holds the checkbox, its note and the row of buttons.
    const fixedPart = buttons[0].locator("xpath=../..");
    const expectGateInSight = async (moment: string) => {
      const sight = await dialog.evaluate(gateSight, GATE_HELP);
      expect(sight.count, moment).toBe(4);
      expect({ bad: sight.bad, overlaps: sight.overlaps }, `${moment}: dialog ${sight.frame}, screen 0–${height}`).toEqual({ bad: [], overlaps: [] });
    };
    const expectButtonsInSight = async (moment: string) => {
      const frame = await boxOf(dialog);
      for (const button of buttons) {
        const own = await boxOf(button);
        const where = `${moment} 「${await button.textContent()}」: button ${Math.round(own.top)}–${Math.round(own.bottom)}, dialog ${Math.round(frame.top)}–${Math.round(frame.bottom)}, screen 0–${height}`;
        expect(inside(own, frame) && inside(own, screen), where).toBe(true);
      }
    };
    await expectGateInSight("opened");
    await expectButtonsInSight("opened");
    // While the body has more below, the fixed part shows a cue (a shadow over the text); at the end it does not.
    const cue = () => fixedPart.evaluate(element => getComputedStyle(element).boxShadow !== "none");
    const scrollable = await dialog.evaluate(element => element.scrollHeight > element.clientHeight + 1);
    if (scrollable) {
      expect(await cue(), "a cue while more is below").toBe(true);
      await dialog.evaluate(element => element.scrollTo({ top: element.scrollHeight, behavior: "instant" }));
      await expect.poll(cue, { message: "no cue at the end" }).toBe(false);
      await expectGateInSight("scrolled to the end");
      await expectButtonsInSight("scrolled to the end");
      await dialog.evaluate(element => element.scrollTo({ top: 0, behavior: "instant" }));
    } else {
      expect(await cue(), "no cue when nothing is hidden").toBe(false);
    }
    // Tab from the heading: the full text, the checkbox (Space ticks it), "やめる", then "進む", each in sight.
    const checkbox = dialog.getByRole("checkbox", { name: "プライバシーポリシーを読みました" });
    const order = [dialog.getByRole("link", { name: /^プライバシーポリシーの全文を読む/ }), checkbox, buttons[0], buttons[1]];
    for (const [index, target] of order.entries()) {
      await page.keyboard.press("Tab");
      await expect(target).toBeFocused();
      expect(await dialog.evaluate(focusInSight), `Tab ${index + 1}`).toBe("ok");
      if (target === checkbox) {
        // Its focus ring is not hidden under the row of buttons either.
        const [checkBox, rowBox, frame] = [await boxOf(checkbox), await boxOf(row), await boxOf(dialog)];
        expect(checkBox.bottom + 7 <= rowBox.top + 0.5 && checkBox.top - 7 >= frame.top - 0.5, `checkbox ${Math.round(checkBox.top)}–${Math.round(checkBox.bottom)}, buttons from ${Math.round(rowBox.top)}, dialog from ${Math.round(frame.top)}`).toBe(true);
        await page.keyboard.press("Space");
        await expect(checkbox).toBeChecked();
      }
    }
    await expectGateInSight("ticked");
    expect(await axeViolations(page)).toEqual([]);
    // Tab stays inside both ways; Esc and "やめる" close it, start nothing, and give the focus back.
    for (const key of [...Array<string>(7).fill("Tab"), ...Array<string>(7).fill("Shift+Tab")]) {
      await page.keyboard.press(key);
      expect(await dialog.evaluate(element => element.contains(document.activeElement)), key).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(start).toBeFocused();
    await start.click();
    await dialog.getByRole("button", { name: "やめる" }).click();
    await expect(dialog).toBeHidden();
    await expect(start).toBeFocused();
    expect(turnstile.requests).toEqual([]);
  });
}

/** The target is wholly on screen and ends above the fixed selection bar (smooth scrolling is waited out). */
async function expectClearOfBar(target: Locator, label: string) {
  await expect.poll(async () => {
    const at = await target.evaluate(element => {
      const own = element.getBoundingClientRect();
      const bar = document.querySelector(".selection-bar")?.getBoundingClientRect();
      return { top: Math.round(own.top), bottom: Math.round(own.bottom), screen: window.innerHeight, barTop: bar ? Math.round(bar.top) : null };
    });
    const onScreen = at.top >= 0 && at.bottom <= at.screen;
    const clearOfBar = at.barTop !== null && at.bottom <= at.barTop;
    return `${onScreen && clearOfBar ? "ok" : "NG"} ${label}: box ${at.top}–${at.bottom}, screen 0–${at.screen}, selection bar from ${at.barTop}`;
  }, { timeout: 3_000 }).toMatch(/^ok /);
}

// 2. With two selected, a new status band is brought fully into sight above the bar; the end of the page clears it too.
// Round 2: an expiry by the clock alone no longer moves the page (the test after the round 1 tests).
for (const [width, height, reducedMotion] of [[390, 844, true], [360, 640, true], [1440, 900, false]] as const) {
  test(`status band at ${width}×${height}: crowded, scanning and the held bot check each show wholly on screen and clear of the selection bar`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
    await acknowledgePolicy(page);
    await fakeTurnstile(page);
    await replacePreviews(page);
    let answer: "result" | "busy" = "result";
    let hold = false;
    let release: () => void = () => undefined;
    await page.route("**/api/scan", async route => {
      if (hold) await new Promise<void>(resolve => { release = resolve; });
      if (answer === "busy") return route.fulfill({ status: 503, json: BUSY });
      return route.fulfill({ json: liveScan() });
    });
    await page.goto("/app");
    await scanPage(page);
    await expect(page.locator(".asset-card")).toHaveCount(9);
    const selectTwo = async () => {
      for (const index of [0, 1]) await page.locator(".asset-card .asset-selection").nth(index).click();
      await expect(page.locator(".selection-bar")).toBeVisible();
    };
    await selectTwo();
    const band = page.locator(".status-band");
    // The visitor goes back up to the field and presses the main button again.
    const startAtTop = async () => {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.getByRole("button", { name: "素材を見つける", exact: true }).click();
    };

    answer = "busy";
    await startAtTop();
    const crowded = band.getByRole("group", { name: "混み合っています" });
    await expect(crowded).toBeFocused();
    await expectClearOfBar(crowded, "crowded");

    hold = true;
    await startAtTop();
    const progress = band.locator(".scan-progress");
    await expect(progress).toBeVisible();
    await expectClearOfBar(progress, "scanning");
    hold = false;
    release();
    await expect(band.getByRole("group", { name: "混み合っています" })).toBeFocused();

    await setFakeTurnstile(page, { hold: true });
    await startAtTop();
    const check = band.locator(".bot-check");
    await expect(check.getByText("試験用のボット確認")).toBeVisible();
    await expectClearOfBar(check, "bot check");
    await check.getByRole("button", { name: "待機をやめる" }).click();
    await setFakeTurnstile(page, { hold: false });
    // The selection made at the start is still there.
    await expect(page.locator(".selection-bar")).toBeVisible();

    // The end of the page (sharing and the documents) is not left under the bar.
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await expectClearOfBar(page.getByRole("region", { name: "PageCrate を共有する" }), "share at the end");
    await expectClearOfBar(page.locator(".site-footer .legal-links"), "documents at the end");
  });
}

interface TextRow { readonly size: number; readonly hidden: boolean; readonly body: boolean; readonly text: string; readonly where: string }

/**
 * Every text shown on the page, with its computed size. `hidden`: inside aria-hidden (a picture's text), except the
 * countdowns that are shown to everyone and announced separately. `body`: inside p, li, label, summary, a or button and
 * not a badge, a format chip or a small heading inside a card. Form fields count as body text.
 */
function shownText(): TextRow[] {
  const exempt = ".status-label, .demo-badge, .filter-tab > span, .download-count, .asset-format, .unsupported-label, .selected-label, .asset-kind-row, .detail-label";
  const informative = ".status-wait, .button-wait, .preview-wait-line";
  const rows: TextRow[] = [];
  const shown = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return rect.width >= 2 && rect.height >= 2 && element.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true });
  };
  const where = (element: Element) => `${element.tagName.toLowerCase()}${typeof element.className === "string" && element.className ? `.${element.className.split(/\s+/)[0]}` : ""}`;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    const element = node.parentElement;
    if (!text || !element || ["SCRIPT", "STYLE", "NOSCRIPT", "OPTION"].includes(element.tagName)) continue;
    // Not shown: visually hidden text, the skip link off screen, the video's fallback text.
    if (element.closest(".sr-only, .skip-link, video") || !shown(element)) continue;
    rows.push({
      size: parseFloat(getComputedStyle(element).fontSize),
      hidden: element.closest("[aria-hidden=true]") !== null && element.closest(informative) === null,
      body: element.closest("p, li, label, summary, a, button") !== null && element.closest(exempt) === null,
      text: text.slice(0, 24), where: where(element),
    });
  }
  for (const field of document.querySelectorAll("input:not([type=checkbox]), select")) {
    if (shown(field)) rows.push({ size: parseFloat(getComputedStyle(field).fontSize), hidden: false, body: true, text: `(${field.tagName.toLowerCase()})`, where: where(field) });
  }
  return rows;
}

/**
 * Text under the rule: 12px everywhere, 10px for a picture's text, and for body text at 390px and below 14px
 * (round 2; round 1 asked for 13px).
 */
async function expectReadableText(page: Page, width: number, label: string) {
  const rows = await page.evaluate(shownText);
  expect(rows.length, label).toBeGreaterThan(10);
  const small = rows.filter(row => row.hidden ? row.size < 10 : row.size < 12 || (width <= 390 && row.body && row.size < 14));
  // Soft: every page and state is listed in one run.
  expect.soft(small.map(row => `${label}: ${row.size}px ${row.where} 「${row.text}」`)).toEqual([]);
  // The larger text on phones must not push anything out sideways or break the accessibility rules.
  expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label}: no sideways scrolling`).toBe(true);
  if (width <= 390) expect.soft(await axeViolations(page), `${label}: axe`).toEqual([]);
}

// 3. Text sizes on every screen and state.
for (const width of [390, 768, 1440]) {
  test(`text size at ${width}px: no shown text under 12px (14px for body text at 390px, 10px in pictures; the video card's words 12px at 4.5:1) on the pages, the check, a result and each band`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const path of ["/", "/demo", "/app"]) {
      await page.goto(path);
      await expectReadableText(page, width, path);
    }
    await fakeTurnstile(page);
    await replacePreviews(page);
    let answer: "result" | "busy" | "expiring" = "result";
    let hold = false;
    let release: () => void = () => undefined;
    await page.route("**/api/scan", async route => {
      if (hold) await new Promise<void>(resolve => { release = resolve; });
      if (answer === "busy") return route.fulfill({ status: 503, json: BUSY });
      return route.fulfill({ json: liveScan(answer === "expiring" ? { expiresInMs: 2_000 } : {}) });
    });
    await page.goto("/app");
    await page.getByLabel("素材を集めたいページのURL", { exact: true }).fill(PAGE_URL);
    const start = page.getByRole("button", { name: "素材を見つける", exact: true });
    await start.click();
    await expect(page.getByRole("dialog", { name: GATE })).toBeVisible();
    await expectReadableText(page, width, "policy check");
    await page.getByRole("checkbox", { name: "プライバシーポリシーを読みました" }).check();
    await page.getByRole("button", { name: "進む" }).click();
    await expect(page.locator(".asset-card")).toHaveCount(9);
    for (const index of [0, 1]) await page.locator(".asset-card .asset-selection").nth(index).click();
    await page.locator(".asset-details").first().evaluate(element => { (element as HTMLDetailsElement).open = true; });
    await expectReadableText(page, width, "result with two selected");
    // The video card's words (in the picture, so aria-hidden) are still read by sighted people: 12px and 4.5:1.
    const caption = page.locator(".video-caption", { hasText: "動画ファイル" });
    expect.soft(await caption.evaluate(element => parseFloat(getComputedStyle(element).fontSize)), "「動画ファイル」 size").toBeGreaterThanOrEqual(12);
    expect.soft(await caption.evaluate(textContrast), "「動画ファイル」 contrast").toBeGreaterThanOrEqual(4.5);
    answer = "busy";
    await start.click();
    await expect(page.locator(".status-band").getByRole("group", { name: "混み合っています" })).toBeVisible();
    await expectReadableText(page, width, "crowded");
    hold = true;
    await start.click();
    await expect(page.locator(".scan-progress")).toBeVisible();
    await expectReadableText(page, width, "scanning");
    hold = false;
    release();
    await setFakeTurnstile(page, { hold: true });
    await start.click();
    await expect(page.locator(".bot-check").getByText("試験用のボット確認")).toBeVisible();
    await expectReadableText(page, width, "bot check");
    await page.locator(".bot-check").getByRole("button", { name: "待機をやめる" }).click();
    await setFakeTurnstile(page, { hold: false });
    answer = "expiring";
    await start.click();
    await expect(page.locator(".status-band").getByRole("group", { name: "取得から30分が過ぎました" })).toBeVisible({ timeout: 6_000 });
    await expectReadableText(page, width, "expired");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scrolling").toBe(true);
  });
}

// 4. Japanese line breaking: by phrase and strictly (no prolonged sound mark or small kana at a line start). Body text
// is "pretty" only where auto-phrase is unknown: Chromium breaks inside phrases when the two meet (globals.css).
test("line breaking: the body breaks by phrase and strictly, headings balance; the rights note and the policy check break only between phrases, with the same words", async ({ page }) => {
  const styleOf = (selector: string) => page.locator(selector).first().evaluate(element => {
    const style = getComputedStyle(element);
    return { lineBreak: style.getPropertyValue("line-break"), wordBreak: style.getPropertyValue("word-break"), overflowWrap: style.getPropertyValue("overflow-wrap"), textWrapStyle: style.getPropertyValue("text-wrap-style") };
  });
  for (const path of ["/", "/app", "/terms"]) {
    await page.goto(path);
    expect(await styleOf("body"), path).toMatchObject({ lineBreak: "strict", wordBreak: "auto-phrase", overflowWrap: "break-word" });
    for (const heading of ["h1", "h2"]) expect((await styleOf(heading)).textWrapStyle, `${path} ${heading}`).toBe("balance");
    const phraseAware = await page.evaluate(() => CSS.supports("word-break", "auto-phrase"));
    expect((await styleOf("main p")).textWrapStyle, `${path} p`).toBe(phraseAware ? "auto" : "pretty");
  }
  await fakeTurnstile(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  // A line seen broken in the middle of a word ("1ペー／ジずつ") when "pretty" was on: it stays whole. (Where it may
  // wrap at all is checked with the other notes of the URL card, at the end of this file.)
  const help = await wrapsBetween(page.locator("#url-help"), PHRASES.urlHelp);
  expect(help.lines.some(line => line.includes("1ページずつ")), help.lines.join(" ／ ")).toBe(true);
  const note = page.locator("#rights-note");
  await expect(note).toHaveText(RIGHTS_NOTE);
  const breaksOf = (locator: Locator) => locator.evaluate(element => ({ wbr: element.querySelectorAll("wbr").length, wordBreak: getComputedStyle(element.querySelector("wbr")?.parentElement ?? element).wordBreak }));
  expect(await breaksOf(note)).toMatchObject({ wordBreak: "keep-all" });
  // A <wbr> between the phrases inside each of its two sentences (PHRASES.rights: 2 + 4).
  expect((await breaksOf(note)).wbr).toBe(4);
  await page.getByLabel("素材を集めたいページのURL", { exact: true }).fill(PAGE_URL);
  await page.getByRole("button", { name: "素材を見つける", exact: true }).click();
  const items = page.getByRole("dialog", { name: GATE }).getByRole("listitem");
  await expect(items).toHaveText([...POLICY_SUMMARY]);
  for (const item of await items.all()) {
    const breaks = await breaksOf(item);
    expect(breaks.wordBreak, await item.textContent() ?? "").toBe("keep-all");
    expect(breaks.wbr, await item.textContent() ?? "").toBeGreaterThanOrEqual(4);
  }
});

// 5. One header on every page.
for (const width of [1440, 390]) {
  test(`header at ${width}px: the six pages share one header (logo, height, rule and the same two links), and the current page's link says so`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    type Rect = readonly [number, number, number, number];
    interface Row { readonly path: string; readonly header: Rect | null; readonly rule: string; readonly logo: Rect | null; readonly demo: Rect | null; readonly collect: Rect | null; readonly current: string[] }
    const rectOf = async (locator: Locator): Promise<Rect | null> => (await locator.count()) !== 1 ? null : locator.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)] as const;
    });
    const rows: Row[] = [];
    for (const path of PAGES) {
      await page.goto(path);
      const header = page.getByRole("banner");
      const nav = header.getByRole("navigation", { name: "メイン" });
      rows.push({
        path,
        header: await rectOf(header),
        rule: await header.evaluate(element => `${getComputedStyle(element).borderBottomWidth} ${getComputedStyle(element).borderBottomStyle} ${getComputedStyle(element).borderBottomColor}`),
        logo: await rectOf(header.getByRole("link", { name: "PageCrate ホーム" })),
        demo: await rectOf(nav.getByRole("link", { name: "デモ", exact: true })),
        collect: await rectOf(nav.getByRole("link", { name: "素材を集める", exact: true })),
        current: await header.locator("[aria-current=page]").evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label") ?? node.textContent?.trim() ?? "")),
      });
    }
    const first = rows[0];
    const same = (a: Rect | null, b: Rect | null) => a !== null && b !== null && a.every((value, index) => Math.abs(value - b[index]) <= 1);
    const report = rows.map(row => ({ path: row.path, header: same(row.header, first.header), rule: row.rule === first.rule, logo: same(row.logo, first.logo), demo: same(row.demo, first.demo), collect: same(row.collect, first.collect) }));
    expect(report, JSON.stringify(rows)).toEqual(PAGES.map(path => ({ path, header: true, rule: true, logo: true, demo: true, collect: true })));
    expect(first.rule).toMatch(/^1px solid/);
    expect(rows.map(row => [row.path, row.current])).toEqual([["/", ["PageCrate ホーム"]], ["/demo", ["デモ"]], ["/app", ["素材を集める"]], ["/terms", []], ["/privacy", []], ["/cookies", []]]);
  });
}

// ---- UI scoring round 2 ----

const CLOCK_EXPIRED_LINE = "取得から30分が過ぎました。もう一度取得してください。";
const SERVER_EXPIRED = "取得から30分が過ぎたため、この結果は使えません。もう一度ページを取得してください。";

// R2-2. Expiry by the clock alone never moves the page: the selection bar says so where the visitor is looking, the
// band shows it and announces it, and nothing takes the focus. A save the server answers EXPIRED still moves to the band.
for (const [width, height] of [[390, 844], [1440, 900]] as const) {
  test(`expiry while reading at ${width}×${height}: the list in view stays put, the selection bar and the band say so and nothing takes the focus; a save answered EXPIRED moves to the band`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    // Instant scrolling: a move to the band would be seen at once.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await acknowledgePolicy(page);
    await fakeTurnstile(page);
    await replacePreviews(page);
    let scans = 0;
    await page.route("**/api/scan", route => {
      scans += 1;
      // The first result expires on this device four seconds after it is made.
      return route.fulfill({ json: liveScan(scans === 1 ? { expiresInMs: 4_000 } : {}) });
    });
    let downloads = 0;
    await page.route("**/api/download", route => {
      downloads += 1;
      return route.fulfill({ status: 410, json: { code: "EXPIRED", message: SERVER_EXPIRED } });
    });
    await page.goto("/app");
    await scanPage(page);
    await expect(page.locator(".asset-card")).toHaveCount(9);
    const selectTwo = async () => { for (const index of [0, 1]) await page.locator(".asset-card .asset-selection").nth(index).click(); };
    await selectTwo();
    const bar = page.getByRole("complementary", { name: "選択した素材を保存" });
    const band = page.locator(".status-band");
    const expired = band.getByRole("group", { name: "取得から30分が過ぎました" });
    await expect(expired).toHaveCount(0);
    // Down in the list, past the band (scrollY 600 or more), the focus on a card's "出典と詳細" (usable after expiry).
    await page.locator(".asset-card summary").nth(2).evaluate(element => (element as HTMLElement).focus({ preventScroll: true }));
    await page.evaluate(() => {
      const band = document.querySelector(".status-band")!.getBoundingClientRect();
      window.scrollTo({ top: Math.max(700, window.scrollY + band.bottom + 300), behavior: "instant" });
    });
    const view = () => page.evaluate(() => {
      const card = [...document.querySelectorAll(".asset-card")].find(element => element.getBoundingClientRect().bottom > 0);
      const strip = document.querySelector(".status-band")!.getBoundingClientRect();
      return { scrollY: window.scrollY, card: card?.getAttribute("aria-labelledby") ?? "", cardTop: card?.getBoundingClientRect().top ?? NaN, bandBottom: strip.bottom, bandHeight: strip.height, focus: (document.activeElement?.textContent ?? "").trim() };
    });
    const before = await view();
    expect(before.scrollY).toBeGreaterThanOrEqual(600);
    expect(before.bandBottom, "the band is above the screen while the list is read").toBeLessThanOrEqual(0);
    // The band shows it (and announces it)...
    await expect(expired).toBeVisible({ timeout: 8_000 });
    await expect(band.locator(":scope > [role=status]").first()).toContainText("取得から30分が過ぎました。もう一度取得すると");
    await delay(500);
    const after = await view();
    // ...but the page is not moved to it: the card in view stays where it was, and the band stays above the screen.
    // scrollY moves only by what grew above the screen (the band and its margins): the browser keeps the content in
    // view in place, and nothing scrolls toward the band.
    const grewAbove = (after.cardTop + after.scrollY) - (before.cardTop + before.scrollY);
    const report = {
      sameCard: after.card === before.card,
      cardStays: Math.abs(after.cardTop - before.cardTop) <= 1,
      bandAboveScreen: after.bandBottom <= 0,
      scrollOnlyByWhatGrewAbove: after.bandHeight > before.bandHeight && grewAbove > 0 && Math.abs((after.scrollY - before.scrollY) - grewAbove) <= 1,
      focusKept: after.focus === "出典と詳細" && await band.evaluate(element => !element.contains(document.activeElement)),
    };
    expect(report, JSON.stringify({ before, after })).toEqual({ sameCard: true, cardStays: true, bandAboveScreen: true, scrollOnlyByWhatGrewAbove: true, focusKept: true });
    // Where the visitor is looking, the selection bar says it; its button is "もう一度取得".
    await expect(bar.locator("p")).toHaveText(CLOCK_EXPIRED_LINE);
    await expect(bar.getByRole("button", { name: "もう一度取得" })).toBeVisible();

    // A save the server answers EXPIRED answers what the visitor did: the band comes into sight above the bar, focused.
    await bar.getByRole("button", { name: "もう一度取得" }).click();
    await expect.poll(() => scans).toBe(2);
    await expect(expired).toHaveCount(0);
    await expect(page.locator(".asset-card")).toHaveCount(9);
    await selectTwo();
    await page.evaluate(() => {
      const band = document.querySelector(".status-band")!.getBoundingClientRect();
      window.scrollTo({ top: Math.max(700, window.scrollY + band.bottom + 300), behavior: "instant" });
    });
    expect(await band.evaluate(element => element.getBoundingClientRect().bottom), "the band is above the screen before the save").toBeLessThanOrEqual(0);
    await bar.getByRole("button", { name: /ZIPで保存/ }).click();
    const refused = band.getByRole("group", { name: "取得から30分が過ぎました" });
    await expect(refused).toBeFocused();
    await expect(refused).toContainText(SERVER_EXPIRED);
    await expectClearOfBar(refused, "a save answered EXPIRED");
    expect(downloads).toBe(1);
  });
}

// R2-3. The top page's body uses the header's width: the logo and the first left-aligned heading start at the same x.
for (const width of [1440, 768, 390]) {
  test(`top page at ${width}px: the logo and the heading of the tour section ("操作の動画") start at the same x, and every section and the footer share the header's edges`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const edges = await page.evaluate(() => {
      const header = document.querySelector(".site-header")!.getBoundingClientRect();
      const logo = document.querySelector(".site-header .brand")!.getBoundingClientRect().left;
      const range = document.createRange();
      range.selectNodeContents(document.getElementById("tour-title")!);
      const heading = range.getClientRects()[0].left;
      const parts = [...document.querySelectorAll("main > section, main ~ section, body footer")].map(element => {
        const rect = element.getBoundingClientRect();
        return { part: element.querySelector("h1, h2")?.textContent?.slice(0, 8) ?? element.tagName.toLowerCase(), left: Math.round(rect.left), right: Math.round(rect.right) };
      });
      return { header: [Math.round(header.left), Math.round(header.right)], logo: Math.round(logo), heading: Math.round(heading), parts };
    });
    expect(Math.abs(edges.logo - edges.heading), JSON.stringify(edges)).toBeLessThanOrEqual(1);
    expect(edges.parts.length).toBeGreaterThanOrEqual(7);
    expect(edges.parts.filter(item => Math.abs(item.left - edges.header[0]) > 1 || Math.abs(item.right - edges.header[1]) > 1), JSON.stringify(edges)).toEqual([]);
  });
}

// R2-4. A button at work keeps the usual dark green (4.5:1 or more) and says so with its spinner; it cannot be pressed
// (aria-disabled), and pressing it does nothing.
test("processing buttons: during the bot check, a scan, a ZIP and the demo, the spinner sits on the usual dark green at 4.5:1 or more, and pressing again sends nothing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await acknowledgePolicy(page);
  await fakeTurnstile(page);
  await replacePreviews(page);
  let holdScan = true;
  let releaseScan: () => void = () => undefined;
  let scans = 0;
  await page.route("**/api/scan", async route => {
    scans += 1;
    if (holdScan) await new Promise<void>(resolve => { releaseScan = resolve; });
    return route.fulfill({ json: liveScan() });
  });
  let holdZip = true;
  let releaseZip: () => void = () => undefined;
  let downloads = 0;
  await page.route("**/api/download", async route => {
    downloads += 1;
    if (holdZip) await new Promise<void>(resolve => { releaseZip = resolve; });
    return route.fulfill({ contentType: "application/zip", body: zipWith({ requested: 1, saved: 1, files: [] }) });
  });
  const expectAtWork = async (button: Locator, label: string) => {
    await expect(button, label).toBeVisible();
    await expect(button.locator(".spinner"), label).toBeVisible();
    await expect(button, label).toHaveAttribute("aria-disabled", "true");
    expect(await button.evaluate(textContrast), `${label}: words against the button`).toBeGreaterThanOrEqual(4.5);
    await button.click({ force: true });
    await delay(300);
  };
  await page.goto("/app");
  await setFakeTurnstile(page, { hold: true });
  await scanPage(page);
  await expectAtWork(page.getByRole("button", { name: "確認しています" }), "bot check");
  expect(scans, "nothing is sent while the bot check runs").toBe(0);
  await page.evaluate(() => (window as unknown as { __fakeTurnstileControl: { issueAll(): void } }).__fakeTurnstileControl.issueAll());
  await expectAtWork(page.getByRole("button", { name: "素材を探しています" }), "scan");
  expect(scans, "pressing during the scan sends nothing").toBe(1);
  holdScan = false;
  releaseScan();
  await expect(page.locator(".asset-card")).toHaveCount(9);
  await expect(page.getByRole("button", { name: "素材を見つける", exact: true })).not.toHaveAttribute("aria-disabled", "true");

  await page.getByRole("checkbox", { name: "photo-1.png を選択" }).check();
  await page.getByRole("button", { name: /ZIPで保存/ }).click();
  await expectAtWork(page.getByRole("button", { name: "ZIPを準備しています" }), "ZIP");
  expect(downloads, "pressing during the ZIP sends nothing").toBe(1);
  const saved = page.waitForEvent("download");
  holdZip = false;
  releaseZip();
  await saved;

  holdScan = true;
  await page.goto("/demo");
  await page.getByRole("button", { name: "デモを始める", exact: true }).click();
  await expectAtWork(page.getByRole("button", { name: "素材を準備しています" }), "demo");
  expect(scans, "pressing during the demo sends nothing").toBe(2);
  holdScan = false;
  releaseScan();
  await expect(page.locator(".asset-card")).toHaveCount(9);
});

// R2-6. The closing band's note: the same two sentences, each starting its own line (as at 1440px). The breaks inside
// the second sentence are checked from pictures by the reviewer.
const CLOSING_NOTE = ["実際のページは、URLを入れて取得できます。", "使う前に、権利者の許諾と対象サイトの規約を確認してください。"] as const;
for (const width of [1440, 390]) {
  test(`closing note at ${width}px: its two sentences, word for word, each start a line`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const note = page.locator("section[aria-labelledby=try-title]").getByText(CLOSING_NOTE[0]);
    await expect(note).toHaveText(CLOSING_NOTE.join(""));
    const starts = await note.evaluate((element, sentences) => {
      const nodes: Text[] = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
      const text = nodes.map(node => node.data).join("");
      const left = element.getBoundingClientRect().left + parseFloat(getComputedStyle(element).paddingLeft);
      const leftAt = (offset: number) => {
        let rest = offset;
        for (const node of nodes) {
          if (rest < node.length) {
            const range = document.createRange();
            range.setStart(node, rest);
            range.setEnd(node, rest + 1);
            return range.getClientRects()[0].left;
          }
          rest -= node.length;
        }
        return NaN;
      };
      return sentences.map(sentence => Math.round(leftAt(text.indexOf(sentence)) - left));
    }, CLOSING_NOTE);
    expect(starts, "each sentence starts at the left of its line").toEqual([0, 0]);
  });
}

// R2-7. The width filter says which width it limits. Its label (read out) and values are as before, and the box is
// as wide as its longest choice, so no choice is cut off.
test("width filter: the shown words say 最小の幅, the label and the values stay, and the box fits its longest choice at 1440px and 390px", async ({ page }) => {
  await acknowledgePolicy(page);
  await fakeTurnstile(page);
  await replacePreviews(page);
  await page.route("**/api/scan", route => route.fulfill({ json: liveScan() }));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/app");
    await scanPage(page);
    await expect(page.locator(".asset-card")).toHaveCount(9);
    const select = page.getByRole("combobox", { name: "最小幅で絞り込む" });
    await expect(select.locator("option")).toHaveText(["最小の幅：指定なし", "最小の幅：300px 以上", "最小の幅：600px 以上", "最小の幅：1,000px 以上", "最小の幅：1,920px 以上"]);
    expect(await select.locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))).toEqual(["", "300", "600", "1000", "1920"]);
    for (const value of ["", "1920"]) {
      await select.selectOption(value);
      const fit = await select.evaluate(element => {
        const clone = element.cloneNode(true) as HTMLSelectElement;
        clone.style.cssText = "position: absolute; visibility: hidden; width: auto; min-width: 0; max-width: none; flex: none";
        element.parentElement!.appendChild(clone);
        const natural = clone.getBoundingClientRect().width;
        clone.remove();
        return { width: element.getBoundingClientRect().width, natural };
      });
      expect(fit.width, `${width}px, value "${value}": ${JSON.stringify(fit)}`).toBeGreaterThanOrEqual(fit.natural - 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px: no sideways scrolling`).toBe(true);
  }
});

interface FocusStop { readonly key: string; readonly name: string; readonly skip: boolean; readonly problem: string | null; readonly ring: string }

/**
 * The focus ring of the focused element, or of the nearest of its parents that draws it for it (a field's frame, a
 * card around its checkbox, the video's frame), and what is behind it: 2px or wider, 3:1 or more against what is
 * behind, not cut off by a parent, and not drawn over a picture (whose colours are unknown). Runs in the page; null
 * when the page itself has the focus. The video's own buttons are drawn by the browser and are skipped.
 */
function focusRing(): FocusStop | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  const stops = window as unknown as { __focusStops?: number };
  if (!active.dataset.focusStop) active.dataset.focusStop = String((stops.__focusStops = (stops.__focusStops ?? 0) + 1));
  const key = active.dataset.focusStop;
  const name = ((active.getAttribute("aria-label") ?? active.textContent ?? "").replace(/\s+/g, " ").trim() || active.getAttribute("placeholder") || active.tagName.toLowerCase()).slice(0, 20);
  if (active instanceof HTMLVideoElement && !active.matches(":focus-visible")) return { key, name, skip: true, problem: null, ring: "the video's own buttons" };
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
  const behind = (start: Element | null): Color => {
    const layers: Color[] = [];
    for (let node = start; node; node = node.parentElement) {
      const color = parse(getComputedStyle(node).backgroundColor);
      if (color.a > 0) { layers.push(color); if (color.a >= 1) break; }
    }
    let result: Color = { r: 255, g: 255, b: 255, a: 1 };
    for (const layer of layers.reverse()) result = over(layer, result);
    return result;
  };
  let owner: Element | null = null;
  let ring = { color: parse("rgb(0, 0, 0)"), width: 0, offset: 0, kind: "" };
  for (let node: Element | null = active, depth = 0; node && depth <= 4 && !owner; node = node.parentElement, depth++) {
    const style = getComputedStyle(node);
    // A see-through element (the card's real checkbox) shows no ring of its own.
    if (Number(style.opacity) === 0) continue;
    const width = parseFloat(style.outlineWidth);
    if (style.outlineStyle !== "none" && style.outlineStyle !== "hidden" && width > 0) {
      owner = node;
      ring = { color: parse(style.outlineColor), width, offset: parseFloat(style.outlineOffset), kind: `outline ${style.outlineStyle}` };
      break;
    }
    for (const shadow of style.boxShadow === "none" ? [] : style.boxShadow.split(/,(?![^(]*\))/)) {
      const [x = 0, y = 0, blur = 0, spread = 0] = (shadow.replace(/rgba?\([^)]*\)/, "").match(/-?[\d.]+px/g) ?? []).map(parseFloat);
      if (x === 0 && y === 0 && blur === 0 && spread > 0 && !/inset/.test(shadow)) {
        owner = node;
        ring = { color: parse(shadow.match(/rgba?\([^)]*\)/)?.[0] ?? "rgb(0, 0, 0)"), width: spread, offset: 0, kind: "shadow" };
        break;
      }
    }
  }
  if (!owner) return { key, name, skip: false, problem: "no focus ring", ring: "" };
  const where = `${owner.tagName.toLowerCase()}${typeof owner.className === "string" && owner.className ? `.${owner.className.split(/\s+/)[0]}` : ""}`;
  const background = behind(ring.offset >= 0 ? owner.parentElement : owner);
  const color = over(ring.color, background);
  const [light, dark] = [luminance(color), luminance(background)].sort((a, b) => b - a);
  const ratio = Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100;
  const rect = owner.getBoundingClientRect();
  const problems: string[] = [];
  if (ring.width < 2) problems.push(`${ring.width}px wide`);
  if (ratio < 3) problems.push(`${ratio}:1 against what is behind`);
  if (ring.offset < 0) {
    const pictures = [...(owner.parentElement ?? owner).querySelectorAll("img, video, canvas")].filter(picture => {
      const box = picture.getBoundingClientRect();
      return box.width > 0 && box.left < rect.right && rect.left < box.right && box.top < rect.bottom && rect.top < box.bottom;
    });
    if (pictures.length) problems.push("drawn over a picture");
  } else {
    const reach = ring.offset + ring.width;
    for (let node = owner.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      const clipsX = style.overflowX !== "visible", clipsY = style.overflowY !== "visible";
      if (!clipsX && !clipsY) continue;
      const box = node.getBoundingClientRect();
      const [left, right] = [box.left + parseFloat(style.borderLeftWidth), box.right - parseFloat(style.borderRightWidth)];
      const [top, bottom] = [box.top + parseFloat(style.borderTopWidth), box.bottom - parseFloat(style.borderBottomWidth)];
      const cutX = clipsX && (rect.left - reach < left - 0.5 || rect.right + reach > right + 0.5);
      const cutY = clipsY && (rect.top - reach < top - 0.5 || rect.bottom + reach > bottom + 0.5);
      if (cutX || cutY) { problems.push(`cut off by ${node.tagName.toLowerCase()}.${typeof node.className === "string" ? node.className.split(/\s+/)[0] : ""}`); break; }
    }
  }
  return { key, name, skip: false, problem: problems.length ? problems.join(", ") : null, ring: `${where} ${ring.kind} ${ring.width}px offset ${ring.offset}px ${ratio}:1` };
}

/** Presses Tab and reads the ring of each new element, up to `count` of them or until the focus comes round again. */
async function focusStops(page: Page, count: number): Promise<FocusStop[]> {
  const seen = new Set<string>();
  const stops: FocusStop[] = [];
  for (let press = 0; press < count * 3 && stops.length < count; press++) {
    await page.keyboard.press("Tab");
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const stop = await page.evaluate(focusRing);
    if (stop === null) break;
    // Inside the video's own buttons the video keeps the focus: not a new element, and not the end of the round.
    if (stop.skip) continue;
    if (seen.has(stop.key)) break;
    seen.add(stop.key);
    stops.push(stop);
  }
  return stops;
}

// R2-8. Keyboard focus rings: on / and /app (and on /app's results: tabs, search, width, checkboxes, details), every
// element reached with Tab shows a ring 2px or wider at 3:1 or more against what is behind it, whole and not over a picture.
for (const width of [1440, 390]) {
  test(`focus rings at ${width}px: the first elements reached with Tab on / and /app, and the controls of a result, each show a ring 2px or wider at 3:1 or more`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const report: string[] = [];
    const check = (where: string, stops: FocusStop[], least: number) => {
      expect(stops.length, `${where}: ${stops.map(stop => stop.name).join(" / ")}`).toBeGreaterThanOrEqual(least);
      report.push(...stops.filter(stop => stop.problem !== null).map(stop => `${where} 「${stop.name}」: ${stop.problem} (${stop.ring})`));
    };
    await page.goto("/");
    check("/", await focusStops(page, 15), 15);
    await acknowledgePolicy(page);
    await fakeTurnstile(page);
    await replacePreviews(page);
    await page.route("**/api/scan", route => route.fulfill({ json: liveScan() }));
    await page.goto("/app");
    check("/app", await focusStops(page, 15), 14);
    await scanPage(page);
    await expect(page.locator(".asset-card")).toHaveCount(9);
    await expect(page.locator('[data-preview="loaded"]').first()).toBeVisible();
    // From the result's heading (where the focus lands): the source, "もう一度取得", the tabs, search, width, cards.
    check("/app result", await focusStops(page, 20), 20);
    expect(report).toEqual([]);
  });
}

// ---- UI scoring of the paused screens, round 1, on an open site ----
// The paused screens themselves are in paused.spec.ts (a preview started with PAGECRATE_PAUSED=1).

/** The calm look of a planned pause: the always-on note's colours (globals.css .pause-note), not the warning's. */
const CALM = { background: "rgb(244, 247, 240)", border: "rgb(217, 228, 211)", color: "rgb(77, 95, 72)" };
const PAUSED_TITLE = "実サイトの取得は、いまお休み中です";

test("open site: none of the paused screens' words or parts show, and the card's way into the demo is named 'デモを試す' and starts it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const path of ["/", "/demo", "/app"]) {
    await page.goto(path);
    await expect(page.locator("body"), path).not.toContainText(PAUSE_WORDS);
    await expect(page.locator(".pause-note"), path).toHaveCount(0);
  }
  await page.goto("/");
  await expect(page.locator("section[aria-labelledby=intro-title] > p").last()).toHaveText(PHRASES.topNote.join(""));
  await expect(page.locator("section[aria-labelledby=try-title] p", { hasText: "使う前に、権利者の許諾" })).toHaveText(CLOSING_NOTE.join(""));
  await page.goto("/demo");
  await expect(page.locator(".demo-next > span")).toHaveText("実際のページは、URLを入れて取得できます。");
  await acknowledgePolicy(page);
  await replacePreviews(page);
  await page.goto("/app");
  await expect(page.locator("#url-help")).toHaveText(PHRASES.urlHelp.join(""));
  await expect(page.locator(".entry-footer > p")).toHaveText(PHRASES.entryFooter.join(""));
  await expect(page.getByRole("button", { name: "デモで試してみる" })).toHaveCount(0);
  await page.locator(".entry-footer").getByRole("button", { name: DEMO_BUTTON, exact: true }).click({ timeout: 5_000 });
  await expect(page.locator(".asset-card")).toHaveCount(7);
});

test("open site at 390×844: the URL card's notes wrap only between phrases and every line starts at the card's left edge, the top page's note puts each sentence on its own line, and the lock stays with the first line of the note under the card", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  const wraps = {
    help: await wrapsBetween(page.locator("#url-help"), PHRASES.urlHelp),
    footer: await wrapsBetween(page.locator(".entry-footer > p"), PHRASES.entryFooter),
    rights: await wrapsBetween(page.locator("#rights-note"), PHRASES.rights),
    privacy: await wrapsBetween(page.locator(".privacy-note"), PHRASES.privacy),
  };
  expect(Object.fromEntries(Object.entries(wraps).map(([name, seen]) => [name, seen.text]))).toEqual({ help: PHRASES.urlHelp.join(""), footer: PHRASES.entryFooter.join(""), rights: PHRASES.rights.join(""), privacy: PHRASES.privacy.join("") });
  expect(Object.entries(wraps).filter(([, seen]) => seen.outside.length > 0).map(([name, seen]) => `${name}: ${seen.outside.join(", ")} (${seen.lines.join(" ／ ")})`)).toEqual([]);
  // Left-aligned like the field (no mix of left and centred): every line of the help and of the foot's words, and the
  // foot's demo button.
  const fieldLeft = (await page.locator(".url-field").boundingBox())?.x ?? Number.NaN;
  const demoLeft = (await page.locator(".entry-footer").getByRole("button", { name: DEMO_BUTTON, exact: true }).boundingBox({ timeout: 5_000 }))?.x ?? Number.NaN;
  const lefts = { help: wraps.help.boxes.map(line => Math.round(line.left - fieldLeft)), footer: wraps.footer.boxes.map(line => Math.round(line.left - fieldLeft)), demo: Math.round(demoLeft - fieldLeft) };
  expect(lefts).toEqual({ help: wraps.help.boxes.map(() => 0), footer: wraps.footer.boxes.map(() => 0), demo: 0 });
  // The lock sits right before the first word of the first line, not alone at the left edge.
  const lock = await page.locator(".privacy-note").evaluate(lockPlacement);
  expect({ found: lock.found, onFirstLine: lock.onFirstLine, nextToWords: lock.gap >= 0 && lock.gap <= 12 }, JSON.stringify(lock)).toEqual({ found: true, onFirstLine: true, nextToWords: true });
  await page.goto("/");
  const top = await wrapsBetween(page.locator("section[aria-labelledby=intro-title] > p").last(), PHRASES.topNote);
  expect({ outside: top.outside, lines: top.lines }).toEqual({ outside: [], lines: ["まずは自作のサンプルで。", "入力なしで、すぐに試せます。"] });
});

for (const [width, height] of [[390, 844], [1440, 900]] as const) {
  test(`open site at ${width}×${height}: a PAUSED answer from the server shows the same calm band as a paused site (the note's colours and the info mark), with the server's own sentence and 'デモを試す', arrow after the words, 44px or taller`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await acknowledgePolicy(page);
    await fakeTurnstile(page);
    await page.route("**/api/scan", route => route.fulfill({ status: 503, json: { code: "PAUSED", message: API_MESSAGES.PAUSED } }));
    await page.goto("/app");
    await scanPage(page);
    const box = page.locator(".status-band").getByRole("group", { name: PAUSED_TITLE });
    await expect(box).toBeFocused();
    expect({ body: await box.locator("p").first().innerText(), estimate: await box.locator(".status-estimate").innerText() })
      .toEqual({ body: API_MESSAGES.PAUSED, estimate: "目安再開の時期は未定です。" });
    expect({ colours: await box.evaluate(palette), warning: await box.evaluate(element => element.classList.contains("error-box")), infoMark: await box.locator(":scope > svg circle").count() })
      .toEqual({ colours: CALM, warning: false, infoMark: 1 });
    const button = await box.getByRole("button", { name: DEMO_BUTTON, exact: true }).evaluate(buttonGeometry);
    expect({ arrowAfterWords: button.arrowAfterWords, tall: button.height >= 44, fills: width > 390 || (Math.abs(button.left) <= 1 && Math.abs(button.right) <= 1) }, JSON.stringify(button))
      .toEqual({ arrowAfterWords: true, tall: true, fills: true });
  });
}

// Found while shooting the paused screens for UI scoring (round 2): on phones the box for each step number was 24px
// wide, "02" and "03" are about 26px, so they broke into "0" over "2". /demo and /app share this block, open or paused.
// Each number must stay on one line and inside its own box, down to the narrowest phones and at the edge of the rule.
for (const width of [320, 390, 620]) {
  test(`how-it-works steps at ${width}px: each step number ("01", "02", "03") stays on one line, inside its own box, on /demo and /app`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["/demo", "/app"]) {
      await page.goto(path);
      const numbers = page.locator(".step-number");
      await expect(numbers, path).toHaveCount(3);
      for (const [index, text] of ["01", "02", "03"].entries()) {
        const number = numbers.nth(index);
        await expect(number, `${path} step ${index + 1}`).toHaveText(text);
        const measured = await number.evaluate(element => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const rects = [...range.getClientRects()];
          return {
            lines: new Set(rects.map(rect => Math.round(rect.top))).size,
            textWidth: Math.max(...rects.map(rect => rect.right)) - Math.min(...rects.map(rect => rect.left)),
            boxWidth: element.getBoundingClientRect().width,
          };
        });
        expect(measured.lines, `${path} "${text}" takes one line: ${JSON.stringify(measured)}`).toBe(1);
        expect(measured.textWidth, `${path} "${text}" fits its box: ${JSON.stringify(measured)}`).toBeLessThanOrEqual(measured.boxWidth + 0.5);
      }
    }
  });
}

// An open site is untouched by the fixes for the paused screens (UI scoring of the paused screens, round 2: the paused
// /app now says the demo in its first step and outlines the URL button). Open, the first step still tells people to
// paste a URL and press the button, the URL button is the filled main button, and /demo's first step names its own
// button. This runs against the usual open preview; paused.spec.ts checks the paused side.
test("open site: the first step says to paste a URL and press '素材を見つける', the URL button is the filled main button, and /demo's first step names 'デモを始める'", async ({ page }) => {
  await page.goto("/app");
  await expect(page.locator(".how-step").first()).toContainText("「素材を見つける」を押します");
  const start = page.getByRole("button", { name: "素材を見つける", exact: true });
  await expect(start).toHaveClass(/\bbutton-primary\b/);
  await expect(start).not.toHaveClass(/\bbutton-outline\b/);
  await page.goto("/demo");
  await expect(page.locator(".how-step").first()).toContainText("「デモを始める」を押すと");
});
