import type { Locator, Page } from "@playwright/test";
import { crc32, deflateSync } from "node:zlib";
import { strToU8, zipSync } from "fflate";
import { POLICY_ACK_STORAGE_NAME, POLICY_VERSION } from "../../src/lib/policy";
import type { ScanResponse } from "../../src/lib/types";

// Shared by the workspace specs. Nothing here reaches outside the Workers preview: live scans, previews, ZIPs and the
// bot-check script are answered with page.route. The local preview applies the real per-minute limits (preview 60,
// ZIP 6), so specs that do not test the real API replace it.

export const BASE_URL = process.env.PAGECRATE_TEST_URL ?? "http://127.0.0.1:4381";
export const PAGE_URL = "https://example.com/gallery";
export const PREVIEW = /\/api\/preview\?t=/;
export const TURNSTILE_SCRIPT = /^https:\/\/challenges\.cloudflare\.com\//;
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/** The sentence right under the URL field (requirement 6.1), as people read it. */
export const RIGHTS_NOTE = "取得できても、再利用の許諾ではありません。使う前に、権利者の許諾と対象サイトの規約を確認してください。";
/**
 * While page scans are paused (the demo-only public site), every screen says it one way (UI scoring of the paused
 * screens, round 1): the lead sentence, in bold at the top of /app's URL card, which also holds "デモを試す"; the same
 * sentence replaces /demo's and the closing band's "実際のページは…"; the top page's hero note is replaced by two
 * sentences, the first of them the same lead (UI scoring, round 2: the hero used to word it differently).
 */
export const PAUSE_LEAD = "実サイトの取得は、いまお休み中です。";
export const PAUSE_NOTE = `${PAUSE_LEAD}デモなら、自作の素材で同じ流れを試せます。`;
export const TOP_PAUSE_NOTE = `${PAUSE_LEAD}デモなら入力なしで、すぐに試せます。`;
/** The words all of them share: an open site shows none (app.spec, intro.spec, ui-layout.spec). */
export const PAUSE_WORDS = "お休み中です";
/** The one name of every way into the demo but the header's "デモ" and the top page's "登録なしで試す". */
export const DEMO_BUTTON = "デモを試す";

/**
 * Where the short notes may wrap on a phone, as people should read them (components/phrased.tsx): only where one of
 * these phrases ends and the next begins. A note under the URL card that the screen splits into parts is listed with
 * its separators, which phones hide.
 */
export const PHRASES = {
  rights: ["取得できても、", "再利用の許諾ではありません。", "使う前に、", "権利者の許諾と", "対象サイトの規約を", "確認してください。"],
  pause: ["実サイトの取得は、", "いまお休み中です。", "デモなら、", "自作の素材で", "同じ流れを試せます。"],
  urlHelp: ["ログイン不要の", "公開ページを", "1ページずつ取得します。"],
  entryFooter: ["使い方を試したいときは、", "サンプル素材で体験できます。"],
  topNote: ["まずは", "自作のサンプルで。", "入力なしで、", "すぐに試せます。"],
  topPause: ["実サイトの取得は、", "いまお休み中です。", "デモなら", "入力なしで、", "すぐに試せます。"],
  privacy: ["素材の解析はCloudflareで処理", " · ", "外部AIへの送信なし", " / ", "取得時は対象サイトへアクセスします"],
  privacyDemo: ["このデモは内蔵素材だけを使用", " · ", "外部サイトへのアクセスなし"],
} as const;

/**
 * Wording of the old private pilot that must not come back on the public pages (tasks.md 4.6), the tour video and
 * its captions (5.2). The one list for every check. It leaves out what the documents rightly say today
 * ("ログインもアカウントも要りません", "ログインが必要なページ", "Cookie を使いません"), so only the old claims are caught.
 * The last line is what the old tour video showed besides the rest.
 */
export const OLD_WORDING = [
  "限定テスト", "個人用", "個人向け", "PRIVATE PILOT", "TRY BEFORE YOU SIGN IN", "SIGN IN", "サインイン", "草案", "一般提供",
  "暗号化", "一時保存", "必須Cookie", "必須 Cookie", "必須のCookie", "Turso", "テスター",
  "Google ログイン", "Googleログイン", "Google アカウント", "ログインへ", "ログイン後", "ログインして", "ログインすると",
  "アカウント削除", "アカウントを削除", "確認内容を保存",
  "PERSONAL & LOCAL", "YOUR COLLECTION", "再解析",
] as const;

/** A small valid PNG, so a replaced preview decodes like a real one. */
export function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), data.length + 8);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.alloc(1 + width * 3, 0x9c);
  row[0] = 0;
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", pixels), chunk("IEND", Buffer.alloc(0))]);
}
export const PREVIEW_PNG = png(64, 48);

/** A live scan answer: images with tickets and previews, a video, a candidate the server refused, and a stream. */
export function liveScan({ images = 6, expiresInMs = 30 * 60_000 } = {}): ScanResponse {
  return {
    pageUrl: PAGE_URL, truncated: false, expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
    assets: [
      ...Array.from({ length: images }, (_, index) => ({
        id: `img${index}`, kind: "image" as const, name: `photo-${index + 1}.png`, url: `https://example.com/images/photo-${index + 1}.png`,
        format: "PNG", width: 1200 - index * 100, height: 800, bytes: 120_000, ticket: `ticket-img${index}`, previewUrl: `/api/preview?t=ticket-img${index}`,
      })),
      { id: "clip", kind: "video", name: "clip.mp4", url: "https://example.com/media/clip.mp4", format: "MP4", ticket: "ticket-clip" },
      { id: "refused", kind: "image", name: "refused.png", url: "https://blocked.example/refused.png", format: "PNG", reason: "このサイトは、運営者の設定により取得できません。" },
      { id: "stream", kind: "unsupported", name: "live.m3u8", url: "https://example.com/live.m3u8", format: "M3U8", reason: "HLSの分割配信です。" },
    ],
  };
}

export function zipWith(manifest: { requested: number; saved: number; files: unknown[] }): Buffer {
  return Buffer.from(zipSync({ "image-img0.png": PREVIEW_PNG, "manifest.json": strToU8(JSON.stringify({ app: "PageCrate", ...manifest })) }));
}

/** Replaces the three APIs and records what the screen sent. */
export async function replaceApi(page: Page, scans: ScanResponse[], zip: Buffer = zipWith({ requested: 2, saved: 2, files: [] })) {
  const sent = { scan: [] as unknown[], preview: [] as string[], download: [] as unknown[] };
  await page.route("**/api/scan", route => {
    sent.scan.push(route.request().postDataJSON());
    return route.fulfill({ json: scans[Math.min(sent.scan.length, scans.length) - 1] });
  });
  await replacePreviews(page, sent.preview);
  await page.route("**/api/download", route => {
    sent.download.push(route.request().postDataJSON());
    return route.fulfill({ contentType: "application/zip", body: zip });
  });
  return sent;
}

/** Previews answered with a small PNG (the real route counts toward the per-minute limit). */
export async function replacePreviews(page: Page, tickets: string[] = []) {
  await page.route(PREVIEW, route => {
    tickets.push(new URL(route.request().url()).searchParams.get("t") ?? "");
    return route.fulfill({ contentType: "image/png", body: PREVIEW_PNG });
  });
  return tickets;
}

/** One line of a wrapped sentence: where it starts in the text, and the box of its drawn characters (px). */
export interface LineBox { readonly start: number; readonly left: number; readonly right: number; readonly top: number; readonly bottom: number }

/**
 * Where a sentence wraps: its text (the element's text nodes, in order) and its lines, found from the tops of its
 * characters. Characters that are not drawn (a separator hidden on phones) count in the offsets but start nothing.
 * Runs in the page.
 */
export function lineBoxes(element: Element): { text: string; lines: LineBox[] } {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let text = "";
  const lines: { start: number; left: number; right: number; top: number; bottom: number }[] = [];
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    for (let index = 0; index < node.length; index++) {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      const rect = range.getClientRects()[0];
      if (rect && rect.width > 0) {
        const line = lines[lines.length - 1];
        if (!line || rect.top > line.top + 4) lines.push({ start: text.length, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
        else { line.left = Math.min(line.left, rect.left); line.right = Math.max(line.right, rect.right); line.bottom = Math.max(line.bottom, rect.bottom); }
      }
      text += node.data[index];
    }
  }
  return { text, lines };
}

/**
 * How `element` wraps against `phrases` (the phrases of components/phrased.tsx, as people should read them): its
 * lines as text, and every line start that is not where one phrase ends and the next begins (`outside`, empty when
 * it wraps well). The caller checks that `text` is the phrases joined.
 */
export async function wrapsBetween(locator: Locator, phrases: readonly string[]) {
  const seen = await locator.evaluate(lineBoxes);
  const allowed: number[] = [];
  let at = 0;
  for (const phrase of phrases) { at += phrase.length; allowed.push(at); }
  const starts = seen.lines.slice(1).map(line => line.start);
  return {
    text: seen.text,
    lines: seen.lines.map((line, index) => seen.text.slice(line.start, seen.lines[index + 1]?.start)),
    boxes: seen.lines,
    outside: starts.filter(start => !allowed.includes(start)).map(start => `${seen.text.slice(Math.max(0, start - 4), start)}／${seen.text.slice(start, start + 4)}`),
  };
}

/**
 * The lock of the note under the URL card, against the first line it belongs to: the gap to the first character, and
 * whether its middle is inside that line. Runs in the page.
 */
export function lockPlacement(paragraph: Element) {
  const icon = paragraph.querySelector("svg")?.getBoundingClientRect();
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  let first: DOMRect | null = null;
  for (let node = walker.nextNode() as Text | null; node && !first; node = walker.nextNode() as Text | null) {
    for (let index = 0; index < node.length && !first; index++) {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      const rect = range.getClientRects()[0];
      if (rect && rect.width > 0) first = rect;
    }
  }
  if (!icon || !first) return { found: false, gap: Number.NaN, onFirstLine: false, iconLeft: Number.NaN };
  const middle = (icon.top + icon.bottom) / 2;
  return { found: true, gap: Math.round(first.left - icon.right), onFirstLine: middle >= first.top && middle <= first.bottom, iconLeft: icon.left };
}

/** The colours a box is painted with. Runs in the page. */
export function palette(element: Element) {
  const style = getComputedStyle(element);
  return { background: style.backgroundColor, border: style.borderTopColor, color: style.color };
}

/**
 * A button against the box it sits in (the nearest `.pause-note` or `.status-box`): its height, its margins to the
 * box's content edges, and whether its arrow comes after its words. Runs in the page.
 */
export function buttonGeometry(button: Element) {
  const own = button.getBoundingClientRect();
  const holder = button.closest(".pause-note, .status-box");
  if (!holder) return { height: Math.round(own.height), left: Number.NaN, right: Number.NaN, arrowAfterWords: false };
  const frame = holder.getBoundingClientRect();
  const style = getComputedStyle(holder);
  const contentLeft = frame.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
  const contentRight = frame.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
  let wordsRight = Number.NEGATIVE_INFINITY;
  const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim() || node.parentElement?.closest("[aria-hidden=true], .sr-only")) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    wordsRight = Math.max(wordsRight, range.getBoundingClientRect().right);
  }
  const arrow = button.querySelector(":scope > svg")?.getBoundingClientRect();
  return { height: Math.round(own.height), left: Math.round((own.left - contentLeft) * 10) / 10, right: Math.round((contentRight - own.right) * 10) / 10, arrowAfterWords: arrow !== undefined && arrow.left >= wordsRight - 0.5 };
}

/** The device has confirmed the current policy version before the page loads (every load of this page). */
export async function acknowledgePolicy(page: Page) {
  await page.addInitScript(([name, version]) => {
    try { window.localStorage.setItem(name, JSON.stringify({ version, ackedAt: new Date().toISOString() })); } catch { /* Blocked storage: the check shows. */ }
  }, [POLICY_ACK_STORAGE_NAME, POLICY_VERSION] as const);
}

/** What the fake bot check recorded in the page. */
export interface FakeTurnstileLog {
  renders: { sitekey: string; action: string }[];
  resets: number;
  removes: number;
  issued: number;
}

/**
 * Cloudflare's script replaced by a fake with the same three calls (render, reset, remove). Each render hands over a
 * new token ("fake-token-1", "fake-token-2", …) after `delayMs`; with `hold` set it waits for `issueAll()`.
 * Settings are read at every render, so a test can change them on the page: window.__fakeTurnstileSettings.
 */
const FAKE_TURNSTILE = `(() => {
  const live = new Map();
  let count = 0;
  const log = { renders: [], resets: 0, removes: 0, issued: 0 };
  const settings = () => Object.assign({ delayMs: 120, hold: false }, window.__fakeTurnstileSettings || {});
  function give(id) {
    const widget = live.get(id);
    if (!widget) return;
    log.issued += 1;
    widget.options.callback("fake-token-" + log.issued);
  }
  function schedule(id) {
    const widget = live.get(id);
    if (!widget) return;
    clearTimeout(widget.timer);
    if (!settings().hold) widget.timer = setTimeout(() => give(id), settings().delayMs);
  }
  window.__fakeTurnstile = log;
  window.__fakeTurnstileControl = {
    issueAll() { for (const id of [...live.keys()]) give(id); },
    failAll() { for (const widget of live.values()) widget.options["error-callback"](); },
  };
  window.turnstile = {
    render(container, options) {
      count += 1;
      const id = "fake-" + count;
      const box = document.createElement("div");
      box.className = "fake-turnstile";
      box.textContent = "試験用のボット確認";
      box.style.cssText = "display:flex;align-items:center;height:64px;padding:0 16px;border:1px solid #c9d2c0;border-radius:6px;background:#fafaf7;color:#46574a;font-size:12px";
      container.appendChild(box);
      live.set(id, { options, box, timer: 0 });
      log.renders.push({ sitekey: options.sitekey, action: options.action });
      schedule(id);
      return id;
    },
    reset(id) { log.resets += 1; schedule(id); },
    remove(id) {
      log.removes += 1;
      const widget = live.get(id);
      if (!widget) return;
      clearTimeout(widget.timer);
      widget.box.remove();
      live.delete(id);
    },
  };
})();`;

/** Routes the bot-check script to the fake and counts how often the page asked for it. */
export async function fakeTurnstile(page: Page) {
  const requests: string[] = [];
  await page.route(TURNSTILE_SCRIPT, route => {
    requests.push(route.request().url());
    return route.fulfill({ contentType: "text/javascript; charset=utf-8", body: FAKE_TURNSTILE });
  });
  return {
    requests,
    log: () => page.evaluate(() => (window as unknown as { __fakeTurnstile?: FakeTurnstileLog }).__fakeTurnstile ?? null),
  };
}

/** Opens a workspace page as a visitor who has already confirmed the policy; the bot check is the fake. */
export async function open(page: Page, path: "/app" | "/demo") {
  await acknowledgePolicy(page);
  const turnstile = await fakeTurnstile(page);
  await page.goto(path);
  return turnstile;
}

export async function scanPage(page: Page, url: string = PAGE_URL) {
  await page.getByLabel("素材を集めたいページのURL", { exact: true }).fill(url);
  await page.getByRole("button", { name: "素材を見つける", exact: true }).click();
}

/**
 * Requests to another origin, and Content-Security-Policy violations, seen by the page from now on. A request to
 * another origin is recorded and then aborted, so a test never reaches the network outside the preview. Routes
 * added after this one (the fake bot check) take precedence for their own URLs.
 */
export async function watchPage(page: Page) {
  const external: string[] = [];
  const consoleViolations: string[] = [];
  const own = new URL(BASE_URL).origin;
  page.on("request", request => {
    const url = new URL(request.url());
    if (!["blob:", "data:"].includes(url.protocol) && url.origin !== own) external.push(request.url());
  });
  await page.route(url => !["blob:", "data:"].includes(url.protocol) && url.origin !== own, route => route.abort("blockedbyclient"));
  page.on("console", message => { if (/Content[ -]Security[ -]Policy/i.test(message.text())) consoleViolations.push(message.text()); });
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __cspViolations: string[] }).__cspViolations = seen;
    document.addEventListener("securitypolicyviolation", event => { seen.push(`${event.violatedDirective} ${event.blockedURI}`); });
  });
  return {
    external,
    /** Violations reported to the page and to the console. */
    violations: async () => [...consoleViolations, ...await page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [])],
  };
}
