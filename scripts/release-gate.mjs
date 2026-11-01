#!/usr/bin/env node
// Release gate (the ReleaseGate of tasks-release.md 7.3). One command answers "may this be published now?": it judges
// each condition as PASS, FAIL or SKIP with a one-line reason, prints the table, and exits 1 when anything failed. It
// only reads and judges. It never publishes, pushes, merges or deploys, and it prints file names, line numbers and
// counts, never the values it read (the operator's name and address, identifiers, NG words).
//
//   npm run release-gate -- --snapshot <dir>               the demo-only public site (PAGECRATE_PAUSED=1) plus the code
//   npm run release-gate -- --snapshot <dir> --mode live   before page scans of real sites are opened: adds L1–L3
//   npm run release-gate -- --e2e-fingerprint              print the fingerprint an E2E record must carry, then stop
//
// --snapshot is the tree written by `npm run snapshot -- --out <dir>` (outside the repository); without it, the
// conditions on the published tree fail. --root <dir> is the repository to judge (default: the current folder; the
// tests point it at fake trees). --skip-run leaves out npm test, typecheck and lint: G11 then shows SKIP, or FAIL when
// the E2E record fails. Exit status: 0 no FAIL (all PASS, or a SKIP, which is not a verdict for publishing), 1 at least
// one FAIL, 2 bad arguments.
//
// demo-only: G1 the operator's name, contact and rights desk are decided (src/lib/operator-info.ts; both addresses
// shaped like a mail address) · G2 the published src/, docs/ and README.md hold no old wording (OLD_WORDING of
// tests/e2e/support.ts), no "草案" and no undecided-operator notice · G3 the latest public check (a hygiene record of
// profile public or tree) passed with nothing failed or skipped, on a tree whose fingerprint equals --snapshot's ·
// G4 LICENSE is the full MIT text with a decided holder · G5 THIRD_PARTY_NOTICES.md lists every non-development entry
// of package-lock.json · G6 docs/rights-and-terms.md keeps "調べた範囲", "未確認" and "専門家（弁護士）の確認が要る点"
// apart, and says "問題なし" only on a line that also says "未確認" or "確認が要る" · G7 the evidence table · G8 the
// highest-numbered UI review passed · G9 the dynamic inspection and the final independent review exist with no open
// finding (a line starting 未対処), the review's 判定 line is there and agrees with its findings, and each BLOCKER or MAJOR
// finding has its own 対処： line · G10 wrangler.jsonc (logs off, no account_id, every setting required) and docs/operations.md · G11 unit
// tests, typecheck and lint pass when run here, and the E2E record matches the current tree.
// live: L1 the real-key check record has no "未確認" line · L2 the lawyer's and Cloudflare's answers are recorded ·
// L3 every "ライブ取得を開く前" row of the evidence table is done.
//
// The E2E record, .agent-harness/evidence/verify/e2e-latest.json, is written by whoever ran the whole E2E suite:
//   {"passed": <passed tests, at least 1>, "failed": 0, "fingerprint": "sha256:<64 hex digits>"}
// Other keys are allowed. The fingerprint covers what E2E exercised: every file under src/, tests/ and public/
// (except .DS_Store) plus package.json, wrangler.jsonc and next.config.ts. It is the SHA-256 of the lines
// "<SHA-256 of the content>  <path>" sorted by the bytes of the path, the calculation of the public snapshot's
// fingerprint (a symbolic link counts as the text "symlink:<target>"; none are expected there). Without this tool:
//   (find src tests public -type f ! -name .DS_Store; ls package.json wrangler.jsonc next.config.ts) | LC_ALL=C sort |
//     tr '\n' '\0' | xargs -0 shasum -a 256 | shasum -a 256
//
// The evidence table is read as .agent-harness/prompts/impl-gate.md defines it: every line starting with "|" is a row
// of "| 要件 | 時期 | 種類 | 証拠または手順名 | 状態 |". A blank cell, an unknown value or a missing requirement fails.
// Rows due before the demo-only release must be done and cite existing files; rows due before live fetching may be
// undone but must name a step that release-checklist.md contains.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_TOOL = join(TOOL_ROOT, "scripts", "make-public-snapshot.mjs");

const SPEC = ".kiro/specs/pagecrate-public-no-login";
const FILES = {
  operatorInfo: "src/lib/operator-info.ts",
  oldWording: "tests/e2e/support.ts",
  evidenceTable: `${SPEC}/evidence-table.md`,
  requirements: `${SPEC}/requirements.md`,
  checklist: `${SPEC}/release-checklist.md`,
  rights: "docs/rights-and-terms.md",
  operations: "docs/operations.md",
  wrangler: "wrangler.jsonc",
  hygieneRecords: ".agent-harness/evidence/hygiene",
  e2eRecord: ".agent-harness/evidence/verify/e2e-latest.json",
  runs: ".agent-harness/runs",
};

/** The undecided-operator notice (UNDECIDED_LABEL) and the draft mark, besides OLD_WORDING. */
const UNDECIDED_NOTICE = "公開前に確定して掲載します";
const EXTRA_WORDS = ["草案", UNDECIDED_NOTICE];
/** The one line allowed to spell the notice: its definition, shown only while a field is undecided (G1 forbids that). */
const NOTICE_DEFINITION = { file: "src/lib/operator-info.ts", line: /^\s*export\s+const\s+UNDECIDED_LABEL\s*=/ };
/** What make-public-snapshot.mjs writes as the LICENSE holder while the operator name is undecided. */
const UNDECIDED_HOLDER = "<OPERATOR-NAME-UNDECIDED>";
const OPERATOR_FIELDS = [["name", "運営者の名称"], ["contact", "問い合わせ先"], ["rightsContact", "権利者の申し立て窓口"]];
/** Every Worker setting the release needs (release-checklist.md chapter 2): the four operator settings and three keys. */
const REQUIRED_SECRETS = [
  "PAGECRATE_PUBLIC_ORIGIN", "PAGECRATE_DAILY_RENDER_CAP", "PAGECRATE_PAUSED", "PAGECRATE_BLOCKED_HOSTS",
  "PAGECRATE_TICKET_SECRET", "PAGECRATE_TURNSTILE_SECRET", "PAGECRATE_TURNSTILE_SITEKEY",
];
const MIT_TERMS = [
  "Permission is hereby granted, free of charge, to any person obtaining a copy",
  "of this software and associated documentation files (the \"Software\"), to deal",
  "in the Software without restriction, including without limitation the rights",
  "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell",
  "copies of the Software, and to permit persons to whom the Software is",
  "furnished to do so, subject to the following conditions:",
  "The above copyright notice and this permission notice shall be included in all",
  "copies or substantial portions of the Software.",
  "THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR",
  "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,",
  "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE",
  "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER",
  "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,",
  "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE",
  "SOFTWARE.",
].join(" ");
const E2E_DIRS = ["src", "tests", "public"];
const E2E_FILES = ["package.json", "wrangler.jsonc", "next.config.ts"];

const TABLE_HEADER = ["要件", "時期", "種類", "証拠または手順名", "状態"];
const BEFORE_DEMO = "公開前";
const BEFORE_LIVE = "ライブ取得を開く前";
const TIMES = new Set([BEFORE_DEMO, BEFORE_LIVE, "公開後"]);
const KINDS = new Set(["自動試験", "実画面の確認", "記録", "運営者の手順"]);
const STATES = new Set(["済", "未"]);
const COMMON_ROWS = ["共通-1"];
/** A cited file: the word before the first 「 (or the first word) starting with one of these, or a top-level file. */
const PATH_PREFIX = /^(?:tests|docs|src|scripts|public|fixtures|\.agent-harness|\.kiro|\.github)\//;
const TOP_FILE = /^[A-Za-z0-9_.-]+\.(?:md|json|jsonc|ts|tsx|mjs|js|txt)$/;

const UI_REVIEW = /^review-ui-r(\d+)\.md$/;
const UI_HEAD_LINES = 10;
const NO_ZERO_ITEM = /(?<!\d)0\s*点の項目\s*(?:[：:は]\s*)?(?:なし|無し|ない|無い|ありません)/;
const ASSERTION = /問題(?:なし|無し|は?ありません)/;
const UNCONFIRMED_HERE = /未確認|確認が要る/;
const MAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const NOT_A_REAL_MAILBOX = (address) => {
  const [local = "", domain = ""] = address.toLowerCase().split("@");
  return /^no-?reply$/.test(local) || domain.includes("noreply") || /(?:^|\.)example\.(?:com|net|org)$/.test(domain) ||
    /(?:^|\.)(?:example|test|invalid|localhost)$/.test(domain);
};

class UsageError extends Error {}

const pass = (reason) => ({ status: "PASS", reason });
const fail = (reason) => ({ status: "FAIL", reason });
const skip = (reason) => ({ status: "SKIP", reason });
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const byBytes = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const inside = (child, parent) => child === parent || child.startsWith(parent + sep);
const lines = (text) => text.split(/\r?\n/);
const list = (items, max = 3) => `${items.slice(0, max).join("、")}${items.length > max ? ` ほか${items.length - max}件` : ""}`;
/** Printed paths come from the files read; anything that is not plainly a path is not echoed. */
const shownPath = (rel) => (/^[A-Za-z0-9._/-]+$/.test(rel) ? rel : "（表記を伏せたパス）");

function isFile(path) {
  try { return statSync(path).isFile(); } catch { return false; }
}
function isDir(path) {
  try { return statSync(path).isDirectory(); } catch { return false; }
}
function readText(base, rel) {
  const path = join(base, ...rel.split("/"));
  return isFile(path) ? readFileSync(path, "utf8") : null;
}
function readJson(path) {
  try { return { ok: true, value: JSON.parse(readFileSync(path, "utf8")) }; } catch { return { ok: false, value: null }; }
}

function parseArgs(argv) {
  const opts = { root: process.cwd(), snapshot: null, mode: "demo-only", skipRun: false, e2eFingerprint: false, help: false };
  const takes = { "--root": "root", "--snapshot": "snapshot", "--mode": "mode" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") { opts.help = true; continue; }
    if (arg === "--skip-run") { opts.skipRun = true; continue; }
    if (arg === "--e2e-fingerprint") { opts.e2eFingerprint = true; continue; }
    const key = takes[arg];
    if (!key) throw new UsageError(`知らない指定です：${arg}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) throw new UsageError(`${arg} の値がありません`);
    opts[key] = value;
  }
  if (opts.mode !== "demo-only" && opts.mode !== "live") throw new UsageError("--mode は demo-only か live です");
  const root = resolve(opts.root);
  if (!isDir(root)) throw new UsageError("--root にはフォルダを指定してください");
  opts.root = realpathSync(root);
  if (opts.snapshot !== null) {
    const snapshot = resolve(opts.snapshot);
    if (!isDir(snapshot)) throw new UsageError("--snapshot には、公開用スナップショットの道具が書き出したフォルダを指定してください");
    opts.snapshot = realpathSync(snapshot);
    if (inside(opts.snapshot, opts.root) || inside(opts.root, opts.snapshot)) throw new UsageError("--snapshot には、リポジトリの外のフォルダ（npm run snapshot の出力先）を指定してください");
  }
  return opts;
}

// ---------------------------------------------------------------------------------------------------------------
// Fingerprints.

/** Lines "<SHA-256 of the content>  <path>" sorted by the bytes of the path, hashed: the snapshot's calculation. */
function fingerprintOf(base, rels) {
  const entries = [];
  for (const rel of rels) {
    const abs = join(base, ...rel.split("/"));
    const stat = lstatSync(abs, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isSymbolicLink()) entries.push([sha256(`symlink:${readlinkSync(abs)}`), rel]);
    else if (stat.isFile()) entries.push([sha256(readFileSync(abs)), rel]);
  }
  entries.sort((a, b) => byBytes(a[1], b[1]));
  return { value: `sha256:${sha256(entries.map(([hash, rel]) => `${hash}  ${rel}\n`).join(""))}`, count: entries.length };
}

function filesUnder(base, dir, keep = () => true) {
  const found = [];
  const walk = (rel) => {
    for (const entry of readdirSync(join(base, ...rel.split("/")), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (keep(entry.name)) found.push(child);
    }
  };
  if (isDir(join(base, dir))) walk(dir);
  return found;
}

/** What E2E ran on: src/, tests/, public/ and three top-level files (see the header). */
function e2eFingerprint(root) {
  const rels = [...E2E_DIRS.flatMap((dir) => filesUnder(root, dir, (name) => name !== ".DS_Store")), ...E2E_FILES];
  return fingerprintOf(root, rels);
}

/** The published tree's fingerprint, computed by make-public-snapshot.mjs itself so the two can never drift apart. */
function snapshotFingerprint(snapshot) {
  if (!isFile(SNAPSHOT_TOOL)) return { error: "木の指紋を計算する道具（scripts/make-public-snapshot.mjs）が無い" };
  const result = spawnSync(process.execPath, [SNAPSHOT_TOOL, "--fingerprint", snapshot], { cwd: TOOL_ROOT, encoding: "utf8" });
  const value = /^(sha256:[0-9a-f]{64})\b/m.exec(result.stdout ?? "")?.[1];
  return result.status === 0 && value ? { value } : { error: "公開する木の指紋を計算できない（make-public-snapshot.mjs --fingerprint が失敗した）" };
}

// ---------------------------------------------------------------------------------------------------------------
// Readers shared by several conditions.

/** OLD_WORDING read as text: a list of plain double-quoted strings and nothing else, or the gate refuses to guess. */
function readOldWording(root) {
  const text = readText(root, FILES.oldWording);
  if (text === null) return { error: "旧表記の一覧（tests/e2e/support.ts）が無い" };
  const match = /export\s+const\s+OLD_WORDING\s*=\s*\[([\s\S]*?)\]\s*(?:as\s+const\s*)?;/.exec(text);
  if (!match) return { error: "tests/e2e/support.ts に OLD_WORDING の一覧が見つからない" };
  const words = [];
  const rest = match[1].replace(/"((?:[^"\\\n]|\\.)*)"/g, (_, inner) => { words.push(JSON.parse(`"${inner}"`)); return ""; });
  if (rest.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "").replace(/[\s,]/g, "") !== "") return { error: "OLD_WORDING に、二重引用符の文字列でない要素がある（道具が読めない形）" };
  if (!words.length) return { error: "OLD_WORDING が空" };
  return { words };
}

function splitRow(line) {
  let body = line.trim().slice(1);
  if (/(?<!\\)\|$/.test(body)) body = body.slice(0, -1);
  return body.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

/** Requirement ids (N.k) from the numbered acceptance criteria of requirements.md. */
function requirementIds(text) {
  const ids = [];
  let requirement = null;
  let criteria = false;
  for (const line of lines(text)) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const number = /^Requirement\s+(\d+)\b/.exec(heading[2]);
      if (heading[1].length <= 3) requirement = number ? number[1] : null;
      criteria = heading[1].length === 4 && /^Acceptance Criteria/.test(heading[2]) && requirement !== null;
      continue;
    }
    const item = criteria ? /^(\d+)\.\s/.exec(line) : null;
    if (item) ids.push(`${requirement}.${item[1]}`);
  }
  return ids;
}

/** The evidence table, parsed once for G7 and L3. Errors are problems with the table as a whole. */
function readEvidenceTable(ctx) {
  if (ctx.table) return ctx.table;
  const text = readText(ctx.root, FILES.evidenceTable);
  if (text === null) return (ctx.table = { error: "対応表が無い（evidence-table.md）" });
  const rows = [];
  const problems = [];
  let headers = 0;
  lines(text).forEach((line, index) => {
    if (!line.startsWith("|")) return;
    const cells = splitRow(line);
    if (cells.length === TABLE_HEADER.length && cells.every((cell, i) => cell === TABLE_HEADER[i])) { headers++; return; }
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) return;
    const at = `${index + 1}行目`;
    if (cells.length !== TABLE_HEADER.length) { problems.push(`${at}：列が${cells.length}つ`); return; }
    const [id, time, kind, evidence, state] = cells;
    const blank = TABLE_HEADER.filter((_, i) => cells[i] === "");
    if (blank.length) { problems.push(`${at}：空欄（${blank.join("・")}）`); return; }
    if (!/^(?:\d+\.\d+|共通-\d+)$/.test(id)) { problems.push(`${at}：要件の番号の形が違う`); return; }
    const unknown = [[time, TIMES, "時期"], [kind, KINDS, "種類"], [state, STATES, "状態"]].filter(([value, known]) => !known.has(value)).map(([, , label]) => label);
    if (unknown.length) { problems.push(`${at}：知らない値（${unknown.join("・")}）`); return; }
    rows.push({ at, id, time, kind, evidence, state });
  });
  if (!headers) return (ctx.table = { error: "対応表の見出し行（| 要件 | 時期 | 種類 | 証拠または手順名 | 状態 |）が無い" });
  return (ctx.table = { rows, problems });
}

const evidenceItems = (cell) => cell.split("／").map((item) => item.trim()).filter(Boolean);

/** The file an evidence item cites, or null when it cites none (operators' steps may be words only). */
function citedPath(item) {
  const quote = item.indexOf("「");
  const head = (quote >= 0 ? item.slice(0, quote) : item).trim().split(/\s+/);
  const word = (quote >= 0 ? head[head.length - 1] : head[0]) ?? "";
  return PATH_PREFIX.test(word) || TOP_FILE.test(word) ? word : null;
}

/** The cited files of a row that do not exist (a path that climbs out of the root counts as missing). */
function missingFiles(root, row) {
  const paths = evidenceItems(row.evidence).map(citedPath).filter(Boolean);
  return { paths, missing: paths.filter((path) => path.split("/").includes("..") || !existsSync(join(root, ...path.split("/")))) };
}

const normalize = (text) => text.replace(/\*\*|`/g, "").replace(/\s+/g, " ").trim();
/** The step a row names: the quote of its first item, or the item without notes in （）. */
function stepName(row) {
  const first = evidenceItems(row.evidence)[0] ?? "";
  const quoted = /「([^」]+)」/.exec(first);
  return normalize(quoted ? quoted[1] : first.replace(/（[^）]*）/g, ""));
}

// ---------------------------------------------------------------------------------------------------------------
// The conditions. Each returns pass/fail/skip with one line, and never a value it read.

async function checkOperator(ctx) { // G1
  const file = join(ctx.root, ...FILES.operatorInfo.split("/"));
  if (!isFile(file)) return fail("src/lib/operator-info.ts が無い");
  let mod;
  try { mod = await import(pathToFileURL(file).href); } catch { return fail("src/lib/operator-info.ts を読めない（npm run release-gate で動かす）"); }
  const info = mod.OPERATOR_INFO;
  if (!info || typeof info !== "object") return fail("src/lib/operator-info.ts に OPERATOR_INFO が無い");
  const undecided = new Set();
  const notMail = [];
  const sample = [];
  for (const [key, label] of OPERATOR_FIELDS) {
    const value = info[key];
    if (typeof value !== "string" || value.trim() === "") { undecided.add(label); continue; }
    const text = value.trim();
    if (key === "name") {
      if (/[\u0000-\u001f\u007f]/.test(text) || /^<[^>]*>$/.test(text) || text.includes("未確定") || text.includes(UNDECIDED_HOLDER)) sample.push(label);
    } else if (!MAIL.test(text)) notMail.push(label);
    else if (NOT_A_REAL_MAILBOX(text)) sample.push(label);
  }
  if (typeof mod.missingOperatorFields === "function") {
    const missing = mod.missingOperatorFields(info);
    if (Array.isArray(missing)) for (const key of missing) undecided.add(OPERATOR_FIELDS.find(([field]) => field === key)?.[1] ?? "欄");
  }
  const problems = [];
  if (undecided.size) problems.push(`未確定：${[...undecided].join("・")}`);
  if (notMail.length) problems.push(`メールの形でない：${notMail.join("・")}`);
  if (sample.length) problems.push(`見本・未確定の印・返信できない宛先：${sample.join("・")}`);
  return problems.length ? fail(`${problems.join("。")}（src/lib/operator-info.ts）`) : pass("運営者の名称・問い合わせ先・権利者の申し立て窓口が確定（窓口の2つはメールの形）");
}

function checkWording(ctx) { // G2
  const words = readOldWording(ctx.root);
  if (words.error) return fail(words.error);
  if (!ctx.snapshot) return fail("公開する木の指定が無い（--snapshot）");
  const absent = ["src", "docs", "README.md"].filter((rel) => !existsSync(join(ctx.snapshot, rel)));
  if (absent.length) return fail(`公開する木に ${absent.join("・")} が無い`);
  const banned = [...new Set([...words.words, ...EXTRA_WORDS])];
  const hits = [];
  for (const rel of [...filesUnder(ctx.snapshot, "src"), ...filesUnder(ctx.snapshot, "docs"), "README.md"].sort(byBytes)) {
    const abs = join(ctx.snapshot, ...rel.split("/"));
    if (lstatSync(abs).isSymbolicLink()) continue; // published as the link's text; never read through it
    const buffer = readFileSync(abs);
    if (buffer.subarray(0, 8192).includes(0)) continue; // images and other binary files
    lines(buffer.toString("utf8")).forEach((line, index) => {
      for (const word of banned) {
        if (!line.includes(word)) continue;
        if (word === UNDECIDED_NOTICE && rel === NOTICE_DEFINITION.file && NOTICE_DEFINITION.line.test(line)) continue;
        hits.push(`${shownPath(rel)}:${index + 1}「${word}」`);
      }
    });
  }
  return hits.length
    ? fail(`旧表記・草案・未確定の表示が${hits.length}か所：${list(hits)}`)
    : pass(`公開する木の src・docs・README.md に、旧表記${words.words.length}語・「草案」・未確定の表示が無い`);
}

function checkHygieneRecord(ctx) { // G3
  if (!ctx.snapshot) return fail("公開する木の指定が無い（--snapshot）");
  const dir = join(ctx.root, ...FILES.hygieneRecords.split("/"));
  if (!isDir(dir)) return fail("点検の記録のフォルダが無い（.agent-harness/evidence/hygiene/）");
  const names = readdirSync(dir).sort(byBytes);
  const records = [];
  for (const name of names.filter((n) => /^hygiene-(?:public|tree)-.*\.json$/.test(n))) {
    const read = readJson(join(dir, name));
    if (!read.ok || !read.value || typeof read.value !== "object") return fail(`読めない点検の記録がある（${name}）`);
    records.push({ name, data: read.value, time: Date.parse(read.value.ranAt) || 0 });
  }
  if (!records.length) return fail("公開用の点検（profile が public か tree）の記録が無い");
  records.sort((a, b) => a.time - b.time || byBytes(a.name, b.name));
  const latest = records[records.length - 1];
  const { findings, notRun, verdict } = latest.data;
  if (!Array.isArray(findings) || !Array.isArray(notRun)) return fail(`最新の点検の記録（${latest.name}）の形が違う`);
  const failed = findings.filter((finding) => finding?.severity === "fail").length;
  if (failed || notRun.length || verdict !== "pass") return fail(`最新の点検の記録（${latest.name}）が合格でない（失敗${failed}・未実施${notRun.length}）`);
  const links = names.filter((n) => /^snapshot-.*\.json$/.test(n)).map((name) => readJson(join(dir, name)).value)
    .filter((data) => typeof data?.hygiene?.record === "string" && basename(data.hygiene.record) === latest.name)
    .sort((a, b) => (Date.parse(a.ranAt) || 0) - (Date.parse(b.ranAt) || 0));
  if (!links.length) return fail(`最新の点検の記録（${latest.name}）に結び付く木の指紋が無い（make-public-snapshot の記録が無い）`);
  const recorded = links[links.length - 1].fingerprint;
  if (typeof recorded !== "string" || !/^sha256:[0-9a-f]{64}$/.test(recorded)) return fail("記録の木の指紋の形が違う");
  const actual = snapshotFingerprint(ctx.snapshot);
  if (actual.error) return fail(actual.error);
  return actual.value === recorded
    ? pass(`最新の点検の記録（${latest.name}）は失敗0・未実施0で、木の指紋が公開する木と一致`)
    : fail(`公開する木の指紋が、最新の点検の記録（${latest.name}）の木と違う（点検のあとに変わったか、別の木）`);
}

function checkLicense(ctx) { // G4
  if (!ctx.snapshot) return fail("公開する木の指定が無い（--snapshot）");
  const text = readText(ctx.snapshot, "LICENSE");
  if (text === null) return fail("公開する木に LICENSE が無い");
  if (text.includes(UNDECIDED_HOLDER)) return fail("LICENSE の著作権者が未確定（未確定の印がある）");
  const match = /^\s*MIT License[ \t]*\n\s*Copyright (?:\([cC]\)|©) \d{4}(?:\s*[-–]\s*\d{4})? ([^\n]+)\n([\s\S]*)$/.exec(text.replace(/\r\n?/g, "\n"));
  if (!match) return fail("LICENSE が「MIT License」と著作権の行で始まっていない");
  const holder = match[1].trim();
  if (!holder || /^<[^>]*>$/.test(holder) || /^\[[^\]]*\]$/.test(holder) || holder.includes("未確定")) return fail("LICENSE の著作権者が未確定");
  return match[2].replace(/\s+/g, " ").trim() === MIT_TERMS ? pass("LICENSE は MIT の全文で、著作権者が確定") : fail("LICENSE の本文が MIT の全文と違う");
}

function checkNotices(ctx) { // G5
  if (!ctx.snapshot) return fail("公開する木の指定が無い（--snapshot）");
  const notices = readText(ctx.snapshot, "THIRD_PARTY_NOTICES.md");
  if (notices === null) return fail("公開する木に THIRD_PARTY_NOTICES.md が無い");
  const lockText = readText(ctx.snapshot, "package-lock.json");
  if (lockText === null) return fail("公開する木に package-lock.json が無い");
  let lock;
  try { lock = JSON.parse(lockText); } catch { return fail("package-lock.json を読めない"); }
  if (!lock || typeof lock.packages !== "object" || lock.packages === null) return fail("package-lock.json に packages が無い（lockfileVersion 2 以上が要る）");
  const listed = new Set();
  const names = new Set();
  for (const line of lines(notices)) {
    const row = /^\|\s*`([^`]+)`\s*\|\s*((?:\\.|[^|\\])*?)\s*\|/.exec(line);
    if (!row) continue;
    const version = row[2].replace(/\\([\\`*_[\]|])/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    listed.add(`${row[1]}@${version}`);
    names.add(row[1]);
  }
  const missing = [];
  let total = 0;
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (!key.includes("node_modules/") || entry?.dev === true || entry?.devOptional === true) continue;
    total++;
    const name = typeof entry?.name === "string" ? entry.name : key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
    const ok = typeof entry?.version === "string" ? listed.has(`${name}@${entry.version}`) : names.has(name);
    if (!ok) missing.push(typeof entry?.version === "string" ? `${name}@${entry.version}` : name);
  }
  if (!total) return fail("package-lock.json に開発用でない項目が無い");
  return missing.length
    ? fail(`THIRD_PARTY_NOTICES.md に無い：${missing.length}件（${list(missing)}）`)
    : pass(`THIRD_PARTY_NOTICES.md が package-lock.json の開発用でない${total}件をすべて載せている`);
}

function checkRightsDoc(ctx) { // G6
  const text = readText(ctx.root, FILES.rights);
  if (text === null) return fail("docs/rights-and-terms.md が無い");
  const all = lines(text);
  const headings = all.map((line, index) => ({ index, match: /^(#{1,6})\s+(.*)$/.exec(line) })).filter((h) => h.match)
    .map((h) => ({ index: h.index, level: h.match[1].length, text: h.match[2].trim() }));
  const wanted = [["調べた範囲", /^調べた範囲/], ["未確認", /^未確認/], ["専門家（弁護士）の確認が要る点", /^専門家[（(]弁護士[）)]の確認が要る点/]];
  const problems = [];
  for (const [label, pattern] of wanted) {
    const heading = headings.find((h) => pattern.test(h.text));
    if (!heading) { problems.push(`見出しが無い：${label}`); continue; }
    const next = headings.find((h) => h.index > heading.index && h.level <= heading.level);
    const body = all.slice(heading.index + 1, next ? next.index : all.length);
    if (!body.some((line) => line.trim() !== "" && !/^#{1,6}\s/.test(line))) problems.push(`中身が無い：${label}`);
  }
  const assertive = all.map((line, index) => [line, index + 1]).filter(([line]) => ASSERTION.test(line) && !UNCONFIRMED_HERE.test(line)).map(([, n]) => `${n}行目`);
  if (assertive.length) problems.push(`「問題なし」などの断定が、「未確認」「確認が要る」の無い行にある：${list(assertive, 5)}`);
  return problems.length
    ? fail(`${problems.join("。")}（docs/rights-and-terms.md）`)
    : pass("「調べた範囲」「未確認」「専門家（弁護士）の確認が要る点」が別の見出しで中身があり、断定の語は未確認と区別されている");
}

function checkEvidenceTable(ctx) { // G7
  const table = readEvidenceTable(ctx);
  if (table.error) return fail(table.error);
  const problems = [...table.problems];
  const requirements = readText(ctx.root, FILES.requirements);
  const ids = requirements === null ? [] : requirementIds(requirements);
  if (!ids.length) problems.push("要件の一覧（requirements.md）を読めない");
  const present = new Set(table.rows.map((row) => row.id));
  const absent = [...ids, ...COMMON_ROWS].filter((id) => !present.has(id));
  if (ids.length && absent.length) problems.push(`表に無い要件：${list(absent, 5)}`);
  const beforeDemo = table.rows.filter((row) => row.time === BEFORE_DEMO);
  const undone = beforeDemo.filter((row) => row.state !== "済").map((row) => row.id);
  if (undone.length) problems.push(`公開前で未の行：${undone.length}（${list(undone, 8)}）`);
  const noFile = [];
  const gone = [];
  for (const row of beforeDemo.filter((r) => r.state === "済")) {
    const { paths, missing } = missingFiles(ctx.root, row);
    if (!paths.length) noFile.push(row.id);
    for (const path of missing) gone.push(`${row.id} ${shownPath(path)}`);
  }
  if (noFile.length) problems.push(`公開前で済なのに、証拠のファイルが書かれていない：${list(noFile, 5)}`);
  if (gone.length) problems.push(`証拠のファイルが無い：${list(gone)}`);
  const beforeLive = table.rows.filter((row) => row.time === BEFORE_LIVE);
  const checklist = readText(ctx.root, FILES.checklist);
  if (beforeLive.length && checklist === null) problems.push("release-checklist.md が無い（ライブ取得を開く前の手順名を確かめられない）");
  else if (checklist !== null) {
    const steps = normalize(checklist);
    const unknown = beforeLive.filter((row) => { const step = stepName(row); return !step || !steps.includes(step); }).map((row) => row.id);
    if (unknown.length) problems.push(`ライブ取得を開く前の手順名が release-checklist.md に無い：${list(unknown, 5)}`);
  }
  return problems.length
    ? fail(problems.join("。"))
    : pass(`要件${ids.length}＋共通${COMMON_ROWS.length}の行がそろい、公開前の${beforeDemo.length}行は済で証拠が実在、ライブ取得を開く前の${beforeLive.length}行は手順名が release-checklist.md にある`);
}

function checkUiReview(ctx) { // G8
  const dir = join(ctx.root, ...FILES.runs.split("/"));
  const reviews = isDir(dir)
    ? readdirSync(dir).map((name) => ({ name, match: UI_REVIEW.exec(name) })).filter((r) => r.match).map((r) => ({ name: r.name, number: Number(r.match[1]) })).sort((a, b) => a.number - b.number)
    : [];
  if (!reviews.length) return fail("UI採点の記録（.agent-harness/runs/review-ui-r*.md）が無い");
  const latest = reviews[reviews.length - 1];
  const head = lines(readText(dir, latest.name) ?? "").slice(0, UI_HEAD_LINES).join("\n");
  const problems = [];
  if (head.includes("不合格")) problems.push("不合格と書かれている");
  else if (!head.includes("合格")) problems.push("合格と書かれていない");
  const total = /合計\s*(\d+)\s*\/\s*20/.exec(head) ?? /(\d+)\s*\/\s*20/.exec(head);
  const score = total ? Number(total[1]) : null;
  if (score === null) problems.push("合計点（◯/20）が無い");
  else if (score < 16 || score > 20) problems.push(`合計 ${score}/20 で16点に届かない`);
  if (!NO_ZERO_ITEM.test(head)) problems.push("0点の項目が無いと書かれていない");
  return problems.length ? fail(`${latest.name}（先頭${UI_HEAD_LINES}行）：${problems.join("・")}`) : pass(`${latest.name}：合計 ${score}/20・合格・0点の項目なし`);
}

/** A finding still open: a line, list item or table cell that starts with 未対処. */
function openFindings(text) {
  return lines(text).map((line, index) => [line, index + 1]).filter(([line]) => {
    const cells = line.trimStart().startsWith("|") ? splitRow(line) : [line.replace(/^\s*(?:(?:[-*+]|\d+[.)]|>)\s+)*/, "")];
    return cells.some((cell) => /^(?:\*\*)?未対処/.test(cell.trim()));
  }).map(([, n]) => n);
}

/** The verdict line the reviewer writes first: 判定：BLOCKER あり / MAJOR あり / MINORのみ. */
const REVIEW_VERDICT = /^\s*(?:[-*+]\s+)?(?:\*\*)?判定(?:（[^）]*）)?[:：]\s*(?:\*\*)?\s*(BLOCKER\s*あり|MAJOR\s*あり|MINOR\s*のみ)/m;
/** A finding of a weight that must be handled before release: "### R1 MAJOR：…" or "### R2 BLOCKER：…". */
const SERIOUS_FINDING = /^#{2,4}\s*(\S+)\s+(BLOCKER|MAJOR)\b/;
/** The line that closes a finding (written after the review): 対処：… with some text, as a list item or plain. */
const HANDLED_LINE = /^\s*(?:[-*+]\s+)?(?:\*\*)?対処(?:済み)?[:：](?:\*\*)?\s*\S/;

/**
 * What the final review's verdict requires (independent review before release, R2: the word 未対処 alone let a verdict
 * of BLOCKER or MAJOR pass): the verdict line is there, it does not contradict the findings, and every BLOCKER and MAJOR
 * finding has a 対処： line in its own section (up to the next heading). A MINOR finding needs none.
 */
function reviewVerdictProblems(text) {
  const verdict = REVIEW_VERDICT.exec(text);
  if (!verdict) return ["判定の行（判定：BLOCKER あり／MAJOR あり／MINORのみ）が読めない"];
  const body = lines(text);
  const serious = [];
  body.forEach((line, index) => {
    const heading = SERIOUS_FINDING.exec(line);
    if (!heading) return;
    let end = index + 1;
    while (end < body.length && !/^#{1,4}\s/.test(body[end])) end++;
    serious.push({ id: heading[1], weight: heading[2], handled: body.slice(index + 1, end).some((inner) => HANDLED_LINE.test(inner)) });
  });
  const stated = verdict[1].replace(/\s+/g, "");
  const problems = [];
  if (stated === "MINORのみ" && serious.length) problems.push(`判定は MINORのみ だが、BLOCKER・MAJOR の所見（${list(serious.map((finding) => finding.id), 5)}）がある`);
  if (stated !== "MINORのみ" && !serious.length) problems.push(`判定は ${stated} だが、その重さの所見の見出し（### R1 MAJOR：…）が読めない`);
  for (const finding of serious) if (!finding.handled) problems.push(`${finding.id}（${finding.weight}）に「対処：」の行が無い`);
  return problems;
}

function checkInspections(ctx) { // G9
  const problems = [];
  for (const name of ["dynamic-inspection.md", "review-final.md"]) {
    const text = readText(join(ctx.root, ...FILES.runs.split("/")), name);
    if (text === null) { problems.push(`${name} が無い`); continue; }
    if (!text.trim()) { problems.push(`${name} が空`); continue; }
    const open = openFindings(text);
    if (open.length) problems.push(`${name} に未対処の行：${list(open.map((n) => `${n}行目`), 5)}`);
    if (name === "review-final.md") for (const problem of reviewVerdictProblems(text)) problems.push(`${name}：${problem}`);
  }
  return problems.length ? fail(problems.join("。")) : pass("動的検査（dynamic-inspection.md）と最終の独立レビュー（review-final.md）があり、未対処の行が無く、判定と所見の対処がそろっている");
}

/** wrangler.jsonc without comments and trailing commas, strings kept as they are. */
function parseJsonc(text) {
  let bare = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { bare += c; if (c === "\\") bare += text[++i] ?? ""; else if (c === "\"") quoted = false; }
    else if (c === "\"") { quoted = true; bare += c; }
    else if (c === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; bare += "\n"; }
    else if (c === "/" && text[i + 1] === "*") { const end = text.indexOf("*/", i + 2); if (end < 0) break; i = end + 1; }
    else bare += c;
  }
  let out = "";
  quoted = false;
  for (let i = 0; i < bare.length; i++) {
    const c = bare[i];
    if (quoted) { out += c; if (c === "\\") out += bare[++i] ?? ""; else if (c === "\"") quoted = false; continue; }
    if (c === "\"") quoted = true;
    if (c === "," && /^\s*[}\]]/.test(bare.slice(i + 1))) continue;
    out += c;
  }
  return JSON.parse(out);
}
function allKeys(value) {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, inner]) => [key, ...allKeys(inner)]);
}
function objectsWithKey(value, key) {
  if (Array.isArray(value)) return value.flatMap((item) => objectsWithKey(item, key));
  if (value === null || typeof value !== "object") return [];
  return [...(Object.hasOwn(value, key) ? [value[key]] : []), ...Object.values(value).flatMap((inner) => objectsWithKey(inner, key))];
}

function checkConfig(ctx) { // G10
  const problems = [];
  const text = readText(ctx.root, FILES.wrangler);
  let config = null;
  if (text === null) problems.push("wrangler.jsonc が無い");
  else { try { config = parseJsonc(text); } catch { problems.push("wrangler.jsonc を読めない"); } }
  if (config !== null && typeof config === "object") {
    const observability = objectsWithKey(config, "observability");
    if (config.observability?.enabled !== false || observability.some((o) => o?.enabled === true || o?.logs?.enabled === true || o?.traces?.enabled === true)) {
      problems.push("ログが止まっていない（observability.enabled が false でない）");
    }
    if (allKeys(config).includes("account_id")) problems.push("wrangler.jsonc に account_id がある");
    const required = Array.isArray(config.secrets?.required) ? config.secrets.required : [];
    const missing = REQUIRED_SECRETS.filter((name) => !required.includes(name));
    if (missing.length) problems.push(`secrets.required に無い設定：${missing.join("・")}`);
  } else if (config !== null) problems.push("wrangler.jsonc の形が違う");
  const operations = readText(ctx.root, FILES.operations);
  if (operations === null) problems.push("docs/operations.md が無い");
  else if (!lines(operations).some((line) => /^#{1,6}\s+.*デモだけ公開/.test(line))) problems.push("docs/operations.md に「デモだけ公開」の節が無い");
  return problems.length ? fail(problems.join("。")) : pass(`ログは止まり、account_id は無く、secrets.required に設定${REQUIRED_SECRETS.length}件がそろう。docs/operations.md に「デモだけ公開」の節がある`);
}

/** npm through the npm that started this tool when there is one, so PATH does not decide which npm runs. */
function runNpm(root, args) {
  const cli = process.env.npm_execpath;
  const [command, prefix] = cli && /npm-cli\.[cm]?js$/.test(cli) ? [process.execPath, [cli]] : ["npm", []];
  const result = spawnSync(command, [...prefix, "--prefix", root, ...args], {
    cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 15 * 60 * 1000, env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  return { status: result.error ? null : result.status, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

/** The test runner's own summary ("ℹ tests 281" from the spec reporter, "# tests 281" from TAP); the last one wins. */
function testCount(output, name) {
  const all = [...output.matchAll(new RegExp(`^\\s*(?:ℹ|#)\\s*${name}\\s+(\\d+)\\s*$`, "gm"))];
  return all.length ? Number(all[all.length - 1][1]) : null;
}

function checkE2eRecord(root) {
  const path = join(root, ...FILES.e2eRecord.split("/"));
  if (!isFile(path)) return { problem: "E2E の記録が無い（.agent-harness/evidence/verify/e2e-latest.json）" };
  const { ok, value } = readJson(path);
  if (!ok || !value || typeof value !== "object") return { problem: "E2E の記録を読めない（JSON でない）" };
  if (!Number.isInteger(value.passed) || value.passed < 1) return { problem: "E2E の記録の passed が1以上の整数でない" };
  if (value.failed !== 0) return { problem: `E2E の記録に失敗がある（failed が0でない）` };
  if (typeof value.fingerprint !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value.fingerprint)) return { problem: "E2E の記録の fingerprint の形が違う" };
  if (value.fingerprint !== e2eFingerprint(root).value) return { problem: "E2E の記録の指紋が現在の木と違う（E2E のあとに src・tests・public などが変わった）" };
  return { passed: value.passed };
}

function checkAutomatedTests(ctx) { // G11
  const problems = [];
  let units = null;
  if (!ctx.skipRun) {
    for (const [label, args] of [["単体", ["test"]], ["型検査", ["run", "typecheck"]], ["lint", ["run", "lint"]]]) {
      process.stderr.write(`G11：npm ${args.join(" ")} を実行しています…\n`);
      const run = runNpm(ctx.root, args);
      if (run.status !== 0) { problems.push(`${label}：失敗（${run.status === null ? "起動できないか時間切れ" : `終了コード ${run.status}`}）`); continue; }
      if (label !== "単体") continue;
      const [total, failed] = [testCount(run.output, "tests"), testCount(run.output, "fail")];
      if (total === null) problems.push("単体：件数を読めない");
      else if (total === 0) problems.push("単体：試験が0件");
      else if (failed) problems.push(`単体：失敗${failed}件`);
      else units = total;
    }
  }
  const ran = ctx.skipRun ? "単体・型検査・lint は実行していない（--skip-run）" : problems.length ? null : `単体 ${units}件・型検査・lint が成功`;
  const e2e = checkE2eRecord(ctx.root);
  if (e2e.problem) problems.push(e2e.problem);
  if (problems.length) return fail(`${problems.join("。")}${ran ? `（${ran}）` : ""}`);
  const e2eLine = `E2E の記録（${e2e.passed}件・失敗0）の指紋が現在の木と一致`;
  return ctx.skipRun ? skip(`${ran}。${e2eLine}`) : pass(`${ran}。${e2eLine}`);
}

function checkLiveKeys(ctx) { // L1
  const text = readText(join(ctx.root, ...FILES.runs.split("/")), "live-key-check.md");
  if (text === null) return fail("実キーの確認の記録（.agent-harness/runs/live-key-check.md）が無い");
  if (!text.trim()) return fail("live-key-check.md が空");
  const open = lines(text).map((line, index) => [line, index + 1]).filter(([line]) => line.includes("未確認")).map(([, n]) => `${n}行目`);
  return open.length ? fail(`live-key-check.md に「未確認」の行：${list(open, 5)}`) : pass("live-key-check.md があり、「未確認」の行が無い");
}

function checkLegal(ctx) { // L2
  const dir = join(ctx.root, ...FILES.runs.split("/"));
  const absent = ["legal-confirmation.md", "cloudflare-confirmation.md"].filter((name) => !(readText(dir, name) ?? "").trim());
  return absent.length ? fail(`法務の確認の記録が無い：${absent.join("・")}`) : pass("弁護士の確認（legal-confirmation.md）と Cloudflare への確認（cloudflare-confirmation.md）の記録がある");
}

function checkLiveRows(ctx) { // L3
  const table = readEvidenceTable(ctx);
  if (table.error) return fail(table.error);
  const rows = table.rows.filter((row) => row.time === BEFORE_LIVE);
  if (!rows.length) return fail("対応表に、ライブ取得を開く前の行が無い");
  const undone = rows.filter((row) => row.state !== "済").map((row) => row.id);
  if (undone.length) return fail(`ライブ取得を開く前で未の行：${undone.length}（${list(undone, 8)}）`);
  const gone = rows.flatMap((row) => missingFiles(ctx.root, row).missing.map((path) => `${row.id} ${shownPath(path)}`));
  return gone.length ? fail(`証拠のファイルが無い：${list(gone)}`) : pass(`ライブ取得を開く前の${rows.length}行がすべて済`);
}

const DEMO_ONLY = [
  ["G1", "運営者情報", checkOperator],
  ["G2", "草案・旧表記", checkWording],
  ["G3", "点検", checkHygieneRecord],
  ["G4", "LICENSE", checkLicense],
  ["G5", "第三者の表記", checkNotices],
  ["G6", "権利・規約の文書", checkRightsDoc],
  ["G7", "要件の対応表", checkEvidenceTable],
  ["G8", "画面の採点", checkUiReview],
  ["G9", "動的検査と独立レビュー", checkInspections],
  ["G10", "構成", checkConfig],
  ["G11", "自動試験", checkAutomatedTests],
];
const LIVE = [
  ["L1", "実キーの確認", checkLiveKeys],
  ["L2", "法務の確認", checkLegal],
  ["L3", "対応表（ライブ）", checkLiveRows],
];

const cell = (text) => text.replace(/\r?\n/g, " ").replace(/\|/g, "／");

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 16).map((line) => line.replace(/^\/\/ ?/, "")).join("\n"));
    return 0;
  }
  if (opts.e2eFingerprint) {
    const fp = e2eFingerprint(opts.root);
    console.log(`${fp.value}  （${fp.count}件）`);
    return 0;
  }
  const ctx = { root: opts.root, snapshot: opts.snapshot, skipRun: opts.skipRun, table: null };
  const checks = opts.mode === "live" ? [...DEMO_ONLY, ...LIVE] : DEMO_ONLY;
  const rows = [];
  for (const [id, title, check] of checks) {
    let result;
    try { result = await check(ctx); } catch (error) { result = fail(`判定の途中で止まった（${error instanceof Error ? error.name : "不明"}）`); }
    rows.push({ id, title, ...result });
  }
  const count = (status) => rows.filter((row) => row.status === status).length;
  const out = [
    `公開の関門：${opts.mode === "live" ? "実サイトの取得を開く条件（--mode live）" : "デモだけ公開の条件（--mode demo-only）"}`,
    `対象：${basename(opts.root)}／公開する木：${opts.snapshot ? basename(opts.snapshot) : "（指定なし）"}`,
    "",
    "| 条件 | 判定 | 理由 |",
    "|---|---|---|",
    ...rows.map((row) => `| ${row.id} ${row.title} | ${row.status} | ${cell(row.reason)} |`),
    "",
  ];
  if (count("FAIL")) out.push(`判定：NG（FAIL ${count("FAIL")}件・SKIP ${count("SKIP")}件・PASS ${count("PASS")}件）— 公開しない。FAIL の行を解消してから流し直す`);
  else if (count("SKIP")) out.push(`判定：保留（FAIL 0件・SKIP ${count("SKIP")}件）— 飛ばした条件があるので、公開の判定には使えない（--skip-run を外して流す）`);
  else out.push(`判定：OK（${rows.length}件すべて PASS）— 条件はそろった。公開・push・本番への反映は本人が行う`);
  console.log(out.join("\n"));
  return count("FAIL") ? 1 : 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof UsageError) console.error(`release-gate: ${error.message}`);
  else console.error(`release-gate: 途中で止まりました（${error instanceof Error ? error.name : "不明"}）`);
  process.exitCode = 2;
}
