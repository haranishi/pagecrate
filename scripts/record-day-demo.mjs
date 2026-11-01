// Records the two files the 100-day challenge's list needs for an external Day (the app runs on its own site and the
// list only links to it), from the built-in demo, as the demo-only public site shows it (PAGECRATE_PAUSED=1):
//   demo.mp4         1080×1080, 15 seconds at 25 frames a second (the rate Playwright records at: 30 would only repeat
//                    every fifth frame), H.264 with a silent AAC track, no metadata but the encoder's name
//   screenshot.webp  1200×750: the result list with an image and the video selected, and the selection bar
// Like scripts/record-tour.mjs, it records the local Workers preview (the API runs only on the Cloudflare runtime) and
// does not start it. After `npm run build:worker`, with a preview started with PAGECRATE_PAUSED=1 on
// PAGECRATE_TEST_URL (default http://127.0.0.1:8787):
//   node --import tsx scripts/record-day-demo.mjs        (npm run record:day)
// The flow is a first-time visitor on /app: the note that page scans are paused, with "デモを試す" inside it, the
// privacy policy check (tick, then 進む), the list, an image, narrowing to videos, the video, all again, "ZIPで保存",
// the saved result, and back up to the note. The recording starts with the page and the video starts where the screen
// first keeps moving after the list has settled (frames 0.2 seconds apart differ three times in a row, and the first
// two frames differ), so it opens on the list in motion: never on a still page or on the policy check, which stays in
// the part that is cut. Each scene is checked while recording: the screen shows none of the old pilot wording
// (OLD_WORDING in tests/e2e/support.ts), none of the sentences that read as if a page could be fetched now
// (NOT_WHILE_PAUSED) and there is no cookie. At the end the policy confirmation is the only thing kept (in
// localStorage), the scan sent only {"demo":true}, the ZIP held the image and the video, and no request left the
// preview: every other origin is aborted, so the bot check's script is never loaded either.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { chromium } from "playwright";
import { POLICY_ACK_STORAGE_NAME } from "../src/lib/policy.ts";
import { DEMO_BUTTON, OLD_WORDING, PAUSE_LEAD, PAUSE_NOTE } from "../tests/e2e/support.ts";

const origin = new URL(process.env.PAGECRATE_TEST_URL ?? "http://127.0.0.1:8787").origin;
const directory = ".agent-harness/evidence/day081";
const rawDirectory = `${directory}/raw`;
/** The video is recorded at its own size: Playwright captures CSS pixels, so a device scale would only add a margin. */
const SIZE = 1080;
const LENGTH = 15;
/** Seconds after the list has settled (the start of the video, give or take a frame) at which each step starts. */
const AT = { image: 2.2, videos: 4, video: 5.6, all: 7.2, save: 8.8, away: 10.8, top: 11.6, end: LENGTH + 0.8 };
const SHOT = { width: 1200, height: 750 };
const MAX_VIDEO_BYTES = 5_000_000;
const GATE = "使う前に、プライバシーポリシーをお読みください";
const ACK = "プライバシーポリシーを読みました";
/** The note's two sentences, each checked on its own: a phone-width layout may put a break between them. */
const PAUSE_SENTENCES = [PAUSE_LEAD, PAUSE_NOTE.slice(PAUSE_LEAD.length)];
/** Said nowhere while the site is paused: they read as if a page could be fetched now, or call the demo by its old name. */
const NOT_WHILE_PAUSED = [
  "ログイン不要の公開ページを1ページずつ取得します。", "使い方を試したいときは、サンプル素材で体験できます。",
  "デモで試してみる", "実際のページは、URLを入れて取得できます。",
];
/** Frames are compared at a quarter of the size: a pixel changes when its gray level moves by more than LEVEL, and a
 * frame moves when at least MIN_CHANGED pixels change (the pointer alone is about 50). */
const PROBE = SIZE / 4;
const LEVEL = 12;
const MIN_CHANGED = 12;

const external = [];
const scenes = [];
const marks = {};
const scans = [];

function ffmpeg(args) {
  return execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 1 << 28 });
}
/** Gray frames of `file` from `start` for `seconds`, PROBE pixels square: the file's own frames, none repeated or
 * dropped (a frame-rate filter would repeat the first one when `start` falls between two frames). */
function grayFrames(file, start, seconds) {
  const out = ffmpeg(["-ss", start.toFixed(3), "-i", file, "-t", seconds.toFixed(3), "-an", "-fps_mode", "passthrough", "-vf", `scale=${PROBE}:${PROBE}:flags=area,format=gray`, "-f", "rawvideo", "pipe:1"]);
  const bytes = PROBE * PROBE;
  return Array.from({ length: Math.floor(out.length / bytes) }, (_, index) => out.subarray(index * bytes, (index + 1) * bytes));
}
function changed(a, b) {
  let count = 0;
  for (let index = 0; index < a.length; index += 1) if (Math.abs(a[index] - b[index]) > LEVEL) count += 1;
  return count;
}
/** Frame `at` starts a motion: the next frame differs, and so do three steps of 0.2 seconds (`step` frames) in a row. */
function keepsMoving(frames, at, step) {
  if (at + 3 * step >= frames.length) return false;
  return changed(frames[at], frames[at + 1]) >= MIN_CHANGED
    && [0, 1, 2].every(k => changed(frames[at + k * step], frames[at + (k + 1) * step]) >= MIN_CHANGED);
}
function probe(file) {
  return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size:format_tags:stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate,nb_frames,start_time,sample_rate,channels:stream_tags", "-of", "json", file], { encoding: "utf8" }));
}

/** No stored state or profile is loaded, and every request outside the preview is recorded and aborted. */
async function newContext(browser, options) {
  const context = await browser.newContext({ locale: "ja-JP", timezoneId: "Asia/Tokyo", ...options });
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || url.protocol === "blob:" || url.protocol === "data:") return route.continue();
    external.push(url.origin);
    return route.abort();
  });
  return context;
}

/** One scene: the screen shows `expected`, none of the old pilot wording, and there is no cookie. Line breaks between
 * boxes count as spaces, so neither is split by the layout. */
async function checkScene(page, scene, expected) {
  const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  for (const words of [expected].flat()) assert.ok(text.includes(words), `${scene}: the screen shows "${words}"`);
  assert.deepEqual(OLD_WORDING.filter(word => text.includes(word)), [], `${scene}: old wording on the screen`);
  assert.deepEqual(NOT_WHILE_PAUSED.filter(words => text.includes(words)), [], `${scene}: a sentence that reads as if a page could be fetched now`);
  assert.equal((await page.context().cookies()).length, 0, `${scene}: no cookie`);
  scenes.push(scene);
}

async function storage(page) {
  return {
    cookies: (await page.context().cookies()).length,
    local: await page.evaluate(() => Object.keys(localStorage)),
    session: await page.evaluate(() => sessionStorage.length),
  };
}

/** /app on the demo-only site, a first visit: the pause is said above the URL field before anything is pressed, and
 * the button into the demo sits inside that note (the one way into the demo on this screen). */
async function openPausedApp(page) {
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/scan") scans.push(request.postData()); });
  await page.goto(`${origin}/app`);
  const demo = page.locator(".entry-panel .pause-note").getByRole("button", { name: DEMO_BUTTON, exact: true });
  await demo.waitFor();
  assert.deepEqual(await storage(page), { cookies: 0, local: [], session: 0 }, "a first visit: nothing is stored");
  const note = (await page.locator("#pause-note").textContent({ timeout: 2_000 }).catch(() => ""))?.trim();
  assert.equal(note, PAUSE_NOTE, "the preview runs as the demo-only public site: start it with PAGECRATE_PAUSED=1");
  return demo;
}

/** Every preview at or above the bottom of the window has its picture (the order the pictures arrive in varies from run
 * to run, so waiting for "the fourth one" can leave the third blank in the screenshot). */
const previewsLoaded = page => page.waitForFunction(() => {
  const previews = [...document.querySelectorAll(".preview-image")];
  return previews.length >= 5 && previews.filter(preview => preview.getBoundingClientRect().top < window.innerHeight).every(preview => preview.classList.contains("is-loaded"));
});
const selectionOf = (page, name) => page.locator(".asset-card").filter({ has: page.getByRole("heading", { name, exact: true }) }).locator(".asset-selection");
const pageTop = locator => locator.evaluate(element => element.getBoundingClientRect().top + window.scrollY);

/** Scrolls to `top` in `ms`, easing out (a quick start) or in and out, past the page's own smooth scrolling. */
function scrollPage(page, top, ms, easeOut) {
  return page.evaluate(([to, duration, quickStart]) => new Promise(resolve => {
    const from = window.scrollY;
    const begin = performance.now();
    const frame = now => {
      const t = Math.min(1, (now - begin) / duration);
      const eased = quickStart ? 1 - (1 - t) ** 3 : t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
      window.scrollTo({ top: from + (to - from) * eased, behavior: "instant" });
      if (t < 1) requestAnimationFrame(frame);
      else resolve(Math.round(window.scrollY));
    };
    requestAnimationFrame(frame);
  }), [top, ms, easeOut]);
}

await rm(rawDirectory, { recursive: true, force: true });
await mkdir(rawDirectory, { recursive: true });
const browser = await chromium.launch();
let rawVideo;
/** Seconds into the raw video at which the list had settled. */
let settledAt;
try {
  const context = await newContext(browser, { viewport: { width: SIZE, height: SIZE }, recordVideo: { dir: rawDirectory, size: { width: SIZE, height: SIZE } } });
  const page = await context.newPage();
  const openedAt = performance.now();
  const demo = await openPausedApp(page);
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
  let pointer = { x: SIZE * 0.62, y: SIZE * 0.36 };
  await page.mouse.move(pointer.x, pointer.y);
  /** Moves the pointer to (x, y) in `ms`, easing in and out, so the video shows it travel. */
  async function glide(x, y, ms) {
    const from = pointer;
    const steps = Math.max(2, Math.round(ms / 30));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      await page.mouse.move(from.x + (x - from.x) * eased, from.y + (y - from.y) * eased);
      await page.waitForTimeout(ms / steps);
    }
    pointer = { x, y };
  }
  async function pointAndClick(locator, ms = 550) {
    const box = await locator.boundingBox();
    assert.ok(box && box.y >= 0 && box.y + box.height <= SIZE, "the target is in view, so the video shows it");
    await glide(box.x + box.width / 2, box.y + box.height / 2, ms);
    await page.waitForTimeout(160);
    await locator.click();
  }
  await checkScene(page, "停止中の案内", PAUSE_SENTENCES);

  // The part that is cut: the start of the demo and the policy check, which a first visit always goes through.
  await page.waitForTimeout(500);
  await pointAndClick(demo);
  const check = page.getByRole("dialog", { name: GATE });
  await check.waitFor();
  // The top layer stacks in the order things open: show the pointer again, above the dialog.
  await page.evaluate(() => { const pointer = document.getElementById("recording-pointer"); pointer.hidePopover(); pointer.showPopover(); });
  await checkScene(page, "確認画面", ACK);
  await page.waitForTimeout(500);
  await pointAndClick(check.getByRole("checkbox", { name: ACK }));
  await page.waitForTimeout(300);
  await pointAndClick(check.getByRole("button", { name: "進む", exact: true }));
  await page.locator(".asset-card").first().waitFor();
  await check.waitFor({ state: "hidden" });
  await checkScene(page, "結果", ["7点の素材が見つかりました。", "取得元：PageCrate デモ（内蔵サンプル）"]);
  // The band and the first row in sight, every preview loaded, then a still second: the video starts with the next move.
  await page.waitForTimeout(400);
  await scrollPage(page, await pageTop(page.locator(".status-band")) - 24, 700, false);
  await previewsLoaded(page);
  await page.waitForTimeout(1_400);

  const startedAt = performance.now();
  settledAt = (startedAt - openedAt) / 1000;
  const at = async seconds => {
    const remaining = seconds * 1000 - (performance.now() - startedAt);
    if (remaining > 0) await page.waitForTimeout(remaining);
  };
  const mark = name => { marks[name] = Number(((performance.now() - startedAt) / 1000).toFixed(2)); };
  // The video starts here: the list slides up to the filters while the pointer heads for the first image.
  const filtersAt = await pageTop(page.locator(".filter-toolbar")) - 16;
  const poster = selectionOf(page, "studio-poster.svg");
  const posterBox = await poster.boundingBox();
  assert.ok(posterBox);
  const posterY = posterBox.y + await page.evaluate(() => window.scrollY) - filtersAt;
  await Promise.all([scrollPage(page, filtersAt, 1_100, true), glide(posterBox.x - 40, posterY + 70, 1_000)]);
  mark("list");
  await at(AT.image);
  await pointAndClick(poster);
  mark("image");
  await checkScene(page, "画像を選ぶ", "点を選択中");
  await at(AT.videos);
  await pointAndClick(page.getByRole("button", { name: /^動画\s*1$/ }));
  mark("videos");
  await checkScene(page, "動画に絞る", "うち1点は絞り込みで非表示");
  await at(AT.video);
  await pointAndClick(selectionOf(page, "motion-study.webm"));
  mark("video");
  await at(AT.all);
  await pointAndClick(page.getByRole("button", { name: /^すべて\s*7$/ }));
  mark("all");
  await checkScene(page, "選択バー", ["点を選択中", "原本 + 出典の記録をまとめて保存"]);
  assert.equal(await page.locator(".selection-count").textContent(), "2");
  await at(AT.save);
  const downloadEvent = page.waitForEvent("download");
  await pointAndClick(page.getByRole("button", { name: /ZIPで保存/ }));
  mark("save");
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), "pagecrate-demo.zip");
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  assert.equal(manifest.saved, 2);
  assert.deepEqual(manifest.files.map(file => file.mime).sort(), ["image/svg+xml", "video/webm"]);
  await page.getByText("2/2点をZIPに保存", { exact: false }).waitFor();
  mark("saved");
  await checkScene(page, "保存の結果", ["2/2点をZIPに保存", "ZIPのダウンロードを開始しました"]);
  await at(AT.away);
  // Into the right margin, out of the way of the cards and the selection bar.
  await glide(SIZE - 16, SIZE * 0.42, 600);
  await at(AT.top);
  // Back up to the note's box: the end shows the pause, the saved ZIP and the selection bar together.
  await scrollPage(page, await pageTop(page.locator(".entry-panel .pause-note")) - 24, 1_200, false);
  mark("top");
  await at(AT.end);
  await checkScene(page, "最後", [...PAUSE_SENTENCES, "ZIPのダウンロードを開始しました", "2/2点をZIPに保存"]);
  assert.deepEqual(await storage(page), { cookies: 0, local: [POLICY_ACK_STORAGE_NAME], session: 0 }, "the confirmation stays in localStorage only");
  const video = page.video();
  await context.close();
  rawVideo = await video.path();

  // The screenshot: the same visit without the pointer, the list with two items selected and the selection bar.
  const shotContext = await newContext(browser, { viewport: SHOT, reducedMotion: "reduce" });
  const shot = await shotContext.newPage();
  await (await openPausedApp(shot)).click();
  const shotCheck = shot.getByRole("dialog", { name: GATE });
  await shotCheck.getByRole("checkbox", { name: ACK }).check();
  await shotCheck.getByRole("button", { name: "進む", exact: true }).click();
  await selectionOf(shot, "studio-poster.svg").click();
  await shot.getByRole("button", { name: /^動画\s*1$/ }).click();
  await selectionOf(shot, "motion-study.webm").click();
  await shot.getByRole("button", { name: /^すべて\s*7$/ }).click();
  await shot.locator(".filter-toolbar").evaluate(element => element.scrollIntoView({ block: "start", behavior: "instant" }));
  await previewsLoaded(shot);
  await shot.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await checkScene(shot, "スクリーンショット", ["点を選択中", "ZIPで保存"]);
  assert.equal(await shot.locator(".selection-count").textContent(), "2");
  await shot.screenshot({ path: `${directory}/screenshot.png` });
  assert.deepEqual(await storage(shot), { cookies: 0, local: [POLICY_ACK_STORAGE_NAME], session: 0 }, "the screenshot's visit keeps only the confirmation");
  await shotContext.close();
  assert.deepEqual(scans, [JSON.stringify({ demo: true }), JSON.stringify({ demo: true })], "each visit sent only the demo request");
  assert.deepEqual(external, [], "no request left the preview");
} finally { await browser.close(); }

// The start: the first frame after the list settled that keeps moving, checked again on the video itself. The raw
// recording has 25 frames a second, kept as they are, so 0.2 seconds is 5 frames and a later start is one frame on.
// Playwright repeats a frame when the screen sends none in time, so two frames in a row can be the same even in
// motion: then the start moves on.
const FPS = 25;
const rawDuration = Number(probe(rawVideo).format.duration);
const searchFrom = Math.max(0, settledAt - 0.5);
const rawFrames = grayFrames(rawVideo, searchFrom, 2.4);
const first = rawFrames.findIndex((_, index) => keepsMoving(rawFrames, index, FPS / 5));
assert.ok(first >= 0, "the list moves once it has settled");
let cut = searchFrom + first / FPS;
const output = `${directory}/demo.mp4`;
for (let attempt = 0; ; attempt += 1) {
  assert.ok(cut + LENGTH <= rawDuration, "the recording lasts the whole video");
  ffmpeg(["-ss", cut.toFixed(3), "-i", rawVideo, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000", "-t", String(LENGTH),
    // The picture's clock starts at its first frame, so it begins with the sound and has all 375 frames.
    "-map", "0:v:0", "-map", "1:a:0", "-map_metadata", "-1", "-map_chapters", "-1", "-fps_mode", "passthrough", "-vf", "setpts=PTS-STARTPTS,format=yuv420p",
    "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-profile:v", "high", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", output]);
  if (keepsMoving(grayFrames(output, 0, 0.8), 0, FPS / 5)) break;
  assert.ok(attempt < 8, "the video's first frame moves");
  cut += 1 / FPS;
}
// Quality 92 keeps small text clean; the flat screen stays around 50 KB.
ffmpeg(["-i", `${directory}/screenshot.png`, "-map_metadata", "-1", "-c:v", "libwebp", "-quality", "92", `${directory}/screenshot.webp`]);
await rm(`${directory}/screenshot.png`);

const info = probe(output);
const picture = info.streams.find(stream => stream.codec_type === "video");
const sound = info.streams.find(stream => stream.codec_type === "audio");
assert.deepEqual([picture.codec_name, picture.width, picture.height, picture.pix_fmt, picture.r_frame_rate, Number(picture.nb_frames), Number(picture.start_time)], ["h264", SIZE, SIZE, "yuv420p", `${FPS}/1`, LENGTH * FPS, 0]);
assert.deepEqual([sound.codec_name, sound.sample_rate, sound.channels], ["aac", "48000", 2]);
assert.ok(Math.abs(Number(info.format.duration) - LENGTH) < 0.06, "the video lasts 15 seconds");
// Container fields aside, the file says only which encoder wrote it.
const STRUCTURE = ["major_brand", "minor_version", "compatible_brands", "language", "handler_name", "vendor_id"];
const extraTags = [info.format, ...info.streams].flatMap(entry => Object.keys(entry.tags ?? {})).filter(key => !STRUCTURE.includes(key));
assert.deepEqual([...new Set(extraTags)], ["encoder"], "no metadata but the encoder's name");
const bytes = { video: (await stat(output)).size, screenshot: (await stat(`${directory}/screenshot.webp`)).size };
assert.ok(bytes.video <= MAX_VIDEO_BYTES, "the video stays within about 5 MB");
const still = probe(`${directory}/screenshot.webp`).streams[0];
assert.deepEqual([still.codec_name, still.width, still.height], ["webp", SHOT.width, SHOT.height]);
await rm(rawDirectory, { recursive: true, force: true });
console.log(JSON.stringify({ recorded: "built-in demo on the paused site", scenes, marks, start: { afterSettled: Number((cut - settledAt).toFixed(2)) }, bytes }));
