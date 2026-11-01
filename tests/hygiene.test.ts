// Tests for scripts/hygiene.mjs, the pre-publication check. Each case builds a throwaway tree in the OS temp folder,
// runs the real command on it and reads its output and its JSON record. Every fake secret, address, path, id, name
// and NG word here is assembled at run time, so this file passes the check itself, and the real private NG list
// (.precheck-ng.txt) is never read: every run gets a throwaway list through --ng-file.
import test, { after, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";

const TOOL = fileURLToPath(new URL("../scripts/hygiene.mjs", import.meta.url));
const CONFIG = fileURLToPath(new URL("../scripts/hygiene.config.json", import.meta.url));
const SHARED = mkdtempSync(join(tmpdir(), "hygiene-shared-"));
after(() => rmSync(SHARED, { recursive: true, force: true }));

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
/** Deterministic noise (xorshift), so fake keys look random to the rules without a literal key in this file. */
const noise = (length: number, seed: number, alphabet = ALNUM) => {
  let state = seed >>> 0 || 1;
  let out = "";
  for (let i = 0; i < length; i++) {
    state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0;
    out += alphabet[state % alphabet.length];
  }
  return out;
};
const FAKE = {
  person: ["Qarlo", "Venn"].join(" "),
  ngWord: ["zorb", "lefax"].join(""),
  homeUser: ["qar", "lov"].join(""),
  email: ["qarlo.venn", "mailbox.co"].join("@"),
  subdomain: ["qarlov", "lab"].join("-"),
  accountId: ["acct", "7Q2m9Z4k"].join(""),
  comment: ["filmed", "at", "home"].join("-"),
};
const NOREPLY = "hygiene-test@users.noreply.github.com";
const HOME = `/${"Users"}/${FAKE.homeUser}/`;
const HOME_PLACEHOLDER = `/${"Users"}/<you>/`;
const BEGIN = "-----BEGIN ";
/** The field name of a secret assignment, assembled so that this file's own lines are not assignments. */
const KEY_FIELD = ["api", "key"].join("_");
const GITHUB_PREFIX = ["gh", "p_"].join("");
const TURNSTILE_PREFIX = ["0x4", "AAAAAAA"].join("");
const realHost = () => ["probe", FAKE.subdomain, "workers", "dev"].join(".");
const slackHook = () => `https://hooks.${"slack"}.com/services/T${noise(8, 21, "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789")}/B${noise(8, 22, "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789")}/${noise(24, 23)}`;
const sendgridKey = () => `${["S", "G."].join("")}${noise(22, 31)}.${noise(43, 32)}`;

// --- tiny media files, built byte by byte -----------------------------------------------------------------------
const latin1 = (text: string) => Buffer.from(text, "latin1");
const pngChunk = (type: string, data: Buffer) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([latin1(type), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
};
const png = (extra: Buffer[] = []) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; // 1×1, 8-bit grey
  const pixels = Buffer.from([0x78, 0x9c, 0x63, 0x60, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", header), ...extra, pngChunk("IDAT", pixels), pngChunk("IEND", Buffer.alloc(0))]);
};
const jpegSegment = (marker: number, data: Buffer) => {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(data.length + 2, 2);
  return Buffer.concat([head, data]);
};
/** A little-endian TIFF block whose IFD0 holds one entry: the GPSInfo pointer (tag 0x8825). */
const tiffWithGps = () => {
  const tiff = Buffer.alloc(26);
  tiff.write("II", 0, "latin1"); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8); tiff.writeUInt16LE(0x8825, 10); tiff.writeUInt16LE(4, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt32LE(26, 18);
  return tiff;
};
const jpeg = (segments: Buffer[] = []) => Buffer.concat([
  Buffer.from([0xff, 0xd8]), jpegSegment(0xe0, latin1("JFIF\0\x01\x01\0\0\x01\0\x01\0\0")), ...segments,
  jpegSegment(0xda, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])), Buffer.from([0x00, 0xff, 0xd9]),
]);
const riffChunk = (type: string, data: Buffer) => {
  const head = Buffer.alloc(8);
  head.write(type, 0, "latin1");
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, Buffer.alloc(data.length % 2)]);
};
const webp = (chunks: Buffer[]) => {
  const body = Buffer.concat([latin1("WEBP"), ...chunks]);
  const head = Buffer.alloc(8);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
};

// --- running the tool -------------------------------------------------------------------------------------------
interface Finding { severity: "fail" | "warn"; kind: string; label: string; file: string; line: number | null }
interface HygieneRecord {
  profile: string; verdict: "pass" | "fail"; findings: Finding[]; allowed: { file: string; kind: string; count: number }[];
  notRun: { check: string; reason: string }[]; docsRow: string;
}
interface Run { status: number | null; stdout: string; stderr: string; recordText: string; record: HygieneRecord }
type Tree = Record<string, string | Buffer>;

const NO_TOOL = join(SHARED, "missing-tool");
const GITLEAKS = ["/opt/homebrew/bin/gitleaks", "gitleaks"].find((bin) => spawnSync(bin, ["version"]).status === 0) ?? null;
const HAS_FFMPEG = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
let listCount = 0;
const ngList = (lines: string[]) => {
  const file = join(SHARED, `ng-${listCount++}.txt`);
  writeFileSync(file, `${lines.join("\n")}\n`);
  return file;
};
const NG_FILE = ngList(["# throwaway list for the hygiene tests", FAKE.ngWord]);

function runTool(cwd: string, args: string[] = [], options: { gitleaks?: string | null; ffprobe?: string; ngFile?: string; config?: string } = {}): Run {
  const evidence = mkdtempSync(join(tmpdir(), "hygiene-record-"));
  try {
    const env = { ...process.env, HYGIENE_GITLEAKS: options.gitleaks ?? NO_TOOL, HYGIENE_FFPROBE: options.ffprobe ?? "ffprobe" };
    const result = spawnSync(process.execPath, [TOOL, "--config", options.config ?? CONFIG, "--ng-file", options.ngFile ?? NG_FILE, "--evidence-dir", evidence, ...args], { cwd, encoding: "utf8", env });
    const [name] = readdirSync(evidence);
    const recordText = name ? readFileSync(join(evidence, name), "utf8") : "";
    const record = (recordText ? JSON.parse(recordText) : { profile: "", verdict: "fail", findings: [], allowed: [], notRun: [], docsRow: "" }) as HygieneRecord;
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, recordText, record };
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
}
const gitIn = (cwd: string, args: string[]) => {
  const result = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args[0]} failed`);
};
const commitAll = (cwd: string, message: string) => { gitIn(cwd, ["add", "-A"]); gitIn(cwd, ["commit", "-q", "-m", message]); };
function makeTree(t: TestContext, files: Tree, git = true) {
  const root = mkdtempSync(join(tmpdir(), "hygiene-tree-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  if (git) for (const args of [["init", "-q"], ["config", "user.email", NOREPLY], ["config", "user.name", "Hygiene Test"], ["config", "commit.gpgsign", "false"]]) gitIn(root, args);
  return root;
}
const fails = (run: Run) => run.record.findings.filter((finding) => finding.severity === "fail");
const warns = (run: Run) => run.record.findings.filter((finding) => finding.severity === "warn");
const where = (finding: Finding) => `${finding.kind}|${finding.label}|${finding.file}|${finding.line ?? "-"}`;
const show = (run: Run) => `exit ${run.status}\n${run.stdout}\n${run.stderr}`;

/** Samples and placeholders that must pass: example hosts and addresses, labelled fake keys, a public site key. */
const cleanBase = (): Tree => ({
  "README.md": "Deploy to https://pagecrate.<your-subdomain>.workers.dev (any *.workers.dev host; see the workers.dev docs or https://example.workers.dev).\nWrite to hello@example.com or no-reply@pagecrate.example.\n",
  "docs/deploy.md": "CLOUDFLARE_ACCOUNT_ID=<your-account-id> npm run deploy\n",
  "src/config.ts": `export const sample = { api_key: "fake-key-for-tests", token: "turnstile-token-from-browser-0001", siteKey: "${TURNSTILE_PREFIX}${noise(14, 9)}" };\n`,
  "src/lib/operator-info.ts": "export const OPERATOR = { name: null, email: null };\n",
  "wrangler.jsonc": "{ \"name\": \"sample\", \"main\": \"worker.ts\" }\n",
  "public/og.png": png(),
  "public/photo.jpg": jpeg(),
  "public/poster.webp": webp([riffChunk("VP8 ", Buffer.alloc(10))]),
  "src/app/icon.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 8 8\"><rect width=\"8\" height=\"8\"/></svg>\n",
  "AGENTS.md": "Read the guide in node_modules/next/dist/docs/ before writing any code.\n",
  "CLAUDE.md": "@AGENTS.md\n",
  ".gitignore": "node_modules/\n",
});

test("a clean tree with samples and placeholders passes, and writes the record and the docs row", (t) => {
  const run = runTool(makeTree(t, cleanBase()));
  assert.equal(run.status, 0, show(run));
  assert.deepEqual(run.record.findings, [], show(run));
  assert.equal(run.record.verdict, "pass");
  assert.equal(run.record.profile, "private-pr");
  assert.equal(run.stdout.trimEnd().split("\n").at(-1), "判定：OK（失敗なし）", "the verdict is the last line");
  assert.ok(run.record.notRun.some((item) => item.check.startsWith("gitleaks")), "a missing gitleaks is reported as not run, not skipped silently");
  const row = run.stdout.split("\n").find((line) => line.startsWith("| ") && line.includes("npm run hygiene")) ?? "";
  assert.match(row, /^\| \d{4}-\d{2}-\d{2} \| 作業ツリー（追跡と未追跡 \d+件）と履歴（0コミット） \| npm run hygiene（private-pr・.*） \| 合格（失敗0・警告0・未実施1） \| なし \| 不要 \|$/);
  assert.equal(run.record.docsRow, row);
});

const CASES: { name: string; files: Tree; expect: string[] }[] = [
  { name: "a private key", files: { "src/key.pem": `${BEGIN}RSA PRIVATE KEY-----\n${noise(64, 1)}\n` }, expect: ["secret|秘密鍵|src/key.pem|1"] },
  { name: "an API token", files: { "src/client.ts": `const github = "${GITHUB_PREFIX}${noise(36, 2)}";\n` }, expect: ["secret|API キー・トークン|src/client.ts|1"] },
  { name: "a secret assignment", files: { "src/settings.ts": `export const settings = { ${KEY_FIELD}: "${noise(24, 3)}" };\n` }, expect: ["secret|秘密の代入|src/settings.ts|1"] },
  { name: "a Turnstile secret key", files: { "src/bot.ts": `const turnstile = "${TURNSTILE_PREFIX}${noise(25, 4)}";\n` }, expect: ["secret|Turnstile の秘密鍵|src/bot.ts|1"] },
  { name: "a local path", files: { "docs/notes.md": `Saved under ${HOME}project/notes.txt\n` }, expect: ["local-path|ローカルのパス|docs/notes.md|1"] },
  { name: "a 32-digit hex id in a settings file", files: { "wrangler.toml": `name = "sample"\nzone_id = "${noise(32, 5, "0123456789abcdef")}"\n` }, expect: ["account-id|32桁の16進|wrangler.toml|2"] },
  { name: "an account_id value", files: { "wrangler.jsonc": `{ "name": "sample", "account_id": "${FAKE.accountId}" }\n` }, expect: ["account-id|account_id の値|wrangler.jsonc|1"] },
  { name: "a real-looking workers.dev subdomain", files: { "docs/try.md": `Open https://${realHost()}/ to try it.\n` }, expect: ["account-id|workers.dev のサブドメイン|docs/try.md|1"] },
  { name: "an e-mail address", files: { "docs/contact.md": `Mail ${FAKE.email} for help.\n` }, expect: ["email|メールアドレス|docs/contact.md|1"] },
  { name: "a personal NG word", files: { "docs/about.md": `Made by ${FAKE.ngWord}.\n` }, expect: ["ng-word|個人NGワード（一覧の2行目）|docs/about.md|1"] },
  { name: "PNG text metadata", files: { "public/shot.png": png([pngChunk("tEXt", latin1(`Author\0${FAKE.person}`))]) }, expect: ["media-metadata|PNG の tEXt|public/shot.png|-"] },
  { name: "XMP hidden in an unknown PNG chunk", files: { "public/art.png": png([pngChunk("prVt", latin1(`<x:xmpmeta>${FAKE.person}</x:xmpmeta>`))]) }, expect: ["media-metadata|XMP（作成ツールの情報）|public/art.png|-"] },
  { name: "JPEG Exif with a shooting position", files: { "public/photo.jpg": jpeg([jpegSegment(0xe1, Buffer.concat([latin1("Exif\0\0"), tiffWithGps()]))]) }, expect: ["media-metadata|JPEG の Exif|public/photo.jpg|-", "media-metadata|JPEG の GPS（撮影の位置）|public/photo.jpg|-"] },
  { name: "WebP XMP", files: { "public/poster.webp": webp([riffChunk("VP8X", Buffer.alloc(10)), riffChunk("VP8 ", Buffer.alloc(10)), riffChunk("XMP ", latin1(`<rdf:Description creator="${FAKE.person}"/>`))]) }, expect: ["media-metadata|WebP の XMP|public/poster.webp|-"] },
  { name: "a file that must never be committed", files: { ".precheck-ng.txt": `${FAKE.ngWord}\n`, ".dev.vars": "TICKET_SECRET=\n", ".dev.vars.example": "TICKET_SECRET=\n" }, expect: ["private-file|個人NGワードの一覧（.gitignore に入れる）|.precheck-ng.txt|-", "private-file|秘密値のファイル（.dev.vars）|.dev.vars|-"] },
];

for (const { name, files, expect } of CASES) {
  test(`fails on ${name}, and on nothing else`, (t) => {
    const run = runTool(makeTree(t, { ...cleanBase(), ...files }));
    assert.equal(run.status, 1, show(run));
    assert.deepEqual(fails(run).map(where).sort(), [...expect].sort(), show(run));
  });
}

test("video tags other than the encoder and the mechanical items fail; creation_time warns", (t) => {
  if (!HAS_FFMPEG) { t.skip("ffmpeg/ffprobe が無いため（動画の付帯情報は ffprobe で調べる）"); return; }
  const root = makeTree(t, cleanBase());
  const video = (rel: string, metadata: string[]) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    const made = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=16x16:d=0.1", "-c:v", "mpeg4", ...metadata.flatMap((item) => ["-metadata", item]), "-y", join(root, rel)]);
    assert.equal(made.status, 0, "ffmpeg could not write the test video");
  };
  video("public/tour/clean.mp4", []);
  video("public/tour/shot.mp4", [`comment=${FAKE.comment}`, "creation_time=2026-01-01T00:00:00Z"]);
  const run = runTool(root);
  assert.equal(run.status, 1, show(run));
  assert.deepEqual(fails(run).map(where), ["media-metadata|動画の comment|public/tour/shot.mp4|-"], show(run));
  assert.deepEqual(warns(run).map(where), ["media-metadata|動画の creation_time（作成日時）|public/tour/shot.mp4|-"], show(run));
});

test("an SVG from a drawing tool is a warning to look at, not a failure", (t) => {
  const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\">\n<metadata><rdf:RDF/></metadata>\n<sodipodi:namedview inkscape:zoom=\"1\"/>\n</svg>\n";
  const run = runTool(makeTree(t, { ...cleanBase(), "public/logo.svg": svg }));
  assert.equal(run.status, 0, show(run));
  assert.deepEqual(warns(run).map(where).sort(), [
    "media-metadata|SVG の作成ツールの痕跡（<metadata>）|public/logo.svg|2", "media-metadata|SVG の作成ツールの痕跡（rdf:RDF）|public/logo.svg|2",
    "media-metadata|SVG の作成ツールの痕跡（inkscape:）|public/logo.svg|3", "media-metadata|SVG の作成ツールの痕跡（sodipodi:）|public/logo.svg|3",
  ].sort(), show(run));
});

test("operator-info.ts may carry the operator's name and address; the same in another file fails, and a secret never passes", (t) => {
  const operator = `export const OPERATOR = { name: "${FAKE.ngWord}", email: "${FAKE.email}" };\n`;
  const run = runTool(makeTree(t, {
    ...cleanBase(),
    "src/lib/operator-info.ts": `${operator}export const leaked = "${GITHUB_PREFIX}${noise(36, 6)}";\n`,
    "src/lib/footer.ts": operator,
  }));
  assert.equal(run.status, 1, show(run));
  assert.deepEqual(fails(run).map(where).sort(), [
    "email|メールアドレス|src/lib/footer.ts|1", "ng-word|個人NGワード（一覧の2行目）|src/lib/footer.ts|1", "secret|API キー・トークン|src/lib/operator-info.ts|2",
  ].sort(), show(run));
  assert.deepEqual(run.record.allowed.map((item) => `${item.file}|${item.kind}|${item.count}`).sort(), ["src/lib/operator-info.ts|email|1", "src/lib/operator-info.ts|ng-word|1"]);
});

test("an instruction file may show a placeholder home path; other files, and a real-looking home path, fail", (t) => {
  const run = runTool(makeTree(t, {
    ...cleanBase(),
    "AGENTS.md": `Example: ${HOME_PLACEHOLDER}project/AGENTS.md is read first.\n`,
    "docs/guide.md": `Example: ${HOME_PLACEHOLDER}project/AGENTS.md is read first.\n`,
    "CLAUDE.md": `@AGENTS.md\nSee ${HOME}project for the notes.\n`,
  }));
  assert.equal(run.status, 1, show(run));
  assert.deepEqual(fails(run).map(where).sort(), ["local-path|ローカルのパス|CLAUDE.md|2", "local-path|ローカルのパス|docs/guide.md|1"], show(run));
  assert.deepEqual(run.record.allowed.map((item) => `${item.file}|${item.kind}`), ["AGENTS.md|local-path"]);
});

test("private-pr checks only secrets inside the non-public directories", (t) => {
  const notes = [`Notes in ${HOME}work`, `Mail ${FAKE.email}`, `By ${FAKE.ngWord}`, `account ${noise(32, 7, "0123456789abcdef")}`, `https://${realHost()}/`].join("\n");
  const run = runTool(makeTree(t, { ...cleanBase(), ".agent-harness/runs/notes.md": notes, "research/probe/key.md": `${BEGIN}OPENSSH PRIVATE KEY-----\n` }));
  assert.equal(run.status, 1, show(run));
  assert.deepEqual(fails(run).map(where), ["secret|秘密鍵|research/probe/key.md|1"], show(run));
  assert.match(run.stdout, /の 2件は秘密の検査だけ/);
});

test("the public profile fails while a non-public directory is in the tree, without listing what is inside", (t) => {
  const run = runTool(makeTree(t, { ...cleanBase(), ".kiro/specs/plan.md": `Draft in ${HOME}plans\n` }), ["--profile", "public"]);
  assert.equal(run.status, 1, show(run));
  assert.deepEqual(fails(run).map(where).sort(), [
    "non-public-dir|公開しないディレクトリが木にある（1件）|.kiro/|-", "tool|gitleaks が無いため秘密の検出（木と履歴）を実施できない|(gitleaks)|-",
  ].sort(), show(run));
});

test("--tree checks a directory like public and skips dependencies and build output", (t) => {
  const root = makeTree(t, { ...cleanBase(), "research/notes.md": "notes\n", "node_modules/pkg/index.js": `${BEGIN}RSA PRIVATE KEY-----\n` }, false);
  const run = runTool(root, ["--tree", "."]);
  assert.equal(run.status, 1, show(run));
  assert.equal(run.record.profile, "tree");
  assert.deepEqual(fails(run).map(where).sort(), [
    "non-public-dir|公開しないディレクトリが木にある（1件）|research/|-", "tool|gitleaks が無いため秘密の検出（木と履歴）を実施できない|(gitleaks)|-",
  ].sort(), show(run));
  assert.match(run.stdout, /対象外のディレクトリ（生成物・依存）：node_modules\//);
});

test("a clean snapshot passes --tree when gitleaks and ffprobe are available", (t) => {
  if (!GITLEAKS || !HAS_FFMPEG) { t.skip("gitleaks か ffmpeg/ffprobe が無いため"); return; }
  const root = makeTree(t, cleanBase(), false);
  mkdirSync(join(root, "public/tour"), { recursive: true });
  assert.equal(spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=16x16:d=0.1", "-c:v", "libvpx", "-y", join(root, "public/tour/clip.webm")]).status, 0);
  const run = runTool(root, ["--tree", "."], { gitleaks: GITLEAKS });
  assert.equal(run.status, 0, show(run));
  assert.deepEqual(run.record.findings, [], show(run));
  assert.match(run.stdout, /スナップショットの木/);
});

test("without gitleaks or ffprobe, private-pr says 未実施 and passes, while publishing checks fail", (t) => {
  const files = { ...cleanBase(), "public/clip.mp4": "not decoded when ffprobe is missing" };
  const privateRun = runTool(makeTree(t, files), [], { gitleaks: NO_TOOL, ffprobe: NO_TOOL });
  assert.equal(privateRun.status, 0, show(privateRun));
  assert.deepEqual(privateRun.record.notRun.map((item) => item.check).sort(), ["gitleaks（作業の木と履歴）", "動画・音声の付帯情報（1件）"].sort());
  const treeRun = runTool(makeTree(t, files, false), ["--tree", "."], { gitleaks: NO_TOOL, ffprobe: NO_TOOL });
  assert.equal(treeRun.status, 1, show(treeRun));
  assert.deepEqual(fails(treeRun).map(where).sort(), [
    "tool|ffprobe が無いため動画の付帯情報を確かめられない|(ffprobe)|-", "tool|gitleaks が無いため秘密の検出（木と履歴）を実施できない|(gitleaks)|-",
  ].sort(), show(treeRun));
});

test("gitleaks catches what the patterns miss, in the work tree and in the whole history", (t) => {
  if (!GITLEAKS) { t.skip("gitleaks が無いため"); return; }
  const treeRun = runTool(makeTree(t, { ...cleanBase(), "src/hook.ts": `const hook = "${slackHook()}";\n` }), [], { gitleaks: GITLEAKS });
  assert.equal(treeRun.status, 1, show(treeRun));
  assert.deepEqual(fails(treeRun).map(where), ["secret|gitleaks（作業の木）：slack-webhook-url|src/hook.ts|1"], show(treeRun));
  const repo = makeTree(t, { ...cleanBase(), "src/mailer.ts": `const mailer = "${sendgridKey()}";\n` });
  commitAll(repo, "add the mailer");
  rmSync(join(repo, "src/mailer.ts"));
  commitAll(repo, "remove the mailer");
  const historyRun = runTool(repo, [], { gitleaks: GITLEAKS });
  assert.equal(historyRun.status, 1, show(historyRun));
  assert.equal(fails(historyRun).length, 1, show(historyRun));
  assert.match(where(fails(historyRun)[0]), /^secret\|gitleaks（履歴・[0-9a-f]{7}）：sendgrid-api-token\|src\/mailer\.ts\|1$/);
});

test("a missing, empty or broken NG list fails with the steps to fix it, and never prints a pattern", (t) => {
  const root = makeTree(t, cleanBase());
  const missing = runTool(root, [], { ngFile: join(SHARED, "no-such-list.txt") });
  assert.equal(missing.status, 1, show(missing));
  assert.deepEqual(fails(missing).map(where), ["ng-word|一覧が無い|.precheck-ng.txt|-"]);
  assert.match(missing.stdout, /\.precheck-ng\.example\.txt を \.precheck-ng\.txt に写して/);
  const empty = runTool(root, [], { ngFile: ngList(["# nothing yet"]) });
  assert.deepEqual(fails(empty).map(where), ["ng-word|一覧に語句が1つも無い|.precheck-ng.txt|-"]);
  const broken = runTool(root, [], { ngFile: ngList(["# list", FAKE.ngWord, "(unclosed[group"]) });
  assert.equal(broken.status, 1, show(broken));
  assert.deepEqual(fails(broken).map(where), ["ng-word|一覧の3行目が正しい正規表現でない|.precheck-ng.txt|3"]);
  assert.ok(![broken.stdout, broken.recordText].some((text) => text.includes("unclosed")), "the broken pattern is not printed");
});

test("commit e-mail: a warning before a private commit, a failure in the history of a tree to publish", (t) => {
  const root = makeTree(t, cleanBase());
  gitIn(root, ["config", "user.email", FAKE.email]);
  const privateRun = runTool(root);
  assert.equal(privateRun.status, 0, show(privateRun));
  assert.deepEqual(warns(privateRun).map(where), ["commit-email|次の commit のメールが公開用（users.noreply.github.com）でない|(git の設定)|-"]);
  commitAll(root, "first");
  const publicRun = runTool(root, ["--profile", "public"]);
  assert.equal(publicRun.status, 1);
  assert.ok(fails(publicRun).some((finding) => finding.kind === "commit-email" && finding.label.startsWith("履歴の作者・コミッターのメールが公開用でない（1コミット")), show(publicRun));
  assert.ok(![publicRun.stdout, publicRun.recordText].some((text) => text.includes(FAKE.email)), "the address is not printed");
});

test("the config can never excuse a secret", (t) => {
  const config = join(SHARED, "bad-config.json");
  writeFileSync(config, JSON.stringify({ nonPublicDirs: [".agent-harness/"], allow: [{ path: "src/a.ts", kinds: ["secret"], reason: "never" }] }));
  const run = runTool(makeTree(t, cleanBase()), [], { config });
  assert.equal(run.status, 2, show(run));
  assert.match(run.stderr, /「secret」は許せない種類です/);
});

test("the output and the record name the place and the kind, never the value found", (t) => {
  const values = {
    token: `${GITHUB_PREFIX}${noise(36, 41)}`, assigned: noise(24, 42), turnstile: `${TURNSTILE_PREFIX}${noise(25, 43)}`,
    hex: noise(32, 44, "0123456789abcdef"), slack: slackHook(),
  };
  const root = makeTree(t, {
    ...cleanBase(),
    "docs/leaks.md": [`${HOME}secret-notes.txt`, `Mail ${FAKE.email}`, `By ${FAKE.ngWord}`, `https://${realHost()}/`].join("\n"),
    "wrangler.jsonc": `{ "account_id": "${FAKE.accountId}", "zone": "${values.hex}" }\n`,
    "src/keys.ts": `const github = "${values.token}";\nexport const conf = { ${KEY_FIELD}: "${values.assigned}" };\nconst turnstile = "${values.turnstile}";\nconst hook = "${values.slack}";\n`,
    "public/shot.png": png([pngChunk("tEXt", latin1(`Author\0${FAKE.person}`))]),
    [`docs/${FAKE.ngWord}-notes.md`]: "notes\n",
  });
  if (HAS_FFMPEG) {
    mkdirSync(join(root, "public/tour"), { recursive: true });
    spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=16x16:d=0.1", "-c:v", "mpeg4", "-metadata", `comment=${FAKE.comment}`, "-y", join(root, "public/tour/shot.mp4")]);
  }
  const run = runTool(root, [], { gitleaks: GITLEAKS });
  assert.equal(run.status, 1, show(run));
  assert.ok(fails(run).length >= 12, "every planted value is found");
  const secrets = [...Object.values(values), ...Object.values(FAKE), FAKE.email.split("@")[0]];
  for (const [channel, text] of [["stdout", run.stdout], ["stderr", run.stderr], ["record", run.recordText]]) {
    for (const [index, value] of secrets.entries()) assert.ok(!text.toLowerCase().includes(value.toLowerCase()), `${channel} must not contain planted value #${index}`);
  }
});
