#!/usr/bin/env node
// Public snapshot (the tool of tasks-release.md 7.2). It writes what may be published into a new folder outside the
// repository, as a tree with no history: the files named in an allowlist, a LICENSE (MIT), and THIRD_PARTY_NOTICES.md
// built from package-lock.json and node_modules. Then it runs the pre-publication check (scripts/hygiene.mjs --tree) on
// what it wrote, and records the tree's fingerprint next to the check's record, so the release gate can confirm that
// what was checked is what gets published. It never creates, pushes or publishes a repository.
//
//   npm run snapshot -- --out <dir>             write the tree into <dir> (outside the repository; empty or not yet there)
//   npm run snapshot -- --out <dir> --init-git  also `git init -b main` there and commit everything once, as
//                                               "Initial public snapshot", with no remote and no AI signature
//   npm run snapshot -- --fingerprint <dir>     print the fingerprint of a tree that was written, and nothing else
//
// Other options: --include-kiro (also publish .kiro/, except release-checklist.md), --holder "<name>" (the copyright
// holder, instead of the operator name in src/lib/operator-info.ts), --repo <dir> (the repository to take the tree
// from; default: the one this script is in), --by <name> (who ran it, for the check's record).
// Exit status: 0 written and ready for the operator's review; 1 written but not publishable (the operator name is
// undecided, or the check failed); 2 bad arguments, or nothing written because writing would not be safe.
//
// Why a new tree: identifiers once committed stay in the private history. Rewriting it needs a forced push, and copies
// keep the old content, so the public repository starts a new history instead (docs/release-hygiene.md).
// Why an allowlist: a top-level file or directory nobody named is left out, so a new private file there is never
// published silently. Inside a directory it names (src/, tests/, docs/, public/, fixtures/, .github/) every file is taken,
// so whatever is put there is published: the operator reads the record's manifest before publishing
// (docs/release-hygiene.md). The directories that are never published come from scripts/hygiene.config.json (nonPublicDirs), the one list the check
// also uses; an allowlist entry inside one of them is refused rather than quietly dropped.
// The commit's author is the noreply address of `git config user.email`. Its name is the account name in that address,
// never `git config user.name`, which may hold a real name.
// The fingerprint is the SHA-256 of the lines "<SHA-256 of the content>  <path>" for every file but .git/, sorted by
// the bytes of the path: the lines `shasum -a 256` prints, so it can be recomputed without this tool.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_ROOT = resolve(SCRIPT_DIR, "..");

/** The public tree is these names and nothing else. A trailing / names a directory; * stands for part of one name. */
const INCLUDE = [
  "src/", "public/", "tests/", "fixtures/", "docs/", ".github/",
  "scripts/make-og-image.mjs", "scripts/record-tour.mjs", "scripts/record-day-demo.mjs", "scripts/hygiene.mjs", "scripts/hygiene.config.json", "scripts/make-public-snapshot.mjs", "scripts/release-gate.mjs",
  "README.md", "package.json", "package-lock.json", "tsconfig.json", "next.config.ts", "eslint.config.*", "playwright.config.*",
  "wrangler.jsonc", "open-next.config.*", "worker.ts", "next-env.d.ts", ".dev.vars.example", ".gitignore", "AGENTS.md", "CLAUDE.md",
  ".precheck-ng.example.txt",
];
const KIRO_DIR = ".kiro/";
/** The operator's own release steps (Day registration, Drive, notes): left out even with --include-kiro. */
const KIRO_PRIVATE = /(?:^|\/)release-checklist\.md$/;
/** Written by this tool; a file of the same name in the repository is never copied. */
const WRITTEN = new Set(["LICENSE", "THIRD_PARTY_NOTICES.md"]);
/** Never published wherever they appear: git's store, dependencies, build output and local state. */
const SKIP_SEGMENTS = new Set([".git", "node_modules", ".next", ".open-next", ".wrangler", "test-results", "playwright-report"]);
/** Never published, even inside a listed directory: secrets, the NG list and generated files. */
const PRIVATE_FILE = /(?:^|\/)(?:\.precheck-ng\.txt|\.dev\.vars(?!\.example$)[^/]*|\.env(?!\.example$|\.sample$)[^/]*|cloudflare-env\.d\.ts|[^/]*\.tsbuildinfo|\.DS_Store)$/;

const COPYRIGHT_YEAR = "2026";
/** The mark the release gate looks for: the LICENSE carries it while the operator name is undecided. */
const UNDECIDED_HOLDER = "<OPERATOR-NAME-UNDECIDED>";
const COMMIT_MESSAGE = "Initial public snapshot";
const MIT_TERMS = [
  "Permission is hereby granted, free of charge, to any person obtaining a copy",
  "of this software and associated documentation files (the \"Software\"), to deal",
  "in the Software without restriction, including without limitation the rights",
  "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell",
  "copies of the Software, and to permit persons to whom the Software is",
  "furnished to do so, subject to the following conditions:",
  "",
  "The above copyright notice and this permission notice shall be included in all",
  "copies or substantial portions of the Software.",
  "",
  "THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR",
  "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,",
  "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE",
  "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER",
  "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,",
  "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE",
  "SOFTWARE.",
].join("\n");
const mitLicense = (holder) => `MIT License\n\nCopyright (c) ${COPYRIGHT_YEAR} ${holder}\n\n${MIT_TERMS}\n`;
/** scripts/hygiene.mjs started as a copy of this file. The license is the MIT part of that repository's LICENSE, as written there. */
const COPIED_TOOL = {
  file: "scripts/hygiene.mjs",
  source: "hundred-days（https://github.com/haranishi/hundred-days）の `scripts/precheck.mjs`",
  license: `MIT License\n\nCopyright (c) 2026 haranishi\n\n${MIT_TERMS}`,
};

const NOTE_LGPL_SHARP = "配らない：sharp の任意のネイティブ部品（画像処理の libvips）。公開リポジトリは node_modules を含まず、Worker の bundle にも入らない見込み（内訳は未確認）。配るなら LGPL-3.0 の条件に従った表示と提供が要る";
const NOTE_LGPL = "LGPL を含む。配る物に入るかを確かめ、配るなら LGPL の条件に従った表示と提供が要る";
const NOTE_CC_BY_CANIUSE = "表示の義務：ビルドのときに使う、ブラウザーの対応状況のデータ。配る物に入るなら、作者の表示と CC BY 4.0 へのリンクが要る（公開リポジトリは node_modules を含まないので、リポジトリ自体はこのデータを配らない）";
const NOTE_CC_BY = "表示の義務：配る物に入るなら、作者の表示とライセンスへのリンクが要る";

const LICENSE_FILE = /^(?:licen[cs]e|copying)/i; // LICENSE*, plus the LICENCE* spelling and COPYING*
const NOTICE_FILE = /^notice/i;
/** A line stating a copyright: "Copyright Name" at its start, or anywhere "Copyright (c)", "Copyright 2020", "(c) 2020"
 * or "©". Lowercase "copyright", capitals ("COPYRIGHT HOLDERS"), a name later in a line ("Grant of Copyright License"
 * in Apache-2.0) and the "Copyright [yyyy]" template belong to the terms. A statement this misses stays in the text. */
const COPYRIGHT_LINE = /^\s*Copyright\s*(?:\([cC]\)|©|\d{4}|[A-Z])|(?:^|[^A-Za-z])Copyright\s*(?:\([cC]\)|©|\d{4})|(?:^|\s)\([cC]\)\s*\d{4}|©/;
const FONT_EXT = new Set(["woff", "woff2", "ttf", "otf", "eot", "ttc"]);
const ASSET_EXT = new Set(["png", "apng", "jpg", "jpeg", "webp", "gif", "avif", "svg", "ico", "bmp", "tif", "tiff", "heic", "mp4", "m4v", "mov", "webm", "mkv", "mp3", "m4a", "wav", "ogg", "oga", "opus", "flac", "aac", "vtt"]);
const ASSET_DOC = "docs/licenses-and-assets.md";

class UsageError extends Error {}

const run = (cmd, args, options = {}) => spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options });
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const inside = (child, parent) => child === parent || child.startsWith(parent + sep);
const byBytes = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const CONTROL = /[\u0000-\u001f\u007f]/;

function parseArgs(argv) {
  const opts = { out: null, repo: TOOL_ROOT, holder: null, by: "（記入）", fingerprint: null, initGit: false, includeKiro: false, help: false };
  const takes = { "--out": "out", "--repo": "repo", "--holder": "holder", "--by": "by", "--fingerprint": "fingerprint" };
  const flags = { "--init-git": "initGit", "--include-kiro": "includeKiro" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") { opts.help = true; continue; }
    if (arg === "--force") throw new UsageError("上書きの指定はありません。空でないフォルダには、--force を付けても書きません（空のフォルダか、まだ無いフォルダを指定してください）");
    if (flags[arg]) { opts[flags[arg]] = true; continue; }
    const key = takes[arg];
    if (!key) throw new UsageError(`知らない指定です：${arg}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) throw new UsageError(`${arg} の値がありません`);
    opts[key] = value;
  }
  if (opts.holder !== null) {
    opts.holder = opts.holder.trim();
    if (!opts.holder || CONTROL.test(opts.holder) || opts.holder === UNDECIDED_HOLDER || opts.holder.length > 200) throw new UsageError("--holder には、著作権者の名称を1行で書いてください");
  }
  if (opts.fingerprint && (opts.out || opts.initGit || opts.includeKiro || opts.holder !== null)) throw new UsageError("--fingerprint はほかの指定と一緒に使えません");
  return opts;
}

/** nonPublicDirs is read from the check's config, so there is one list of what is never published. */
function loadConfig(file) {
  let raw;
  try { raw = JSON.parse(readFileSync(file, "utf8")); } catch { throw new UsageError("scripts/hygiene.config.json を読めません（公開しないディレクトリの一覧の正本）"); }
  const dirs = raw?.nonPublicDirs;
  if (!Array.isArray(dirs) || dirs.some((d) => typeof d !== "string" || !d.endsWith("/") || d.startsWith("/") || d.split("/").includes(".."))) {
    throw new UsageError("hygiene.config.json の nonPublicDirs は、末尾が / の相対パスの一覧にしてください");
  }
  return { file, raw, nonPublicDirs: dirs };
}

const matcher = (entry) => {
  if (entry.endsWith("/")) return (rel) => rel.startsWith(entry);
  if (!entry.includes("*")) return (rel) => rel === entry;
  const re = new RegExp(`^${entry.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`);
  return (rel) => re.test(rel);
};

/** An allowlist entry inside a never-published directory is a contradiction, refused before anything is written. */
function checkAllowlist(include, nonPublicDirs) {
  const clash = include.filter((entry) => nonPublicDirs.some((dir) => entry.startsWith(dir)));
  if (clash.length) throw new UsageError(`許可の一覧に、公開しないディレクトリ（hygiene.config.json の nonPublicDirs）の中が入っています：${clash.join("、")}`);
}

/** The NG list only masks names printed here and screens the commit's author; hygiene.mjs reports a missing or broken list. */
function loadNgRules(file) {
  if (!existsSync(file)) return null;
  const rules = [];
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const source = raw.trim();
    if (!source || source.startsWith("#")) continue;
    try { rules.push(new RegExp(source, "i")); } catch { /* reported by hygiene.mjs */ }
  }
  return rules;
}
const hitsNg = (text, ng) => ng.some((re) => re.test(text));

function repoRoot(dir) {
  const top = run("git", ["-C", resolve(dir), "rev-parse", "--show-toplevel"]);
  if (top.error || top.status !== 0) throw new UsageError("--repo が Git の作業ツリーではありません");
  const root = realpathSync(top.stdout.trim());
  if (root !== realpathSync(resolve(dir))) throw new UsageError("--repo にはリポジトリの最上位のフォルダを指定してください");
  return root;
}

/** The real path of a folder that may not exist yet: the nearest existing parent, resolved, plus the rest. */
function realTarget(path) {
  const rest = [];
  let current = path;
  while (!existsSync(current) && dirname(current) !== current) { rest.unshift(basename(current)); current = dirname(current); }
  return join(realpathSync(current), ...rest);
}

function checkOut(value, repo) {
  if (!value) throw new UsageError("--out <dir> が要ります（リポジトリの外の、空のフォルダか、まだ無いフォルダ）");
  const path = resolve(value);
  const real = realTarget(path);
  if (inside(real, repo)) throw new UsageError("--out はリポジトリの外にしてください");
  if (inside(repo, real)) throw new UsageError("--out に、リポジトリを中に含むフォルダは指定できません");
  if (existsSync(path)) {
    if (!statSync(path).isDirectory()) throw new UsageError("--out にはフォルダを指定してください");
    if (readdirSync(path).length > 0) throw new UsageError("--out のフォルダが空ではありません。上書きはしません（空のフォルダか、まだ無いフォルダを指定してください）");
  }
  return path;
}

/** The commit's author: the noreply address, named by its account name. Checked before anything is written. */
function commitAuthor(repo, ng) {
  const configured = run("git", ["-C", repo, "config", "user.email"]);
  const email = configured.status === 0 ? configured.stdout.trim() : "";
  const [local = "", domain = ""] = email.toLowerCase().split("@");
  if (!email) throw new UsageError("git config user.email が未設定です。noreply のアドレス（users.noreply.github.com）にしてから --init-git を付けてください");
  if (!/(?:^|\.)noreply(?:\.|$)/.test(domain) && !/^no-?reply$/.test(local)) {
    throw new UsageError("git config user.email が noreply のアドレスではないため、コミットしません（users.noreply.github.com のアドレスにするか、--init-git を外してください）");
  }
  const user = email.split("@")[0];
  const name = user.includes("+") ? user.slice(user.indexOf("+") + 1) : user;
  if (!ng) throw new UsageError("個人NGワードの一覧（.precheck-ng.txt）が無いため、作者の名前を確かめられず、コミットしません");
  if (!name || hitsNg(email, ng)) throw new UsageError("作者のアドレスが個人NGワードに当たるため、コミットしません");
  return { name, email };
}

async function resolveHolder(repo, given) {
  if (given !== null) return { name: given, source: "--holder の指定" };
  const file = join(repo, "src", "lib", "operator-info.ts");
  if (!existsSync(file)) throw new UsageError("src/lib/operator-info.ts がありません（著作権者は --holder でも指定できます）");
  let info;
  try { info = (await import(pathToFileURL(file).href)).OPERATOR_INFO; } catch { throw new UsageError("src/lib/operator-info.ts を読めません（npm run snapshot で動かすか、--holder で指定してください）"); }
  const name = info?.name;
  if (name !== null && typeof name !== "string") throw new UsageError("src/lib/operator-info.ts の OPERATOR_INFO.name が、文字列でも null でもありません");
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (CONTROL.test(trimmed)) throw new UsageError("src/lib/operator-info.ts の運営者の名称は1行にしてください");
  return { name: trimmed && trimmed !== UNDECIDED_HOLDER ? trimmed : null, source: "src/lib/operator-info.ts" };
}

/** What git would commit: tracked and untracked files minus .gitignore, the same list the check reads. */
function listRepoFiles(repo) {
  const listed = run("git", ["-C", repo, "ls-files", "-c", "-o", "--exclude-standard", "-z"]);
  if (listed.status !== 0) throw new UsageError("git ls-files に失敗しました");
  const files = [];
  let deleted = 0;
  for (const rel of [...new Set(listed.stdout.split("\0").filter(Boolean))].sort(byBytes)) {
    const abs = join(repo, ...rel.split("/"));
    const stat = lstatSync(abs, { throwIfNoEntry: false });
    if (!stat) { deleted++; continue; } // in the index but gone from the tree
    if (stat.isSymbolicLink()) files.push({ rel, abs, link: true }); // git keeps the link's text, and so does the tree
    else if (stat.isFile()) files.push({ rel, abs, link: false });
  }
  return { files, deleted };
}

function pick(files, include, nonPublicDirs, includeKiro) {
  const matchers = include.map(matcher);
  const kept = [];
  const left = { nonPublic: 0, generated: 0, private: 0, kiroPrivate: 0, notListed: [], written: [] };
  for (const file of files) {
    const { rel } = file;
    if (rel.split("/").some((segment) => SKIP_SEGMENTS.has(segment))) left.generated++;
    else if (nonPublicDirs.some((dir) => rel.startsWith(dir))) left.nonPublic++;
    else if (WRITTEN.has(rel)) left.written.push(rel);
    else if (PRIVATE_FILE.test(rel)) left.private++;
    else if (!matchers.some((match) => match(rel))) left.notListed.push(rel);
    else if (includeKiro && rel.startsWith(KIRO_DIR) && KIRO_PRIVATE.test(rel)) left.kiroPrivate++;
    else kept.push(file);
  }
  return { kept, left };
}

/** Copies byte for byte, without the source's extended attributes; only the executable bit of the mode is kept. */
function copyTree(files, out) {
  for (const { rel, abs, link } of files) {
    const dest = join(out, ...rel.split("/"));
    mkdirSync(dirname(dest), { recursive: true });
    if (link) { symlinkSync(readlinkSync(abs), dest); continue; }
    writeFileSync(dest, readFileSync(abs), { flag: "wx" });
    chmodSync(dest, statSync(abs).mode & 0o111 ? 0o755 : 0o644);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// THIRD_PARTY_NOTICES.md

const readText = (file) => readFileSync(file, "utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.trimEnd()).join("\n").replace(/^\n+|\n+$/g, "");
const joinTexts = (dir, names) => names.map((name) => readText(join(dir, name))).filter(Boolean).join("\n\n----\n\n");

function licenseFromPackageJson(pkg) {
  if (typeof pkg?.license === "string") return pkg.license;
  if (typeof pkg?.license?.type === "string") return pkg.license.type;
  if (Array.isArray(pkg?.licenses)) {
    const types = pkg.licenses.map((item) => (typeof item === "string" ? item : item?.type)).filter((type) => typeof type === "string");
    if (types.length) return types.join(" OR ");
  }
  return null;
}

/** Copyright lines are listed under each package; the rest of the text (the terms) is what two packages may share. */
function splitCopyright(text) {
  const copyright = [];
  const rest = [];
  for (const line of text.split("\n")) (COPYRIGHT_LINE.test(line) ? copyright : rest).push(line);
  const body = rest.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "");
  return { copyright: [...new Set(copyright.map((line) => line.trim()))], body, key: body.replace(/\s+/g, " ").trim() };
}

function noteFor(name, license) {
  if (/LGPL/i.test(license)) return name.startsWith("@img/sharp") ? NOTE_LGPL_SHARP : NOTE_LGPL;
  if (/CC-BY-/i.test(license)) return name === "caniuse-lite" ? NOTE_CC_BY_CANIUSE : NOTE_CC_BY;
  return "";
}

/** Every entry of package-lock.json except the development-only ones (dev, devOptional), with its texts from node_modules. */
function collectPackages(repo, lock) {
  const packages = [];
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (!key.includes("node_modules/") || entry?.dev === true || entry?.devOptional === true) continue;
    const dir = join(repo, ...key.split("/"));
    const installed = existsSync(dir) && statSync(dir).isDirectory();
    let pkg = null;
    if (installed) { try { pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")); } catch { pkg = null; } }
    const name = typeof entry.name === "string" ? entry.name : key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
    const version = typeof entry.version === "string" ? entry.version : typeof pkg?.version === "string" ? pkg.version : "不明";
    const license = typeof entry.license === "string" ? entry.license : licenseFromPackageJson(pkg) ?? "不明（記載なし）";
    const names = installed ? readdirSync(dir).filter((file) => (LICENSE_FILE.test(file) || NOTICE_FILE.test(file)) && statSync(join(dir, file)).isFile()).sort(byBytes) : [];
    const licenseText = joinTexts(dir, names.filter((file) => LICENSE_FILE.test(file)));
    const noticeText = joinTexts(dir, names.filter((file) => NOTICE_FILE.test(file)));
    const notes = [noteFor(name, license)];
    if (installed && typeof pkg?.version === "string" && pkg.version !== version) notes.push(`node_modules の版は ${pkg.version}（lock と違う）`);
    packages.push({
      key, name, version, license, installed, optional: entry.optional === true, licenseText, noticeText,
      split: licenseText ? splitCopyright(licenseText) : null, note: notes.filter(Boolean).join("。"), mismatch: notes.length > 1,
    });
  }
  return packages.sort((a, b) => byBytes(a.name, b.name) || byBytes(a.version, b.version) || byBytes(a.key, b.key));
}

/** Groups by a key; the biggest group comes first, ties by the first package's name. */
function groupBy(packages, keyOf) {
  const groups = new Map();
  for (const pkg of packages) {
    const key = keyOf(pkg);
    if (key === null) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(pkg);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length || byBytes(a[0].name, b[0].name));
}

const cell = (text) => text.replace(/[\\`*_[\]|]/g, "\\$&").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fenced = (text) => {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return [`${fence}text`, text, fence];
};
const mentioned = (doc, path) => new RegExp(`(?:^|[\\s(\`'"、（])${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[\\s)\`'"、）]|$)`, "m").test(doc);

function buildNotices(repo, lock, treeFiles) {
  const packages = collectPackages(repo, lock);
  const withText = packages.filter((pkg) => pkg.split);
  const without = packages.filter((pkg) => !pkg.split);
  const textGroups = groupBy(withText, (pkg) => pkg.split.key);
  const noticeGroups = groupBy(packages, (pkg) => (pkg.noticeText ? pkg.noticeText.replace(/\s+/g, " ").trim() : null));
  const noticeId = new Map(noticeGroups.flatMap((group, index) => group.map((pkg) => [pkg, index + 1])));
  const licenses = new Map();
  for (const pkg of packages) licenses.set(pkg.license, (licenses.get(pkg.license) ?? 0) + 1);
  const rels = treeFiles.map((file) => file.rel);
  const ext = (rel) => rel.slice(rel.lastIndexOf(".") + 1).toLowerCase();
  const fonts = rels.filter((rel) => FONT_EXT.has(ext(rel)));
  const assets = rels.filter((rel) => ASSET_EXT.has(ext(rel)));
  const assetDoc = rels.includes(ASSET_DOC) ? readFileSync(join(repo, ASSET_DOC), "utf8") : "";
  const assetListed = (rel) => [rel, ...rel.split("/").slice(0, -1).map((_, i, parts) => `${parts.slice(0, i + 1).join("/")}/`)].some((path) => mentioned(assetDoc, path));
  const notInstalled = without.filter((pkg) => !pkg.installed).length;

  const lines = [
    "# 第三者のソフトウェアと素材の表記", "",
    "この文書は、`scripts/make-public-snapshot.mjs` が公開用のスナップショットを作るときに、`package-lock.json` と `node_modules` から機械的に作ったものです。手で直さず、道具を直して作り直してください。", "",
    "## この一覧の範囲", "",
    "- `package-lock.json` の開発用でない項目（`dev`・`devOptional` の印が無いもの）をすべて載せています。実際に配る物だけでなく、配らない物（配置の道具、ほかの端末向けの任意の部品など）も含む上位集合です。",
    `- 閲覧者のブラウザーへ配る JavaScript と、Cloudflare で動く Worker の bundle に実際に入るパッケージの内訳は、まだ確かめていません（[${ASSET_DOC}](${ASSET_DOC}) の「未確認」）。`,
    "- ライセンスの文は、各パッケージの `node_modules/<パッケージ>/` にある `LICENSE*`（`LICENCE*`・`COPYING*` を含む）と `NOTICE*` のファイルから写しました。著作権の行を除いた本文が同じものは1つにまとめ、その本文の上に、当てはまるパッケージと各パッケージの著作権の行を並べています。本文と著作権の行を合わせたものが、各パッケージのファイルの文です。著作権の行として見分けられなかった記述は本文に残し、表には「本文を参照」と書いています。",
    "- ライセンスのファイルが見つからないパッケージも、「全文なし」として一覧に残しています。", "",
    "## 集計", "",
    `- パッケージ：${packages.length}件（本文あり ${withText.length}件・全文なし ${without.length}件）`,
    `- 本文の種類：${textGroups.length}種類`,
    `- NOTICE の種類：${noticeGroups.length}種類`, "",
    "| ライセンス（package-lock.json の記載） | 件数 |", "|---|---:|",
    ...[...licenses].sort((a, b) => b[1] - a[1] || byBytes(a[0], b[0])).map(([license, count]) => `| ${cell(license)} | ${count} |`), "",
  ];
  if (rels.includes(COPIED_TOOL.file)) {
    lines.push(
      "## このリポジトリが含む第三者のコード", "",
      `\`${COPIED_TOOL.file}\` は、${COPIED_TOOL.source} を複製して直した道具です。複製元のリポジトリの LICENSE は、ソースコードを MIT ライセンスとし、\`day-*/data/\` などの第三者のデータだけを対象外にしています。\`scripts/precheck.mjs\` はソースコードなので MIT です。次は、その LICENSE の MIT の部分をそのまま写したものです。`, "",
      ...fenced(COPIED_TOOL.license), "",
    );
  }
  lines.push(
    "## 同梱の書体と素材", "",
    fonts.length ? `- 書体のファイル：${fonts.length}件。出どころと使用許諾を確かめてください：${fonts.map((rel) => `\`${rel}\``).join("、")}` : "- 書体のファイル：同梱していません（この道具が木の中を調べ、woff・woff2・ttf・otf・eot・ttc のファイルが無いことを確かめました）",
    `- 画像・動画・音声・字幕のファイル：${assets.length}件。出どころは [${ASSET_DOC}](${ASSET_DOC}) の「同梱の素材の出どころ」にまとめています。この道具は、その文書にファイルかフォルダの名前があるかだけを確かめます。`, "",
  );
  if (assets.length) lines.push("| ファイル | 出どころの記載 |", "|---|---|", ...assets.map((rel) => `| \`${rel}\` | ${assetListed(rel) ? "あり" : "なし（出どころを確かめる）"} |`), "");
  lines.push(
    "## 全文なし", "",
    without.length
      ? `ライセンスのファイルが見つからなかったパッケージです（${without.length}件。この端末の \`node_modules\` に無いもの ${notInstalled}件・ファイルが無いもの ${without.length - notInstalled}件）。`
      : "ありません。", "",
  );
  if (without.length) {
    lines.push("| パッケージ | 版 | ライセンス | 理由 | 備考 |", "|---|---|---|---|---|");
    for (const pkg of without) {
      const reason = pkg.installed ? "node_modules にライセンスのファイルが無い" : pkg.optional ? "この端末の node_modules に無い（ほかの端末向けの任意の部品）" : "この端末の node_modules に無い";
      lines.push(`| \`${pkg.name}\` | ${cell(pkg.version)} | ${cell(pkg.license)} | ${reason} | ${cell(pkg.note) || "—"} |`);
    }
    lines.push("");
  }
  const withNotice = noticeGroups.length > 0;
  lines.push("## 本文ごとのパッケージ", "");
  textGroups.forEach((group, index) => {
    const kinds = [...new Set(group.map((pkg) => pkg.license))].sort(byBytes).join("・");
    lines.push(`### 本文 ${index + 1}（${cell(kinds)}・${group.length}件）`, "");
    lines.push(`| パッケージ | 版 | ライセンス | 著作権の行 |${withNotice ? " NOTICE |" : ""} 備考 |`, `|---|---|---|---|${withNotice ? "---|" : ""}---|`);
    for (const pkg of group) {
      const copyright = pkg.split.copyright.length ? pkg.split.copyright.map(cell).join("<br>") : "（本文を参照）";
      const notice = withNotice ? ` ${noticeId.has(pkg) ? `NOTICE ${noticeId.get(pkg)}` : "—"} |` : "";
      lines.push(`| \`${pkg.name}\` | ${cell(pkg.version)} | ${cell(pkg.license)} | ${copyright} |${notice} ${cell(pkg.note) || "—"} |`);
    }
    lines.push("", ...fenced(group[0].split.body || "（本文なし：著作権の行だけのファイル）"), "");
  });
  if (withNotice) {
    lines.push("## NOTICE", "", "NOTICE のファイルの文です。同じ文は1つにまとめています。", "");
    noticeGroups.forEach((group, index) => {
      lines.push(`### NOTICE ${index + 1}（${group.length}件）`, "", `対象：${group.map((pkg) => `\`${pkg.name}\` ${cell(pkg.version)}`).join("、")}`, "", ...fenced(group[0].noticeText), "");
    });
  }
  const mismatches = packages.filter((pkg) => pkg.mismatch).length;
  const markdown = `${lines.join("\n").replace(/\n+$/, "")}\n`;
  return {
    markdown,
    counts: { packages: packages.length, withText: withText.length, withoutText: without.length, notInstalled, texts: textGroups.length, notices: noticeGroups.length, versionMismatch: mismatches },
    fonts: fonts.length, assets: assets.length, assetsUnlisted: assets.filter((rel) => !assetListed(rel)),
  };
}

// ---------------------------------------------------------------------------------------------------------------

/** One commit with everything in the tree. No hook, template, signing or ignore rule of this machine takes part. */
function commitTree(out, author) {
  const empty = mkdtempSync(join(tmpdir(), "snapshot-git-"));
  try {
    const env = { ...process.env, GIT_AUTHOR_NAME: author.name, GIT_AUTHOR_EMAIL: author.email, GIT_COMMITTER_NAME: author.name, GIT_COMMITTER_EMAIL: author.email };
    for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_COMMON_DIR", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT", "GIT_TEMPLATE_DIR"]) delete env[name];
    const git = (args) => {
      const result = run("git", ["-C", out, "-c", `core.hooksPath=${empty}`, "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args], { env });
      if (result.error || result.status !== 0) throw new Error(`git ${args[0]} に失敗しました`);
      return result.stdout;
    };
    git(["init", "-q", "-b", "main", `--template=${empty}`]);
    git(["add", "--all", "--force", "--", "."]);
    git(["commit", "-q", "--no-verify", "--cleanup=verbatim", "-m", COMMIT_MESSAGE]);
    return { branch: "main", commits: Number(git(["rev-list", "--count", "HEAD"]).trim()), head: git(["rev-parse", "HEAD"]).trim(), files: git(["ls-files", "-z"]).split("\0").filter(Boolean).length };
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
}

/** The check, run from the source repository: its NG list and its record folder are there, never in the tree. */
function runHygiene(repo, out, config, nonPublicDirs, by, evidenceDir) {
  const tool = join(repo, "scripts", "hygiene.mjs");
  if (!existsSync(tool)) return { exit: null, stdout: "", stderr: "", record: null, missing: true };
  let configFile = config.file;
  let scratch = null;
  if (nonPublicDirs.length !== config.nonPublicDirs.length) { // --include-kiro: the same config without .kiro/
    scratch = mkdtempSync(join(tmpdir(), "snapshot-config-"));
    configFile = join(scratch, "hygiene.config.json");
    writeFileSync(configFile, `${JSON.stringify({ ...config.raw, nonPublicDirs }, null, 2)}\n`);
  }
  try {
    const result = run(process.execPath, [tool, "--tree", out, "--config", configFile, "--ng-file", join(repo, ".precheck-ng.txt"), "--evidence-dir", evidenceDir, "--by", by], { cwd: repo });
    return { exit: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", record: /^記録：(.+)$/m.exec(result.stdout ?? "")?.[1] ?? null, missing: false };
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
}

function fingerprintTree(dir) {
  const entries = [];
  const walk = (relDir) => {
    for (const entry of readdirSync(relDir ? join(dir, relDir) : dir, { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { if (entry.name !== ".git") walk(rel); }
      else if (entry.isSymbolicLink()) entries.push([sha256(`symlink:${readlinkSync(join(dir, rel))}`), rel]);
      else if (entry.isFile()) entries.push([sha256(readFileSync(join(dir, rel))), rel]);
    }
  };
  walk("");
  entries.sort((a, b) => byBytes(a[1], b[1]));
  return { value: sha256(entries.map(([hash, rel]) => `${hash}  ${rel}\n`).join("")), entries };
}

function stamp(now) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 18).map((line) => line.replace(/^\/\/ ?/, "")).join("\n"));
    return 0;
  }
  if (opts.fingerprint) {
    const dir = resolve(opts.fingerprint);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new UsageError("--fingerprint にはフォルダを指定してください");
    const fp = fingerprintTree(dir);
    console.log(`sha256:${fp.value}  （${fp.entries.length}件）`);
    return 0;
  }

  // Everything that can refuse is checked before the first file is written.
  const repo = repoRoot(opts.repo);
  const config = loadConfig(join(repo, "scripts", "hygiene.config.json"));
  const nonPublicDirs = opts.includeKiro ? config.nonPublicDirs.filter((dir) => dir !== KIRO_DIR) : config.nonPublicDirs;
  const include = opts.includeKiro ? [...INCLUDE, KIRO_DIR] : INCLUDE;
  checkAllowlist(include, nonPublicDirs);
  const out = checkOut(opts.out, repo);
  const ng = loadNgRules(join(repo, ".precheck-ng.txt"));
  const author = opts.initGit ? commitAuthor(repo, ng) : null;
  if (!existsSync(join(repo, "node_modules"))) throw new UsageError("node_modules がありません。npm ci のあとに動かしてください（第三者の表記の文は node_modules から写します）");
  let lock;
  try { lock = JSON.parse(readFileSync(join(repo, "package-lock.json"), "utf8")); } catch { throw new UsageError("package-lock.json を読めません"); }
  if (!lock || typeof lock.packages !== "object" || lock.packages === null) throw new UsageError("package-lock.json に packages がありません（lockfileVersion 2 以上が要ります）");
  const holder = await resolveHolder(repo, opts.holder);
  const { files, deleted } = listRepoFiles(repo);
  const { kept, left } = pick(files, include, nonPublicDirs, opts.includeKiro);

  mkdirSync(out, { recursive: true });
  copyTree(kept, out);
  writeFileSync(join(out, "LICENSE"), mitLicense(holder.name ?? UNDECIDED_HOLDER), { flag: "wx" });
  const treeFiles = [...kept, { rel: "LICENSE" }, { rel: "THIRD_PARTY_NOTICES.md" }];
  const notices = buildNotices(repo, lock, treeFiles);
  writeFileSync(join(out, "THIRD_PARTY_NOTICES.md"), notices.markdown, { flag: "wx" });
  const git = author ? commitTree(out, author) : null;
  const evidenceDir = join(repo, ".agent-harness", "evidence", "hygiene");
  const hygiene = runHygiene(repo, out, config, nonPublicDirs, opts.by, evidenceDir);
  const fp = fingerprintTree(out);

  const byDir = new Map();
  for (const [, rel] of fp.entries) { const top = rel.includes("/") ? `${rel.split("/")[0]}/` : "（最上位のファイル）"; byDir.set(top, (byDir.get(top) ?? 0) + 1); }
  const notListed = ng ? left.notListed.map((rel) => (hitsNg(rel, ng) ? "（名前を伏せたファイル）" : rel)) : [];
  const problems = [];
  if (!holder.name) problems.push("運営者の名称が未確定");
  if (hygiene.missing) problems.push("点検の道具（scripts/hygiene.mjs）が無い");
  else if (hygiene.exit !== 0) problems.push("点検で失敗");
  if (git && git.files !== fp.entries.length) problems.push("コミットしたファイルの数が木と合わない");

  const now = new Date();
  mkdirSync(evidenceDir, { recursive: true });
  let recordPath = join(evidenceDir, `snapshot-${stamp(now)}.json`);
  for (let n = 2; existsSync(recordPath); n++) recordPath = join(evidenceDir, `snapshot-${stamp(now)}-${n}.json`);
  const record = {
    tool: "scripts/make-public-snapshot.mjs", ranAt: now.toISOString(), out: basename(out), fingerprint: `sha256:${fp.value}`, files: fp.entries.length,
    byDir: Object.fromEntries(byDir), options: { initGit: opts.initGit, includeKiro: opts.includeKiro },
    license: { type: "MIT", holder: holder.name ? "decided" : "undecided", holderSource: holder.source },
    notices: notices.counts, assets: { files: notices.assets, unlisted: notices.assetsUnlisted.length, fonts: notices.fonts },
    left: { nonPublic: left.nonPublic, generated: left.generated, private: left.private, kiroPrivate: left.kiroPrivate, notListed: left.notListed.length, replacedByTool: left.written.length, deletedFromTree: deleted },
    git: git ? { branch: git.branch, commits: git.commits, head: git.head, files: git.files } : null,
    hygiene: { exit: hygiene.exit, record: hygiene.record }, verdict: problems.length ? "not-publishable" : "ready-for-review", problems,
    manifest: fp.entries,
  };
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);

  const report = [];
  report.push(`公開用スナップショット：${basename(out)}（${fp.entries.length}件）`);
  report.push(`  含めたもの：${[...byDir].sort((a, b) => byBytes(a[0], b[0])).map(([dir, count]) => `${dir} ${count}`).join("・")}`);
  report.push(`  入れなかったもの：公開しないディレクトリ ${left.nonPublic}件・生成物と依存 ${left.generated}件・秘密や NG 一覧のファイル ${left.private}件・許可の一覧に無い ${left.notListed.length}件${opts.includeKiro ? `・.kiro の公開しない文書 ${left.kiroPrivate}件` : ""}（.gitignore で無視されるものは数えていない）`);
  if (left.notListed.length) report.push(ng ? `    許可の一覧に無い：${notListed.join("、")}` : "    許可の一覧に無いものの名前は、個人NGワードの一覧が無いため出しません");
  if (left.written.length) report.push(`  リポジトリの ${left.written.join("・")} は使わず、この道具が書いたものを置いた`);
  report.push(`LICENSE（MIT）：著作権者は ${holder.source} から（${holder.name ? "決定済み" : `未確定のため ${UNDECIDED_HOLDER}`}）`);
  report.push(`THIRD_PARTY_NOTICES.md：パッケージ ${notices.counts.packages}件（本文あり ${notices.counts.withText}・全文なし ${notices.counts.withoutText}）・本文の種類 ${notices.counts.texts}・NOTICE の種類 ${notices.counts.notices}${notices.counts.versionMismatch ? `・lock と版が違うもの ${notices.counts.versionMismatch}` : ""}`);
  report.push(`  同梱の素材 ${notices.assets}件（出どころの記載なし ${notices.assetsUnlisted.length}件）・書体のファイル ${notices.fonts}件`);
  report.push(git ? `Git：${git.branch} に ${git.commits} コミット（${git.files}件。作者は noreply のアドレス。リモートは無し）` : "Git：初期化していない（--init-git で1コミットにできる）");
  report.push("", "--- 点検（scripts/hygiene.mjs --tree） ---");
  report.push(hygiene.missing ? "scripts/hygiene.mjs が無いため、点検できませんでした" : `${hygiene.stdout.trimEnd()}${hygiene.stderr.trim() ? `\n${hygiene.stderr.trim()}` : ""}`);
  report.push("--- 点検ここまで ---", "");
  report.push(`木の指紋：sha256:${fp.value}`);
  report.push(`記録：${recordPath.startsWith(repo + sep) ? recordPath.slice(repo.length + 1).split(sep).join("/") : basename(recordPath)}`);
  if (!holder.name) report.push(`警告：運営者の名称が未確定のため、LICENSE の著作権者を ${UNDECIDED_HOLDER} にしました。src/lib/operator-info.ts の name を決めるか、--holder で指定するまで公開できません`);
  report.push(`判定：${problems.length ? `NG（${problems.join("・")}）— この木は公開できません` : "OK（書き出した木は点検に合格。公開の前に本人が確かめる）"}`);
  console.log(report.join("\n"));
  return problems.length ? 1 : 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof UsageError) {
    console.error(`snapshot: ${error.message}`);
    process.exitCode = 2;
  } else {
    console.error(`snapshot: 途中で止まりました（${error instanceof Error ? error.message : String(error)}）。書きかけの出力先は消していません`);
    process.exitCode = 2;
  }
}
