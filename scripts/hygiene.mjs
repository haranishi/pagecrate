#!/usr/bin/env node
// Pre-publication check (the HygieneTool of tasks-release.md 7.1). One command confirms that the files about to be
// committed or published hold no secrets, no personal or company information, no account identifiers and no private
// metadata in images and videos. It prints and records only "file:line kind", never the value it found, so its output
// can be pasted into a review as it is.
//
//   npm run hygiene                       private-pr (default): before a commit or PR to the private repository. The
//                                         non-public directories (hygiene.config.json) get the secret checks only.
//   npm run hygiene -- --profile public   the working tree as if it were published: the non-public directories must
//                                         be absent, and gitleaks and ffprobe must be available.
//   npm run hygiene -- --tree <dir>       a directory instead of git (the public snapshot), treated like public.
//
// Other options: --config <file> (default scripts/hygiene.config.json), --ng-file <file> (default .precheck-ng.txt at
// the repository root, also for --tree), --evidence-dir <dir> (default .agent-harness/evidence/hygiene), --by <name>
// (who ran it, for the record row). HYGIENE_GITLEAKS and HYGIENE_FFPROBE name the external tools when they are not at
// /opt/homebrew/bin/gitleaks and on PATH. Exit status: 0 passed, 1 something failed, 2 bad arguments or config.
//
// Adapted from scripts/precheck.mjs of the hundred-days repository (https://github.com/haranishi/hundred-days), which
// is under the MIT License:
//
//   Copyright (c) 2026 haranishi
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
//   documentation files (the "Software"), to deal in the Software without restriction, including without limitation
//   the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
//   permit persons to whom the Software is furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all copies or substantial portions of
//   the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
//   WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS
//   OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
//   OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
// Changes from that tool:
// - It failed whenever CLAUDE.md was tracked and scanned instruction files like any other text. Here CLAUDE.md and
//   AGENTS.md are tracked on purpose (`next dev` writes AGENTS.md and CLAUDE.md only includes it), so that rule is gone.
//   A path written in them to explain something (a home directory spelled with a placeholder) passes only through an
//   "allow" entry in hygiene.config.json that names the file, the kind and the accepted shape; a real home path fails.
// - It printed an invalid NG pattern and the commit e-mail address. Nothing found is ever printed here.
// - Added: account identifiers, e-mail addresses as failures, image/video metadata, gitleaks over the tree and the
//   whole history, the profiles, and a JSON record without values.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_ROOT = resolve(SCRIPT_DIR, "..");
const NG_FILE_NAME = ".precheck-ng.txt";
const PROFILES = new Set(["private-pr", "public"]);
/** Build output, dependencies and git's own store are never published; --tree skips them at any depth. */
const SKIP_DIRS = new Set([".git", "node_modules", ".next", ".open-next", ".wrangler"]);

const KIND = {
  secret: "秘密",
  "local-path": "ローカルのパス",
  "ng-word": "個人NGワード",
  "account-id": "アカウントの識別子",
  email: "メールアドレス",
  "media-metadata": "画像・動画の付帯情報",
  "non-public-dir": "公開しないディレクトリ",
  "private-file": "公開しないファイル",
  "commit-email": "コミットのメール",
  tool: "点検の道具",
};
/** Kinds a config entry may excuse inside one named file. A secret is removed from the file, never excused. */
const EXCUSABLE = new Set(["local-path", "ng-word", "account-id", "email", "media-metadata"]);

// ---------------------------------------------------------------------------------------------------------------
// Text rules. Each yields at most one finding per line; `keep` drops matches that are samples or placeholders.

/** Fake values in tests say so (test, fake...) or are words joined by hyphens: a label, not a random key. */
const SAMPLE_WORDS = /test|fake|dummy|example|sample|placeholder|redacted|change-?me|not-?a-?real|your[-_]|x{4,}/i;
const isSampleSecret = (value) =>
  SAMPLE_WORDS.test(value) || /^(.)\1+$/.test(value) || /^<[^>]+>$/.test(value) || /^\$\{?[A-Z_][A-Z0-9_]*\}?$/.test(value) ||
  /^[a-z]+(?:[-_][a-z0-9]+){2,}$/.test(value);
const isSampleEmail = (address) => {
  const [local = "", domain = ""] = address.toLowerCase().split("@");
  return /^no-?reply$/.test(local) || domain.includes("noreply") || /(?:^|\.)example\./.test(domain) ||
    /\.(?:example|test|invalid|localhost)$/.test(domain) || (local === "git" && /^(?:github\.com|gitlab\.com|bitbucket\.org)$/.test(domain));
};
/** The account label of a workers.dev host (the one before "workers.dev") must be a placeholder to pass. */
const PLACEHOLDER_LABEL = /^(?:<[^>]*>|\{[^}]*\}|\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*|\[[^\]]*\]|\*|example|your[-_]?subdomain|subdomain|account[-_]?subdomain|my[-_]?subdomain|x{3,})$/i;
const isRealSubdomain = (prefix) => {
  const labels = prefix.split(".").filter(Boolean);
  return labels.length > 0 && !PLACEHOLDER_LABEL.test(labels[labels.length - 1]);
};
/** account_id = <value>: only values shaped like an id fail (eight or more id characters including a digit). */
const looksLikeId = (value) => /^[A-Za-z0-9_-]{8,}$/.test(value) && /\d/.test(value) && !SAMPLE_WORDS.test(value);
/** Settings files, where a 32-digit hex string is taken to be a Cloudflare account_id. */
const CONFIG_FILE = /(?:^|\/)(?:wrangler[^/]*\.(?:json|jsonc|toml)|\.dev\.vars[^/]*|\.env[^/]*|[^/]*\.config\.(?:[cm]?[jt]s|json)|[^/]*\.(?:toml|ini|ya?ml|jsonc)|package\.json)$/i;

const TEXT_RULES = [
  { id: "private-key", kind: "secret", label: "秘密鍵", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { id: "api-token", kind: "secret", label: "API キー・トークン", re: /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?:AKIA|ASIA)[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|npm_[A-Za-z0-9]{36}|glpat-[A-Za-z0-9_-]{20,}|[sr]k_live_[A-Za-z0-9]{16,})/g },
  { id: "secret-assignment", kind: "secret", label: "秘密の代入", re: /(?:api[_-]?key|secret|token|password)["']?\s*[:=]\s*(["'])([^"'\n]{8,})\1/gi, keep: (m) => !isSampleSecret(m[2]) },
  { id: "local-path", kind: "local-path", label: "ローカルのパス", re: /(?:\/Users\/|\/home\/[a-z][a-z0-9_-]*\/|\/private\/(?:tmp|var)\/|\/var\/folders\/|\/Volumes\/|\b[A-Za-z]:[\\/]+Users[\\/]+)/g },
  { id: "hex32", kind: "account-id", label: "32桁の16進", re: /(?<![0-9A-Fa-f])[0-9A-Fa-f]{32}(?![0-9A-Fa-f])/g, severity: (file, line) => (CONFIG_FILE.test(file) || /account/i.test(line) ? "fail" : "warn") },
  { id: "account-id-value", kind: "account-id", label: "account_id の値", re: /\b(?:CLOUDFLARE_)?ACCOUNT[_-]?ID["']?\s*[:=]\s*["']?([^\s"',;)}\]]*)/gi, keep: (m) => looksLikeId(m[1]) },
  { id: "workers-dev", kind: "account-id", label: "workers.dev のサブドメイン", re: /(?<![A-Za-z0-9_-])((?:[A-Za-z0-9*<>{}[\]$_-]+\.)*)workers\.dev\b/gi, keep: (m) => isRealSubdomain(m[1]) },
  // Turnstile keys start with 0x4AAAAAAA. The site key is public and short (Cloudflare's test site key has 24
  // characters); the secret key is longer (its test secret has 35), so only the longer form fails.
  { id: "turnstile-secret", kind: "secret", label: "Turnstile の秘密鍵", re: /\b0x4AAAAAAA[A-Za-z0-9_-]{20,}/g },
  { id: "email", kind: "email", label: "メールアドレス", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, keep: (m) => !isSampleEmail(m[0]) },
];
const SECRET_RULES = TEXT_RULES.filter((rule) => rule.kind === "secret");
const PRIVATE_TEXT_IDS = new Set(["local-path", "email"]);

/** Files that must never be committed or published, whatever they contain. */
const PRIVATE_FILES = [
  [/^\.precheck-ng\.txt$/, "個人NGワードの一覧（.gitignore に入れる）"],
  [/(?:^|\/)\.dev\.vars(?!\.example$)[^/]*$/, "秘密値のファイル（.dev.vars）"],
  [/(?:^|\/)\.env(?!\.example$|\.sample$)[^/]*$/, "秘密値のファイル（.env）"],
  [/(?:^|\/)\.wrangler\//, "wrangler の手元の状態（.wrangler/）"],
  [/(?:^|\/)\.agent-harness\/evidence\//, "評価や点検の控え（.agent-harness/evidence/）"],
];

// ---------------------------------------------------------------------------------------------------------------
// Image, SVG and video metadata.

const latin1 = (buf, start, end) => buf.toString("latin1", start, Math.min(end, buf.length));
const PNG_TEXT_CHUNKS = new Set(["tEXt", "iTXt", "zTXt", "eXIf"]);
const XMP_NAMESPACES = ["http://ns.adobe.com/xap/1.0/\0", "http://ns.adobe.com/xmp/extension/\0"];

/** A TIFF block (Exif) carries the shooting position when IFD0 has the GPSInfo tag (0x8825). */
function tiffHasGps(buf) {
  if (buf.length < 8) return false;
  const order = latin1(buf, 0, 2);
  if (order !== "II" && order !== "MM") return false;
  const u16 = (at) => (order === "II" ? buf.readUInt16LE(at) : buf.readUInt16BE(at));
  const u32 = (at) => (order === "II" ? buf.readUInt32LE(at) : buf.readUInt32BE(at));
  const ifd = u32(4);
  if (ifd + 2 > buf.length) return false;
  for (let i = 0, count = u16(ifd); i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > buf.length) return false;
    if (u16(entry) === 0x8825) return true;
  }
  return false;
}

function pngMetadata(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) return ["PNG として読めない"];
  const found = [];
  for (let at = 8; at + 8 <= buf.length;) {
    const length = buf.readUInt32BE(at);
    const type = latin1(buf, at + 4, at + 8);
    if (at + 12 + length > buf.length) return [...found, "PNG の途中が欠けている"];
    if (PNG_TEXT_CHUNKS.has(type)) found.push(`PNG の ${type}`);
    if (type === "eXIf" && tiffHasGps(buf.subarray(at + 8, at + 8 + length))) found.push("PNG の GPS（撮影の位置）");
    if (type === "IEND") return found;
    at += 12 + length;
  }
  return [...found, "PNG の終わり（IEND）が無い"];
}

function jpegMetadata(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return ["JPEG として読めない"];
  const found = [];
  for (let at = 2; at + 4 <= buf.length;) {
    if (buf[at] !== 0xff) return [...found, "JPEG の区切りが読めない"];
    const marker = buf[at + 1];
    if (marker === 0xff) { at += 1; continue; } // fill byte
    if (marker === 0xd9 || marker === 0xda) break; // end of image, or start of scan: metadata segments come before it
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { at += 2; continue; }
    const length = buf.readUInt16BE(at + 2);
    if (length < 2 || at + 2 + length > buf.length) return [...found, "JPEG の途中が欠けている"];
    const data = buf.subarray(at + 4, at + 2 + length);
    if (marker === 0xe1 && latin1(data, 0, 6) === "Exif\0\0") {
      found.push("JPEG の Exif");
      if (tiffHasGps(data.subarray(6))) found.push("JPEG の GPS（撮影の位置）");
    } else if (marker === 0xe1 && XMP_NAMESPACES.some((ns) => latin1(data, 0, ns.length) === ns)) found.push("JPEG の XMP");
    else if (marker === 0xed && latin1(data, 0, 14) === "Photoshop 3.0\0") found.push("JPEG の IPTC");
    else if (marker === 0xfe) found.push("JPEG のコメント");
    at += 2 + length;
  }
  return found;
}

function webpMetadata(buf) {
  if (buf.length < 12 || latin1(buf, 0, 4) !== "RIFF" || latin1(buf, 8, 12) !== "WEBP") return ["WebP として読めない"];
  const found = [];
  for (let at = 12; at + 8 <= buf.length;) {
    const type = latin1(buf, at, at + 4);
    const length = buf.readUInt32LE(at + 4);
    if (at + 8 + length > buf.length) return [...found, "WebP の途中が欠けている"];
    const data = buf.subarray(at + 8, at + 8 + length);
    if (type === "EXIF") {
      found.push("WebP の EXIF");
      if (tiffHasGps(latin1(data, 0, 6) === "Exif\0\0" ? data.subarray(6) : data)) found.push("WebP の GPS（撮影の位置）");
    }
    if (type === "XMP ") found.push("WebP の XMP");
    at += 8 + length + (length & 1);
  }
  return found;
}

const IMAGE_CHECKS = { png: pngMetadata, apng: pngMetadata, jpg: jpegMetadata, jpeg: jpegMetadata, webp: webpMetadata };
/** Containers ffprobe reads; tags other than the mechanical ones below are private (title, artist, comment...). */
const PROBED = new Set(["mp4", "m4v", "mov", "webm", "mkv", "mp3", "m4a", "wav", "ogg", "oga", "opus", "flac", "aac"]);
const VIDEO_TAGS_OK = new Set(["encoder", "handler_name", "major_brand", "minor_version", "compatible_brands", "language", "duration"]);
const UNCHECKED_IMAGES = new Set(["gif", "avif", "heic", "heif", "tif", "tiff", "bmp", "ico", "psd"]);
const SVG_TRACES = [
  ["<metadata>", /<metadata\b/i], ["inkscape:", /\binkscape:/i], ["sodipodi:", /\bsodipodi:/i], ["rdf:RDF", /<rdf:RDF\b/i],
  ["xmlns:dc", /\bxmlns:dc=/i], ["Adobe Illustrator", /Generator: Adobe Illustrator/i], ["xmlns:sketch", /\bxmlns:sketch=/i],
];

// ---------------------------------------------------------------------------------------------------------------

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = {
    profile: "private-pr", profileGiven: false, tree: null, config: join(SCRIPT_DIR, "hygiene.config.json"),
    ngFile: join(TOOL_ROOT, NG_FILE_NAME), evidenceDir: join(TOOL_ROOT, ".agent-harness", "evidence", "hygiene"), by: "（記入）", help: false,
  };
  const takes = { "--profile": "profile", "--tree": "tree", "--config": "config", "--ng-file": "ngFile", "--evidence-dir": "evidenceDir", "--by": "by" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--help" || argv[i] === "-h") { opts.help = true; continue; }
    const key = takes[argv[i]];
    if (!key) throw new UsageError(`知らない指定です：${argv[i]}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) throw new UsageError(`${argv[i - 1]} の値がありません`);
    opts[key] = value;
    if (key === "profile") opts.profileGiven = true;
  }
  if (!PROFILES.has(opts.profile)) throw new UsageError("--profile は private-pr か public です");
  if (opts.tree && opts.profileGiven && opts.profile !== "public") throw new UsageError("--tree はいつも public と同じ扱いです（--profile private-pr とは併用できません）");
  return opts;
}

function loadConfig(file) {
  let raw;
  try { raw = JSON.parse(readFileSync(file, "utf8")); } catch { throw new UsageError(`設定を読めません：${basename(file)}`); }
  const dirs = raw.nonPublicDirs;
  if (!Array.isArray(dirs) || dirs.some((d) => typeof d !== "string" || !d.endsWith("/") || d.startsWith("/") || d.split("/").includes(".."))) {
    throw new UsageError("設定の nonPublicDirs は、末尾が / の相対パスの一覧にしてください");
  }
  const allow = (raw.allow ?? []).map((entry, index) => {
    const where = `設定の allow の ${index + 1} 件目`;
    if (typeof entry?.path !== "string" || !entry.path || isAbsolute(entry.path)) throw new UsageError(`${where}：path が要ります`);
    if (!Array.isArray(entry.kinds) || entry.kinds.length === 0) throw new UsageError(`${where}：kinds が要ります`);
    for (const kind of entry.kinds) if (!EXCUSABLE.has(kind)) throw new UsageError(`${where}：「${kind}」は許せない種類です（許せるのは ${[...EXCUSABLE].join("・")}）`);
    if (typeof entry.reason !== "string" || !entry.reason.trim()) throw new UsageError(`${where}：reason（許す理由）が要ります`);
    let only = null;
    if (entry.only !== undefined) {
      if (!Array.isArray(entry.only) || entry.only.length === 0) throw new UsageError(`${where}：only は正規表現の一覧です`);
      try { only = entry.only.map((source) => new RegExp(source)); } catch { throw new UsageError(`${where}：only に正しくない正規表現があります`); }
    }
    return { path: entry.path, kinds: new Set(entry.kinds), only };
  });
  return { nonPublicDirs: dirs, allow, sha256: createHash("sha256").update(readFileSync(file)).digest("hex") };
}

/** NG patterns from the private list. A missing, empty or broken list is a failure; the patterns are never printed. */
function loadNgRules(file, report) {
  const guide = `${NG_FILE_NAME} が要ります。.precheck-ng.example.txt を ${NG_FILE_NAME} に写して、公開したくない語句を1行に1つ書いてください（大文字小文字を区別しない正規表現。# で始まる行は説明。このファイルは .gitignore 済みで、リポジトリには入りません）`;
  if (!existsSync(file)) {
    report.add({ severity: "fail", kind: "ng-word", label: "一覧が無い", file: NG_FILE_NAME, line: null });
    report.notRun.push({ check: "個人NGワード", reason: guide });
    return [];
  }
  const rules = [];
  readFileSync(file, "utf8").split(/\r?\n/).forEach((raw, index) => {
    const source = raw.trim();
    if (!source || source.startsWith("#")) return;
    try { rules.push({ id: "ng-word", kind: "ng-word", label: `個人NGワード（一覧の${index + 1}行目）`, re: new RegExp(source, "gi") }); }
    catch { report.add({ severity: "fail", kind: "ng-word", label: `一覧の${index + 1}行目が正しい正規表現でない`, file: NG_FILE_NAME, line: index + 1 }); }
  });
  if (rules.length === 0) {
    report.add({ severity: "fail", kind: "ng-word", label: "一覧に語句が1つも無い", file: NG_FILE_NAME, line: null });
    report.notRun.push({ check: "個人NGワード", reason: guide });
  }
  return rules;
}

function createReport() {
  const findings = [];
  const seen = new Set();
  const allowed = new Map();
  return {
    findings, allowed, notRun: [],
    add(finding) {
      const key = [finding.severity, finding.kind, finding.label, finding.file, finding.line].join("\u0000");
      if (seen.has(key)) return;
      seen.add(key);
      findings.push(finding);
    },
    allow(file, kind) { const key = `${file}\u0000${kind}`; allowed.set(key, (allowed.get(key) ?? 0) + 1); },
  };
}

const run = (cmd, args, options = {}) => spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options });

function gitTarget() {
  const top = run("git", ["rev-parse", "--show-toplevel"]);
  if (top.error || top.status !== 0) throw new UsageError("git の作業ツリーではありません。ディレクトリを点検するときは --tree <dir> を使ってください");
  const root = top.stdout.trim();
  const listed = run("git", ["-C", root, "ls-files", "-c", "-o", "--exclude-standard", "-z"]);
  if (listed.status !== 0) throw new UsageError("git ls-files に失敗しました");
  const files = [];
  let deleted = 0;
  for (const rel of [...new Set(listed.stdout.split("\0").filter(Boolean))].sort()) {
    const abs = join(root, rel);
    let stat;
    try { stat = lstatSync(abs); } catch { deleted++; continue; } // listed by the index but gone from the tree
    if (stat.isSymbolicLink()) files.push({ rel, abs, link: true });
    else if (stat.isFile()) files.push({ rel, abs, link: false });
  }
  const commits = run("git", ["-C", root, "rev-list", "--all", "--count"]);
  return { mode: "git", root, name: basename(root), files, deleted, skipped: [], hasHistory: true, commits: commits.status === 0 ? Number(commits.stdout.trim()) : 0 };
}

function treeTarget(dir) {
  const root = resolve(dir);
  let stat;
  try { stat = lstatSync(root); } catch { throw new UsageError("--tree のディレクトリがありません"); }
  if (!stat.isDirectory()) throw new UsageError("--tree にはディレクトリを指定してください");
  const files = [];
  const skipped = [];
  const walk = (relDir) => {
    for (const entry of readdirSync(join(root, relDir), { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(rel);
        else if (entry.name !== ".git") skipped.push(`${rel}/`);
      } else if (entry.isSymbolicLink()) files.push({ rel, abs: join(root, rel), link: true });
      else if (entry.isFile()) files.push({ rel, abs: join(root, rel), link: false });
    }
  };
  walk("");
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const hasHistory = existsSync(join(root, ".git"));
  const commits = hasHistory ? run("git", ["-C", root, "rev-list", "--all", "--count"]) : null;
  return { mode: "tree", root, name: basename(root), files, deleted: 0, skipped, hasHistory, commits: commits?.status === 0 ? Number(commits.stdout.trim()) : 0 };
}

/** A path token from a match onward, for the "only" shapes of an allow entry (placeholders like <name> included). */
const tokenAt = (line, index) => /^[^\s"'`)\],;|]+/.exec(line.slice(index))?.[0] ?? "";

function excused(config, file, kind, token) {
  return config.allow.some((entry) => entry.path === file && entry.kinds.has(kind) && (!entry.only || entry.only.some((re) => re.test(token))));
}

/** Runs rules over each line; every hit becomes a finding unless the config excuses it for this file. */
function scanText(file, text, rules, ctx) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of rules) {
      for (const match of line.matchAll(rule.re)) {
        if (rule.keep && !rule.keep(match)) continue;
        if (excused(ctx.config, file, rule.kind, tokenAt(line, match.index))) { ctx.report.allow(file, rule.kind); continue; }
        ctx.report.add({ severity: rule.severity ? rule.severity(file, line) : "fail", kind: rule.kind, label: rule.label, file, line: i + 1 });
        break;
      }
    }
  }
}

/** True when a short text (a file name, a link target, a media tag) holds a path, an address or an NG word. */
function privateText(text, ctx) {
  return [...TEXT_RULES.filter((rule) => PRIVATE_TEXT_IDS.has(rule.id)), ...ctx.ngRules].some((rule) =>
    [...text.matchAll(rule.re)].some((match) => !rule.keep || rule.keep(match)));
}

/** File names are printed, so a name that is itself private is masked (and reported). */
function safeName(rel, ctx) {
  let out = rel;
  for (const rule of [...TEXT_RULES.filter((r) => r.id === "email"), ...ctx.ngRules]) out = out.replace(rule.re, "＊＊＊");
  return out;
}

function probeTool(bin, versionArgs, pick) {
  const result = run(bin, versionArgs);
  if (result.error || result.status !== 0) return null;
  return pick(`${result.stdout}`.trim()) || "不明";
}

function checkMedia(file, abs, ext, ctx) {
  const buf = readFileSync(abs);
  const found = IMAGE_CHECKS[ext](buf);
  if (buf.includes("<x:xmpmeta") && !found.some((label) => label.includes("XMP"))) found.push("XMP（作成ツールの情報）");
  for (const label of found) {
    if (excused(ctx.config, file, "media-metadata", "")) { ctx.report.allow(file, "media-metadata"); continue; }
    ctx.report.add({ severity: "fail", kind: "media-metadata", label, file, line: null });
  }
}

function checkSvg(file, text, ctx) {
  const lines = text.split(/\r?\n/);
  for (const [name, re] of SVG_TRACES) {
    const index = lines.findIndex((line) => re.test(line));
    if (index >= 0) ctx.report.add({ severity: "warn", kind: "media-metadata", label: `SVG の作成ツールの痕跡（${name}）`, file, line: index + 1 });
  }
}

function checkProbed(file, abs, ctx) {
  const result = run(ctx.ffprobe.bin, ["-v", "error", "-show_entries", "format_tags:stream_tags", "-of", "json", abs]);
  if (result.error || result.status !== 0) { ctx.report.add({ severity: "fail", kind: "media-metadata", label: "動画・音声として読めない", file, line: null }); return; }
  let data;
  try { data = JSON.parse(result.stdout); } catch { ctx.report.add({ severity: "fail", kind: "media-metadata", label: "ffprobe の出力を読めない", file, line: null }); return; }
  const tagSets = [data.format?.tags ?? {}, ...(data.streams ?? []).map((stream) => stream.tags ?? {})];
  for (const tags of tagSets) {
    for (const [key, value] of Object.entries(tags)) {
      const name = /^[A-Za-z_][A-Za-z0-9_.:-]{0,40}$/.test(key) && !privateText(key, ctx) ? key : "名前を伏せた項目";
      const lower = key.toLowerCase();
      let problem = null;
      if (lower === "creation_time") problem = ["warn", "動画の creation_time（作成日時）"];
      else if (!VIDEO_TAGS_OK.has(lower)) problem = ["fail", `動画の ${name}`];
      else if (privateText(String(value), ctx)) problem = ["fail", `動画の ${name}（私的な値）`];
      if (!problem) continue;
      if (excused(ctx.config, file, "media-metadata", "")) { ctx.report.allow(file, "media-metadata"); continue; }
      ctx.report.add({ severity: problem[0], kind: "media-metadata", label: problem[1], file, line: null });
    }
  }
}

function scanFiles(target, ctx) {
  const counts = { files: target.files.length, text: 0, images: 0, probed: 0, binary: 0, links: 0, secretOnly: 0, nonPublic: 0 };
  const probedFiles = [];
  for (const entry of target.files) {
    const { rel, abs } = entry;
    if (rel === NG_FILE_NAME || rel.endsWith(`/${NG_FILE_NAME}`)) { ctx.report.add({ severity: "fail", kind: "private-file", label: PRIVATE_FILES[0][1], file: rel, line: null }); continue; }
    for (const [re, label] of PRIVATE_FILES.slice(1)) if (re.test(rel)) ctx.report.add({ severity: "fail", kind: "private-file", label, file: rel, line: null });
    const nonPublic = ctx.config.nonPublicDirs.some((dir) => rel.startsWith(dir));
    if (nonPublic && ctx.strict) { counts.nonPublic++; continue; } // reported once per directory; the tree must not hold it
    const secretOnly = nonPublic; // private-pr: work records stay private, so only secrets matter there
    if (!secretOnly && privateText(rel, ctx)) ctx.report.add({ severity: "fail", kind: "ng-word", label: "ファイル名に私的な語", file: rel, line: null });
    if (entry.link) {
      counts.links++;
      scanText(rel, readlinkSync(abs), secretOnly ? SECRET_RULES : ctx.allRules, ctx); // git stores the link text, not the target
      continue;
    }
    const ext = extname(rel).slice(1).toLowerCase();
    if (secretOnly) {
      counts.secretOnly++;
      if (!IMAGE_CHECKS[ext] && !PROBED.has(ext) && !UNCHECKED_IMAGES.has(ext)) {
        const buf = readFileSync(abs);
        if (!buf.subarray(0, 8000).includes(0)) scanText(rel, buf.toString("utf8"), SECRET_RULES, ctx);
      }
      continue;
    }
    if (IMAGE_CHECKS[ext]) { counts.images++; checkMedia(rel, abs, ext, ctx); continue; }
    if (PROBED.has(ext)) { counts.probed++; probedFiles.push(entry); continue; }
    if (UNCHECKED_IMAGES.has(ext)) { counts.binary++; ctx.report.add({ severity: "warn", kind: "media-metadata", label: "自動では確かめられない画像の形式（目で確かめる）", file: rel, line: null }); continue; }
    const buf = readFileSync(abs);
    if (buf.subarray(0, 8000).includes(0)) { counts.binary++; ctx.report.add({ severity: "warn", kind: "media-metadata", label: "バイナリ（目で確かめる）", file: rel, line: null }); continue; }
    counts.text++;
    const text = buf.toString("utf8");
    scanText(rel, text, ctx.allRules, ctx);
    if (ext === "svg") checkSvg(rel, text, ctx);
  }
  if (probedFiles.length > 0) {
    if (!ctx.ffprobe.version) {
      ctx.report.notRun.push({ check: `動画・音声の付帯情報（${probedFiles.length}件）`, reason: "ffprobe が見つからない" });
      if (ctx.strict) ctx.report.add({ severity: "fail", kind: "tool", label: "ffprobe が無いため動画の付帯情報を確かめられない", file: "(ffprobe)", line: null });
    } else for (const entry of probedFiles) checkProbed(entry.rel, entry.abs, ctx);
  }
  return counts;
}

/** gitleaks with its default rules only: a .gitleaks.toml, .gitleaksignore or inline allow comment cannot mute it. */
function gitleaks(ctx, args, mapFile, label) {
  const env = { ...process.env };
  delete env.GITLEAKS_CONFIG;
  delete env.GITLEAKS_CONFIG_TOML;
  const result = run(ctx.gitleaks.bin, [...args, "--config", ctx.gitleaks.config, "--redact", "--no-banner", "--no-color", "--log-level", "error",
    "--ignore-gitleaks-allow", "--exit-code", "99", "--report-format", "json", "--report-path", "-"], { cwd: ctx.gitleaks.work, env });
  if (result.error || (result.status !== 0 && result.status !== 99)) return { status: "error" };
  let report;
  try { report = JSON.parse(result.stdout.trim() || "[]"); } catch { return { status: "error" }; }
  for (const item of report) {
    const where = mapFile(item);
    const commit = typeof item.Commit === "string" && item.Commit ? `・${item.Commit.slice(0, 7)}` : "";
    ctx.report.add({ severity: "fail", kind: "secret", label: `gitleaks（${label}${commit}）：${String(item.RuleID ?? "不明")}`, file: where, line: Number(item.StartLine) || null });
  }
  return { status: "ok", findings: report.length };
}

function runGitleaks(target, ctx) {
  const withHistory = target.hasHistory && target.commits > 0;
  const summary = { tree: "未実施", history: withHistory ? "未実施" : "対象外（コミットが無い）" };
  if (!ctx.gitleaks.version) {
    ctx.report.notRun.push({ check: "gitleaks（作業の木と履歴）", reason: "gitleaks が見つからない" });
    if (ctx.strict) ctx.report.add({ severity: "fail", kind: "tool", label: "gitleaks が無いため秘密の検出（木と履歴）を実施できない", file: "(gitleaks)", line: null });
    return summary;
  }
  const work = mkdtempSync(join(tmpdir(), "hygiene-"));
  try {
    const farm = join(work, "tree");
    mkdirSync(farm);
    for (const entry of target.files) {
      if (entry.link || entry.rel === NG_FILE_NAME) continue;
      if (/^\.gitleaks(?:\.toml|ignore)$/.test(entry.rel)) continue; // would become gitleaks' own config; the text rules still read it
      const linkPath = join(farm, entry.rel);
      mkdirSync(dirname(linkPath), { recursive: true });
      symlinkSync(entry.abs, linkPath);
    }
    writeFileSync(join(work, "gitleaks.toml"), "[extend]\nuseDefault = true\n");
    const farmReal = realpathSync(farm);
    const rootReal = realpathSync(target.root);
    const leakCtx = { ...ctx, gitleaks: { ...ctx.gitleaks, config: join(work, "gitleaks.toml"), work } };
    const fromFarm = (item) => {
      const linked = typeof item.SymlinkFile === "string" && item.SymlinkFile ? item.SymlinkFile : String(item.File ?? "");
      for (const base of [farmReal, farm, rootReal, target.root]) if (linked.startsWith(base + sep)) return linked.slice(base.length + 1).split(sep).join("/");
      return basename(linked);
    };
    const tree = gitleaks(leakCtx, ["dir", farm, "--follow-symlinks"], fromFarm, "作業の木");
    summary.tree = tree.status === "ok" ? `実施（検出${tree.findings}件）` : "失敗";
    if (tree.status !== "ok") {
      ctx.report.notRun.push({ check: "gitleaks（作業の木）", reason: "gitleaks が異常終了した" });
      if (ctx.strict) ctx.report.add({ severity: "fail", kind: "tool", label: "gitleaks（作業の木）が異常終了した", file: "(gitleaks)", line: null });
    }
    if (withHistory) {
      const history = gitleaks(leakCtx, ["git", target.root, "--log-opts=--all"], (item) => String(item.File ?? ""), "履歴");
      summary.history = history.status === "ok" ? `実施（${target.commits}コミット・検出${history.findings}件）` : "失敗";
      if (history.status !== "ok") {
        ctx.report.notRun.push({ check: "gitleaks（履歴）", reason: "gitleaks が異常終了した" });
        if (ctx.strict) ctx.report.add({ severity: "fail", kind: "tool", label: "gitleaks（履歴）が異常終了した", file: "(gitleaks)", line: null });
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return summary;
}

/** Commit e-mail addresses: the next commit's (all profiles) and, when publishing, every commit in the history. */
function checkCommitEmails(target, ctx) {
  if (!target.hasHistory) return;
  if (target.mode === "git") {
    const configured = run("git", ["-C", target.root, "config", "user.email"]);
    const address = configured.status === 0 ? configured.stdout.trim() : "";
    if (!address || !isSampleEmail(address)) {
      ctx.report.add({ severity: ctx.strict ? "fail" : "warn", kind: "commit-email", label: address ? "次の commit のメールが公開用（users.noreply.github.com）でない" : "次の commit のメールが未設定", file: "(git の設定)", line: null });
    }
  }
  if (!ctx.strict) return; // the private repository's history is not published; the public one starts a new history
  const log = run("git", ["-C", target.root, "log", "--all", "--format=%h%x00%ae%x00%ce"]);
  if (log.status !== 0) return; // no commit yet
  const bad = log.stdout.split("\n").filter(Boolean).map((line) => line.split("\0")).filter(([, author = "", committer = ""]) => !isSampleEmail(author) || !isSampleEmail(committer)).map(([hash]) => hash);
  if (bad.length) ctx.report.add({ severity: "fail", kind: "commit-email", label: `履歴の作者・コミッターのメールが公開用でない（${bad.length}コミット：${bad.slice(0, 5).join("、")}${bad.length > 5 ? " ほか" : ""}）`, file: "(git の履歴)", line: null });
}

function localStamp(now) {
  const pad = (n) => String(n).padStart(2, "0");
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    file: `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
  };
}

const shown = (path) => (path.startsWith(TOOL_ROOT + sep) ? relative(TOOL_ROOT, path).split(sep).join("/") : path);

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 17).map((line) => line.replace(/^\/\/ ?/, "")).join("\n"));
    return 0;
  }
  const config = loadConfig(opts.config);
  const target = opts.tree ? treeTarget(opts.tree) : gitTarget();
  const profile = opts.tree ? "tree" : opts.profile;
  const strict = profile !== "private-pr";
  const report = createReport();
  const ngRules = loadNgRules(opts.ngFile, report);
  const gitleaksBin = process.env.HYGIENE_GITLEAKS || (existsSync("/opt/homebrew/bin/gitleaks") ? "/opt/homebrew/bin/gitleaks" : "gitleaks");
  const ffprobeBin = process.env.HYGIENE_FFPROBE || "ffprobe";
  const ctx = {
    config, report, ngRules, strict, allRules: [...TEXT_RULES, ...ngRules],
    gitleaks: { bin: gitleaksBin, version: probeTool(gitleaksBin, ["version"], (out) => out.split("\n")[0]) },
    ffprobe: { bin: ffprobeBin, version: probeTool(ffprobeBin, ["-version"], (out) => /version (\S+)/.exec(out)?.[1]) },
  };

  if (strict) {
    for (const dir of config.nonPublicDirs) {
      const count = target.files.filter((entry) => entry.rel.startsWith(dir)).length;
      if (count > 0) report.add({ severity: "fail", kind: "non-public-dir", label: `公開しないディレクトリが木にある（${count}件）`, file: dir, line: null });
    }
  }
  const counts = scanFiles(target, ctx);
  const leaks = runGitleaks(target, ctx);
  checkCommitEmails(target, ctx);

  const fails = report.findings.filter((f) => f.severity === "fail");
  const warns = report.findings.filter((f) => f.severity === "warn");
  const passed = fails.length === 0;
  const now = new Date();
  const stamp = localStamp(now);
  const scope = target.mode === "git"
    ? `作業ツリー（追跡と未追跡 ${counts.files}件）と履歴（${target.commits}コミット）`
    : `スナップショットの木（${target.name}・${counts.files}件）${target.hasHistory ? `と履歴（${target.commits}コミット）` : ""}`;
  const tools = `gitleaks ${ctx.gitleaks.version ?? "なし"}・ffprobe ${ctx.ffprobe.version ?? "なし"}`;
  const row = `| ${stamp.date} | ${scope} | npm run hygiene（${profile}・${tools}）／担当：${opts.by} | ${passed ? "合格" : "不合格"}（失敗${fails.length}・警告${warns.length}・未実施${report.notRun.length}） | ${passed ? "なし" : "（記入：削除・置換・公開の対象から外す）"} | ${passed ? "不要" : "（対処のあとに再実行）"} |`;

  const sorted = (list) => [...list].sort((a, b) => (a.file === b.file ? (a.line ?? 0) - (b.line ?? 0) : a.file < b.file ? -1 : 1));
  const where = (f) => `${safeName(f.file, ctx)}${f.line ? `:${f.line}` : ""}`;
  const out = [];
  out.push(`公開前の点検（${profile}）：${scope}`);
  if (target.deleted) out.push(`  作業ツリーから消したもの ${target.deleted}件は対象外`);
  if (counts.secretOnly) out.push(`  公開しないディレクトリ（${config.nonPublicDirs.join("・")}）の ${counts.secretOnly}件は秘密の検査だけ`);
  if (target.skipped.length) out.push(`  対象外のディレクトリ（生成物・依存）：${target.skipped.map((d) => safeName(d, ctx)).join("、")}`);
  out.push("", "| 種類 | 失敗 | 警告 | 許可（設定） |", "|---|---:|---:|---:|");
  for (const [kind, label] of Object.entries(KIND)) {
    const allowedCount = [...report.allowed].filter(([key]) => key.endsWith(`\u0000${kind}`)).reduce((sum, [, n]) => sum + n, 0);
    out.push(`| ${label} | ${fails.filter((f) => f.kind === kind).length} | ${warns.filter((f) => f.kind === kind).length} | ${allowedCount} |`);
  }
  out.push("", `gitleaks：作業の木 ${leaks.tree}／履歴 ${leaks.history}`);
  if (fails.length) out.push("", "失敗（場所と種類だけ。値は出しません）", ...sorted(fails).map((f) => `  ✖ ${where(f)}  ${KIND[f.kind]}：${f.label}`));
  if (warns.length) out.push("", "警告（確かめてください）", ...sorted(warns).map((f) => `  ⚠ ${where(f)}  ${KIND[f.kind]}：${f.label}`));
  if (report.allowed.size) out.push("", "設定で許したもの（hygiene.config.json の allow）", ...[...report.allowed].map(([key, n]) => { const [file, kind] = key.split("\u0000"); return `  - ${safeName(file, ctx)}  ${KIND[kind]} ${n}件`; }));
  if (report.notRun.length) out.push("", "未実施", ...report.notRun.map((item) => `  - ${item.check}：${item.reason}`));

  mkdirSync(opts.evidenceDir, { recursive: true });
  let evidencePath = join(opts.evidenceDir, `hygiene-${profile}-${stamp.file}.json`);
  for (let n = 2; existsSync(evidencePath); n++) evidencePath = join(opts.evidenceDir, `hygiene-${profile}-${stamp.file}-${n}.json`);
  const evidence = {
    tool: "scripts/hygiene.mjs", ranAt: now.toISOString(), profile, target: { mode: target.mode, name: target.name, files: counts.files, deletedFromTree: target.deleted, commits: target.commits, skippedDirs: target.skipped },
    configSha256: config.sha256, ngList: { present: existsSync(opts.ngFile), patterns: ngRules.length }, tools: { gitleaks: ctx.gitleaks.version, ffprobe: ctx.ffprobe.version, node: process.version },
    counts, gitleaks: leaks, verdict: passed ? "pass" : "fail",
    findings: sorted(report.findings).map((f) => ({ severity: f.severity, kind: f.kind, kindLabel: KIND[f.kind], label: f.label, file: safeName(f.file, ctx), line: f.line })),
    allowed: [...report.allowed].map(([key, count]) => { const [file, kind] = key.split("\u0000"); return { file: safeName(file, ctx), kind, count }; }),
    notRun: report.notRun, docsRow: row,
  };
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

  out.push("", `記録：${shown(evidencePath)}`);
  out.push("docs/release-hygiene.md の表に足す1行：", row);
  out.push("", `判定：${passed ? "OK（失敗なし）" : `NG（失敗 ${fails.length}件）— 解消するまで公開・PR のマージをしない`}`);
  console.log(out.join("\n"));
  return passed ? 0 : 1;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (error instanceof UsageError) {
    console.error(`hygiene: ${error.message}`);
    process.exitCode = 2;
  } else throw error;
}
