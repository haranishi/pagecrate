// Records the home page's tour video (public/tour/pagecrate-tour.mp4 · .webm · -poster.webp) with the built-in demo
// only, as a first-time visitor: a fresh browser context with nothing stored. The flow: open /demo, start the demo,
// the privacy policy check (tick, then 進む), the result, select an image, narrow to videos, select the video, show all
// again, save the ZIP, the saved result. It records the local Workers preview, because the API runs only on the
// Cloudflare runtime (`next start` answers 混み合っています), and it does not start the preview. After
// `npm run build:worker`, with the preview on PAGECRATE_TEST_URL (default http://127.0.0.1:8787):
//   node --import tsx scripts/record-tour.mjs
// Requests to any other origin are aborted. Each main scene is checked while recording: the screen's text has none of
// the old pilot wording (OLD_WORDING in tests/e2e/support.ts), and there is no cookie at the start or the end (the
// policy confirmation stays in localStorage). The captions (public/tour/pagecrate-tour.ja.vtt) are timed to AT: when
// it changes, re-time them and the video checks in tests/e2e/intro.spec.ts.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, stat } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { chromium } from "playwright";
import { POLICY_ACK_STORAGE_NAME } from "../src/lib/policy.ts";
import { MAX_TOUR_VIDEO_BYTES } from "../src/lib/tour-video.ts";
import { OLD_WORDING } from "../tests/e2e/support.ts";

const origin = new URL(process.env.PAGECRATE_TEST_URL ?? "http://127.0.0.1:8787").origin;
const rawDirectory = ".agent-harness/evidence/tour-recording";
const output = "public/tour/pagecrate-tour";
/** Seconds into the video at which each step starts. */
const AT = { start: 3.5, tick: 8, proceed: 10, result: 11.5, image: 13.5, videos: 16.5, video: 18.5, all: 21, save: 23, away: 25.5, end: 30 };
/** The poster: the result list, one image selected, the selection bar. */
const POSTER_AT = 14.5;

await mkdir(rawDirectory, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 }, reducedMotion: "reduce", locale: "ja-JP",
  recordVideo: { dir: rawDirectory, size: { width: 1280, height: 720 } },
});
const external = [];
const scenes = [];
const marks = {};
let rawVideo;
let rawStart;
try {
  // No stored state or profile is loaded, and every request outside the preview is aborted.
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || url.protocol === "blob:" || url.protocol === "data:") return route.continue();
    external.push(url.origin);
    return route.abort();
  });
  const page = await context.newPage();
  // The raw video starts with the page; the output starts once the first screen has settled.
  const openedAt = performance.now();
  const storage = async () => ({
    cookies: (await context.cookies()).length,
    local: await page.evaluate(() => Object.keys(localStorage)),
    session: await page.evaluate(() => sessionStorage.length),
  });
  /** One scene of the video: the screen shows `expected`, and none of the old pilot wording. Line breaks between
   * boxes count as spaces, so neither is split by the layout. */
  async function checkScene(scene, expected) {
    const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
    assert.ok(text.includes(expected), `${scene}: the screen shows "${expected}"`);
    assert.deepEqual(OLD_WORDING.filter(word => text.includes(word)), [], `${scene}: old wording on the screen`);
    scenes.push(scene);
  }

  await page.goto(`${origin}/demo`);
  const start = page.getByRole("button", { name: "デモを始める", exact: true });
  await start.waitFor();
  assert.deepEqual(await storage(), { cookies: 0, local: [], session: 0 }, "a first visit: nothing is stored");
  // A visible pointer is a recording annotation, not a change to the product UI. It is a manual popover, so it lives in
  // the top layer: the policy check is a modal dialog, which covers everything outside the top layer.
  await page.evaluate(() => {
    const pointer = document.createElement("div");
    pointer.id = "recording-pointer";
    pointer.setAttribute("aria-hidden", "true");
    pointer.popover = "manual";
    document.body.append(pointer);
    pointer.showPopover();
    document.addEventListener("pointermove", event => {
      pointer.style.transform = `translate(${event.clientX - 10}px, ${event.clientY - 10}px)`;
    });
  });
  await page.addStyleTag({ content: "#recording-pointer{position:fixed;inset:auto;top:0;left:0;margin:0;padding:0;overflow:visible;width:20px;height:20px;border:3px solid white;border-radius:50%;background:#17675ec9;box-shadow:0 0 0 1px #17675e;pointer-events:none;transform:translate(-50px,-50px)}" });
  await page.waitForTimeout(300);
  const startedAt = performance.now();
  rawStart = (startedAt - openedAt) / 1000;
  const at = async (seconds) => {
    const remaining = seconds * 1000 - (performance.now() - startedAt);
    if (remaining > 0) await page.waitForTimeout(remaining);
  };
  const mark = (name) => { marks[name] = Number(((performance.now() - startedAt) / 1000).toFixed(2)); };
  async function pointAndClick(locator) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
    await page.waitForTimeout(200);
    await locator.click();
  }
  const selectionOf = (name) => page.locator(".asset-card").filter({ has: page.getByRole("heading", { name, exact: true }) }).locator(".asset-selection");
  await checkScene("冒頭", "登録なしで");

  await at(AT.start);
  await pointAndClick(start);
  mark("start");
  const check = page.getByRole("dialog", { name: "使う前に、プライバシーポリシーをお読みください" });
  await check.waitFor();
  // The top layer stacks in the order things open: show the pointer again, above the dialog.
  await page.evaluate(() => { const pointer = document.getElementById("recording-pointer"); pointer.hidePopover(); pointer.showPopover(); });
  await checkScene("確認画面", "プライバシーポリシーを読みました");
  await at(AT.tick);
  await pointAndClick(check.getByRole("checkbox", { name: "プライバシーポリシーを読みました" }));
  mark("tick");
  await at(AT.proceed);
  await pointAndClick(check.getByRole("button", { name: "進む", exact: true }));
  mark("proceed");
  await page.locator(".asset-card").first().waitFor();
  await at(AT.result);
  await page.locator(".results-section").evaluate(element => element.scrollIntoView({ block: "start", behavior: "instant" }));
  mark("result");
  // The four cards on screen show their previews (they load two at a time).
  await page.locator('[data-preview="loaded"]').nth(3).waitFor();
  await checkScene("結果", "見つかった素材");
  await at(AT.image);
  await pointAndClick(selectionOf("studio-poster.svg"));
  mark("image");
  await at(AT.videos);
  await pointAndClick(page.getByRole("button", { name: /^動画\s*1$/ }));
  mark("videos");
  await checkScene("絞り込み", "うち1点は絞り込みで非表示");
  await at(AT.video);
  await pointAndClick(selectionOf("motion-study.webm"));
  mark("video");
  await at(AT.all);
  await pointAndClick(page.getByRole("button", { name: /^すべて\s*7$/ }));
  mark("all");
  await checkScene("選択バー", "点を選択中");
  await at(AT.save);
  const downloadEvent = page.waitForEvent("download");
  await pointAndClick(page.getByRole("button", { name: /ZIPで保存/ }));
  mark("save");
  const download = await downloadEvent;
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  assert.equal(manifest.saved, 2);
  assert.deepEqual(manifest.files.map(file => file.mime).sort(), ["image/svg+xml", "video/webm"]);
  await page.getByText("2/2点をZIPに保存", { exact: false }).waitFor();
  mark("saved");
  await checkScene("保存の結果", "2/2点をZIPに保存");
  await at(AT.away);
  // Into the right margin, out of the way of the cards and the selection bar.
  await page.mouse.move(1256, 330, { steps: 18 });
  await at(AT.end + 0.4);
  await checkScene("最後", "2/2点をZIPに保存");
  assert.deepEqual(await storage(), { cookies: 0, local: [POLICY_ACK_STORAGE_NAME], session: 0 }, "the confirmation stays in localStorage only");
  assert.deepEqual(external, [], "no request left the preview");
  const video = page.video();
  await context.close();
  rawVideo = await video.path();
} finally { await browser.close(); }

function render(args) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
}
render(["-ss", rawStart.toFixed(3), "-i", rawVideo, "-t", String(AT.end), "-an", "-map_metadata", "-1", "-vf", "fps=24", "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${output}.mp4`]);
render(["-i", `${output}.mp4`, "-an", "-map_metadata", "-1", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "34", "-deadline", "good", "-cpu-used", "3", `${output}.webm`]);
render(["-ss", String(POSTER_AT), "-i", `${output}.mp4`, "-frames:v", "1", "-c:v", "libwebp", "-quality", "82", `${output}-poster.webp`]);
const bytes = { mp4: (await stat(`${output}.mp4`)).size, webm: (await stat(`${output}.webm`)).size, poster: (await stat(`${output}-poster.webp`)).size };
// The Worker serves a tour video only up to this size (src/lib/tour-video.ts).
assert.ok(bytes.mp4 <= MAX_TOUR_VIDEO_BYTES && bytes.webm <= MAX_TOUR_VIDEO_BYTES, "each video is within the Worker's limit");
console.log(JSON.stringify({ recorded: "owned demo only", scenes, marks, rawStart: Number(rawStart.toFixed(3)), savedAssets: 2, bytes }));
