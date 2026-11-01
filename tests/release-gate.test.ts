// Tests for scripts/release-gate.mjs, the release gate. Each case builds, in the OS temp folder, a throwaway repository
// and a published tree where every condition holds, breaks one condition, runs the real command with --root and
// --snapshot, and reads the table it printed: only the broken condition may fail. The fake repository runs tiny
// stand-ins for npm test, typecheck and lint, so the gate never runs this repository's suite from here. Every fake name
// and address is assembled at run time, so this file passes the pre-publication check itself. The real files read here
// (operator-info.ts, the E2E support file, the snapshot tool) are published too: the fixtures follow their format.
import test, { after, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const GATE = here("../scripts/release-gate.mjs");
const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
const SHARED = mkdtempSync(join(tmpdir(), "gate-shared-"));
after(() => rmSync(SHARED, { recursive: true, force: true }));

const REAL_OPERATOR_INFO = readFileSync(here("../src/lib/operator-info.ts"), "utf8");
const REAL_SUPPORT = readFileSync(here("e2e/support.ts"), "utf8");
const SNAPSHOT_SOURCE = readFileSync(here("../scripts/make-public-snapshot.mjs"), "utf8");
const OPERATOR_BLOCK = /export const OPERATOR_INFO: OperatorInfo = \{[\s\S]*?\n\};/;
const OLD_WORDS = [...(/export const OLD_WORDING = \[([\s\S]*?)\] as const;/.exec(REAL_SUPPORT)?.[1] ?? "").matchAll(/"([^"\\]+)"/g)].map((m) => m[1]);
/** The MIT terms exactly as the snapshot tool writes them, so a LICENSE it writes is what the gate accepts. */
const MIT_LINES = [...(/const MIT_TERMS = \[([\s\S]*?)\]\.join\("\\n"\);/.exec(SNAPSHOT_SOURCE)?.[1] ?? "").matchAll(/"((?:[^"\\]|\\.)*)"/g)]
  .map((m) => String(JSON.parse(`"${m[1]}"`)));

const MAIL_DOMAIN = ["gate-fixture-mail", "jp"].join(".");
const FAKE = {
  name: ["Quillmere", "Atelier"].join(" "),
  holder: ["Quillmere", "Works"].join(" "),
  contact: ["hello", MAIL_DOMAIN].join("@"),
  rights: ["rights-desk", MAIL_DOMAIN].join("@"),
  notMail: ["窓口は", "Quillmere", "の受付フォーム"].join(""),
  account: "0123456789abcdef".repeat(2),
};
const UNDECIDED = "<OPERATOR-NAME-UNDECIDED>";
const SECRETS = [
  "PAGECRATE_PUBLIC_ORIGIN", "PAGECRATE_DAILY_RENDER_CAP", "PAGECRATE_PAUSED", "PAGECRATE_BLOCKED_HOSTS",
  "PAGECRATE_TICKET_SECRET", "PAGECRATE_TURNSTILE_SECRET", "PAGECRATE_TURNSTILE_SITEKEY",
];
const SPEC = ".kiro/specs/pagecrate-public-no-login";
const RUNS = ".agent-harness/runs";
const HYGIENE = ".agent-harness/evidence/hygiene";
const E2E_RECORD = ".agent-harness/evidence/verify/e2e-latest.json";

// --- the fake repository and the fake published tree ---------------------------------------------------------------
type Tree = Record<string, string | null>;
type Json = Record<string, unknown>;
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function operatorInfo(values: { name: string | null; contact: string | null; rightsContact: string | null }): string {
  if (!OPERATOR_BLOCK.test(REAL_OPERATOR_INFO)) throw new Error("src/lib/operator-info.ts no longer declares OPERATOR_INFO as these fixtures expect");
  const literal = (value: string | null) => (value === null ? "null" : JSON.stringify(value));
  return REAL_OPERATOR_INFO.replace(OPERATOR_BLOCK, `export const OPERATOR_INFO: OperatorInfo = {\n  name: ${literal(values.name)},\n  contact: ${literal(values.contact)},\n  rightsContact: ${literal(values.rightsContact)},\n};`);
}
const DECIDED = { name: FAKE.name, contact: FAKE.contact, rightsContact: FAKE.rights };
const mitLicense = (holder: string) => `MIT License\n\nCopyright (c) 2026 ${holder}\n\n${MIT_LINES.join("\n")}\n`;

const LOCK = {
  name: "fake-app", version: "0.0.0", lockfileVersion: 3, requires: true,
  packages: {
    "": { name: "fake-app", version: "0.0.0" },
    "node_modules/alpha": { version: "1.0.0", license: "MIT" },
    "node_modules/@scope/beta": { version: "2.0.0", license: "Apache-2.0" },
    "node_modules/alpha/node_modules/gamma": { version: "0.1.0", license: "ISC" },
    "node_modules/string-width-cjs": { name: "string-width", version: "4.2.3", license: "MIT" },
    "node_modules/devonly": { version: "9.0.0", license: "MIT", dev: true },
    "node_modules/devopt": { version: "9.1.0", license: "MIT", devOptional: true },
  },
};
const noticeRow = (name: string, version: string) => `| \`${name}\` | ${version} | MIT | Copyright (c) 2020 Fake | — |`;
const NOTICE_ROWS = { alpha: noticeRow("alpha", "1.0.0"), beta: noticeRow("@scope/beta", "2.0.0"), gamma: noticeRow("gamma", "0.1.0"), width: noticeRow("string-width", "4.2.3") };
const notices = (rows: string[]) => ["# 第三者のソフトウェアと素材の表記", "", "## 本文ごとのパッケージ", "", "| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |", "|---|---|---|---|---|", ...rows, ""].join("\n");

const REQUIREMENTS = [
  "# Requirements Document", "", "## Requirements", "",
  "### Requirement 1: 見本の要件", "**Objective:** 見本", "#### Acceptance Criteria", "1. When 見本, the App shall 見本", "2. The App shall 見本", "",
  "### Requirement 2: 見本の要件", "#### Acceptance Criteria", "1. The App shall 見本", "2. The App shall 見本", "3. The App shall 見本", "",
  "### Requirement 3: 見本の要件", "#### Acceptance Criteria", "1. The App shall 見本", "",
].join("\n");
const STEP = "本番とは別名の Worker に配置して、回数制限と実キーを確かめる";
const CHECKLIST = ["# 運営者の作業", "", "## 2. Cloudflare の準備", `- **${STEP}**（見本）`, "- Turnstile のウィジェットを作る", ""].join("\n");
interface TableRow { id: string; time: string; kind: string; evidence: string; state: string }
const BEFORE_DEMO_EVIDENCE = "tests/unit.test.ts「fake case」 ／ docs/guide-root.md「案内」（補足）";
const LIVE_EVIDENCE = `${SPEC}/release-checklist.md「${STEP}」 ／ tests/unit.test.ts「fake case」`;
const tableRows = (live: boolean): TableRow[] => [
  { id: "1.1", time: "公開前", kind: "自動試験", evidence: BEFORE_DEMO_EVIDENCE, state: "済" },
  { id: "1.2", time: "公開前", kind: "記録", evidence: `${RUNS}/impl-fixture.md「記録」`, state: "済" },
  { id: "2.1", time: "公開前", kind: "運営者の手順", evidence: `${SPEC}/release-checklist.md「Turnstile のウィジェットを作る」`, state: "済" },
  { id: "2.2", time: "ライブ取得を開く前", kind: "運営者の手順", evidence: LIVE_EVIDENCE, state: live ? "済" : "未" },
  { id: "2.3", time: "ライブ取得を開く前", kind: "運営者の手順", evidence: `Turnstile のウィジェットを作る（言葉だけ）`, state: live ? "済" : "未" },
  { id: "3.1", time: "公開後", kind: "運営者の手順", evidence: "X への投稿は本人", state: "未" },
  { id: "共通-1", time: "公開前", kind: "自動試験", evidence: "tests/unit.test.ts「share」", state: "済" },
];
const table = (rows: TableRow[], extra: string[] = []) => [
  "# 要件ごとの証拠の対応表", "", "説明の文。", "",
  "| 要件 | 時期 | 種類 | 証拠または手順名 | 状態 |", "|---|---|---|---|---|",
  ...rows.map((row) => `| ${row.id} | ${row.time} | ${row.kind} | ${row.evidence} | ${row.state} |`), ...extra, "", "## 集計", "- 見本", "",
].join("\n");
const withRow = (live: boolean, id: string, change: Partial<TableRow>) => table(tableRows(live).map((row) => (row.id === id ? { ...row, ...change } : row)));

const WRANGLER = `{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "fake-app",
  // Names only.
  "secrets": { "required": [${SECRETS.map((name) => `"${name}"`).join(", ")}] },
  /* Logs off. */
  "observability": { "enabled": false },
}
`;
const RIGHTS = [
  "# 権利・規約の確認", "", "調べていないことを「問題なし」とは書かず、「未確認」に置く（見本）。", "",
  "## 調べた範囲（見本）", "", "### 規約", "", "| 事実 | 出典 |", "|---|---|", "| 見本の事実 | 見本の出典 |", "",
  "## 未確認（調べていない）", "", "- 見本の未確認", "",
  "## 専門家（弁護士）の確認が要る点", "", "1. 見本の論点", "",
].join("\n");
const TOOLS = {
  "tools/test.mjs": "console.log('✔ fake case');\nconsole.log('ℹ tests 2');\nconsole.log('ℹ pass 2');\nconsole.log('ℹ fail 0');\n",
  "tools/typecheck.mjs": "process.exitCode = 0;\n",
  "tools/lint.mjs": "process.exitCode = 0;\n",
};
const LIVE_RECORDS: Tree = {
  [`${RUNS}/live-key-check.md`]: "# 実キーの確認\n- 回数制限：確認した\n- 内部アドレス：確認した\n",
  [`${RUNS}/legal-confirmation.md`]: "# 弁護士の確認\n- 見本の回答\n",
  [`${RUNS}/cloudflare-confirmation.md`]: "# Cloudflare への確認\n- 2.2.1(j)：見本の回答\n",
};

function rootFiles(live: boolean): Tree {
  return {
    "package.json": json({ name: "fake-app", version: "0.0.0", private: true, scripts: { test: "node tools/test.mjs", typecheck: "node tools/typecheck.mjs", lint: "node tools/lint.mjs" } }),
    ...TOOLS,
    "src/lib/operator-info.ts": operatorInfo(DECIDED),
    "src/app/page.tsx": "export default function Page() { return null; }\n",
    "tests/e2e/support.ts": REAL_SUPPORT,
    "tests/unit.test.ts": "// fake case\n",
    "public/og.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\"/>\n",
    "next.config.ts": "export default {};\n",
    "wrangler.jsonc": WRANGLER,
    "docs/rights-and-terms.md": RIGHTS,
    "docs/operations.md": "# 運営の手順\n\n## デモだけ公開する：見本\n\n本文。\n",
    "docs/guide-root.md": "# 案内\n",
    [`${SPEC}/requirements.md`]: REQUIREMENTS,
    [`${SPEC}/release-checklist.md`]: CHECKLIST,
    [`${SPEC}/evidence-table.md`]: table(tableRows(live)),
    [`${RUNS}/review-ui-r1.md`]: "# UI採点 r1\n\n**合計 15 / 20点　判定：不合格**（基準は16点以上かつ0点なし）　**0点の項目：なし**\n",
    [`${RUNS}/review-ui-r2.md`]: "# UI採点 第2周：17/20で合格（0点の項目なし）\n\n- **合計 17/20・判定：合格**。0点の項目：なし\n",
    [`${RUNS}/dynamic-inspection.md`]: "# 動的検査の記録\n\n| 指摘 | 重さ | 対処 |\n|---|---|---|\n| 見本 | 中 | 受け入れ（設計判断） |\n",
    [`${RUNS}/review-final.md`]: "# 最終の独立レビュー\n\n判定：MINORのみ\n\n- 所見1：見本（対処：直した）\n",
    [`${RUNS}/impl-fixture.md`]: "# 記録\n\n見本の記録。\n",
    ...(live ? LIVE_RECORDS : {}),
  };
}
function snapshotFiles(): Tree {
  return {
    "README.md": "# Fake app\n\n説明の文。\n",
    "src/lib/operator-info.ts": operatorInfo(DECIDED),
    "src/app/page.tsx": "export default function Page() { return null; }\n",
    "docs/guide.md": "# 案内\n",
    "LICENSE": mitLicense(FAKE.holder),
    "THIRD_PARTY_NOTICES.md": notices(Object.values(NOTICE_ROWS)),
    "package-lock.json": json(LOCK),
  };
}

function writeTree(root: string, files: Tree) {
  for (const [rel, body] of Object.entries(files)) {
    if (body === null) continue;
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
}
function listFiles(root: string, dir = ""): string[] {
  const start = dir ? join(root, dir) : root;
  if (!existsSync(start)) return [];
  const found: string[] = [];
  const walk = (rel: string) => {
    for (const entry of readdirSync(rel ? join(root, rel) : root, { withFileTypes: true })) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { if (entry.name !== ".git") walk(path); } else found.push(path);
    }
  };
  walk(dir);
  return found;
}
/** The documented calculation, done here independently of both tools. */
function fingerprint(root: string, rels: string[]): string {
  const sha = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
  const lines = rels.filter((rel) => existsSync(join(root, rel))).map((rel) => {
    const abs = join(root, rel);
    return [lstatSync(abs).isSymbolicLink() ? sha(`symlink:${readlinkSync(abs)}`) : sha(readFileSync(abs)), rel];
  }).sort((a, b) => Buffer.compare(Buffer.from(a[1]), Buffer.from(b[1])));
  return `sha256:${sha(lines.map(([hash, rel]) => `${hash}  ${rel}\n`).join(""))}`;
}
const e2eFingerprint = (root: string) =>
  fingerprint(root, [...["src", "tests", "public"].flatMap((dir) => listFiles(root, dir)).filter((rel) => !rel.endsWith("/.DS_Store")), "package.json", "wrangler.jsonc", "next.config.ts"]);

const hygieneRecord = (ranAt: string, overrides: Json = {}): Json => ({
  tool: "scripts/hygiene.mjs", ranAt, profile: "tree", target: { mode: "tree", name: "public-tree", files: 7, deletedFromTree: 0, commits: 0, skippedDirs: [] },
  verdict: "pass", findings: [], allowed: [], notRun: [], ...overrides,
});
const FAILED_FINDING = { severity: "fail", kind: "email", kindLabel: "メールアドレス", label: "メールアドレス", file: "docs/guide.md", line: 1 };
const LATEST = "hygiene-tree-20261101-120000.json";

interface Fixture { root: string; snapshot: string }
interface Options {
  root?: Tree; // overrides on the repository (null leaves a file out)
  snapshot?: Tree; // overrides on the published tree
  live?: boolean; // done "before live" rows and the live records
  drop?: string[]; // leave out everything under these prefixes of the repository, records included
  hygiene?: Json | null; // merged into the latest public check record; null writes no check record at all
  link?: boolean; // the snapshot record tying the latest check to the tree (default: written)
  extraRecords?: Record<string, Json | string>; // more files in the check record folder
  e2e?: Json | string | null; // merged into the E2E record, or its raw text; null writes none
  after?: (fixture: Fixture) => void; // runs once the records are written
}
function makeFixture(t: TestContext, options: Options = {}): Fixture {
  const base = mkdtempSync(join(tmpdir(), "gate-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const fixture = { root: join(base, "repo"), snapshot: join(base, "public-tree") };
  const drop = options.drop ?? [];
  const kept = Object.fromEntries(Object.entries({ ...rootFiles(options.live === true), ...options.root }).filter(([rel]) => !drop.some((prefix) => rel.startsWith(prefix))));
  writeTree(fixture.root, kept);
  writeTree(fixture.snapshot, { ...snapshotFiles(), ...options.snapshot });
  const records = !drop.some((prefix) => HYGIENE.startsWith(prefix));
  const dir = join(fixture.root, HYGIENE);
  if (records && options.hygiene !== null) {
    mkdirSync(dir, { recursive: true });
    // An older failed check and a private-pr record: neither is the latest public check.
    writeFileSync(join(dir, "hygiene-tree-20261101-090000.json"), json(hygieneRecord("2026-11-01T00:00:00.000Z", { verdict: "fail", findings: [FAILED_FINDING] })));
    writeFileSync(join(dir, "hygiene-private-pr-20261101-130000.json"), json(hygieneRecord("2026-11-01T04:00:00.000Z", { profile: "private-pr", verdict: "fail", findings: [FAILED_FINDING] })));
    writeFileSync(join(dir, LATEST), json(hygieneRecord("2026-11-01T03:00:00.000Z", options.hygiene ?? {})));
    if (options.link !== false) {
      writeFileSync(join(dir, "snapshot-20261101-120000.json"), json({
        tool: "scripts/make-public-snapshot.mjs", ranAt: "2026-11-01T03:00:00.100Z", out: "public-tree", fingerprint: fingerprint(fixture.snapshot, listFiles(fixture.snapshot)),
        files: listFiles(fixture.snapshot).length, hygiene: { exit: 0, record: `${HYGIENE}/${LATEST}` }, verdict: "ready-for-review", problems: [],
      }));
    }
  }
  for (const [name, body] of Object.entries(options.extraRecords ?? {})) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), typeof body === "string" ? body : json(body));
  }
  if (records && options.e2e !== null) {
    mkdirSync(dirname(join(fixture.root, E2E_RECORD)), { recursive: true });
    const record = typeof options.e2e === "string" ? options.e2e : json({ passed: 81, failed: 0, fingerprint: e2eFingerprint(fixture.root), ...options.e2e });
    writeFileSync(join(fixture.root, E2E_RECORD), record);
  }
  options.after?.(fixture);
  return fixture;
}

// --- running the gate -----------------------------------------------------------------------------------------------
interface GateRun { status: number | null; stdout: string; stderr: string }
interface Row { id: string; status: string; reason: string }
function runGate(args: string[]): Promise<GateRun> {
  return new Promise((done) => {
    const child = spawn(process.execPath, ["--import", TSX, GATE, ...args], { cwd: SHARED, env: process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.on("close", (status) => done({ status, stdout, stderr }));
  });
}
/** Every case but the ones about G11 itself skips the stand-in commands: G11 then shows SKIP, never FAIL. */
const gate = (fixture: Fixture, extra: string[] = ["--skip-run"]) => runGate(["--root", fixture.root, "--snapshot", fixture.snapshot, ...extra]);
const rows = (run: GateRun): Row[] => run.stdout.split("\n").flatMap((line) => {
  const match = /^\| ((?:G|L)\d+) [^|]+ \| (PASS|FAIL|SKIP) \| (.*) \|$/.exec(line);
  return match ? [{ id: match[1], status: match[2], reason: match[3] }] : [];
});
const failing = (run: GateRun) => rows(run).filter((row) => row.status === "FAIL").map((row) => row.id);
const show = (run: GateRun) => `exit ${run.status}\n${run.stdout}\n${run.stderr}`;
const G_IDS = ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10", "G11"];

/** Only `ids` fail (exit 1), every other row passes or is the skipped G11, and each failing reason matches. */
function expectOnly(run: GateRun, ids: string[], reason: RegExp) {
  assert.deepEqual(failing(run), ids, show(run));
  assert.equal(run.status, 1, show(run));
  for (const row of rows(run)) {
    if (ids.includes(row.id)) assert.match(row.reason, reason, show(run));
    else assert.ok(row.status === "PASS" || (row.id === "G11" && row.status === "SKIP"), show(run));
  }
}
/** Several broken fixtures of one condition, run side by side. */
async function expectEach(t: TestContext, id: string, cases: [Options, RegExp][], extra?: string[]) {
  const runs = await Promise.all(cases.map(([options]) => gate(makeFixture(t, options), extra)));
  runs.forEach((run, index) => expectOnly(run, [id], cases[index][1]));
}

// --- cases ----------------------------------------------------------------------------------------------------------
test("the fixtures follow the real formats: OPERATOR_INFO, OLD_WORDING and the snapshot tool's MIT terms", () => {
  assert.match(REAL_OPERATOR_INFO, OPERATOR_BLOCK);
  assert.match(REAL_OPERATOR_INFO, /^export const UNDECIDED_LABEL = ".*公開前に確定して掲載します.*";$/m, "the notice the gate allows only in its definition");
  assert.ok(OLD_WORDS.length >= 5, "OLD_WORDING is read from tests/e2e/support.ts");
  assert.equal(MIT_LINES[0], "Permission is hereby granted, free of charge, to any person obtaining a copy");
  assert.equal(MIT_LINES[MIT_LINES.length - 1], "SOFTWARE.");
});

test("every condition holds: demo-only passes all eleven, running the three commands; live passes fourteen", async (t) => {
  const [demo, live] = await Promise.all([gate(makeFixture(t), []), gate(makeFixture(t, { live: true }), ["--mode", "live"])]);
  assert.equal(demo.status, 0, show(demo));
  assert.deepEqual(rows(demo).map((row) => `${row.id} ${row.status}`), G_IDS.map((id) => `${id} PASS`), show(demo));
  assert.match(demo.stdout, /単体 2件・型検査・lint が成功。E2E の記録（81件・失敗0）の指紋が現在の木と一致/);
  assert.match(demo.stdout, /^判定：OK（11件すべて PASS）/m);
  assert.match(demo.stdout, /デモだけ公開の条件（--mode demo-only）/);
  assert.equal(live.status, 0, show(live));
  assert.deepEqual(rows(live).map((row) => `${row.id} ${row.status}`), [...G_IDS, "L1", "L2", "L3"].map((id) => `${id} PASS`), show(live));
  assert.match(rows(live).find((row) => row.id === "G7")?.reason ?? "", /要件6＋共通1の行がそろい、公開前の4行は済で証拠が実在、ライブ取得を開く前の2行は手順名/);
});

test("G1: an undecided, blank, non-mail, sample or missing operator entry fails only G1", async (t) => {
  await expectEach(t, "G1", [
    [{ root: { "src/lib/operator-info.ts": operatorInfo({ ...DECIDED, name: null }) } }, /^未確定：運営者の名称（/],
    [{ root: { "src/lib/operator-info.ts": operatorInfo({ ...DECIDED, contact: "   " }) } }, /^未確定：問い合わせ先（/],
    [{ root: { "src/lib/operator-info.ts": operatorInfo({ name: null, contact: null, rightsContact: null }) } }, /未確定：運営者の名称・問い合わせ先・権利者の申し立て窓口/],
    [{ root: { "src/lib/operator-info.ts": operatorInfo({ ...DECIDED, contact: FAKE.notMail }) } }, /メールの形でない：問い合わせ先/],
    [{ root: { "src/lib/operator-info.ts": operatorInfo({ ...DECIDED, rightsContact: ["desk", "example.com"].join("@") }) } }, /見本・未確定の印・返信できない宛先：権利者の申し立て窓口/],
    [{ root: { "src/lib/operator-info.ts": operatorInfo({ ...DECIDED, name: UNDECIDED }) } }, /見本・未確定の印・返信できない宛先：運営者の名称/],
    [{ root: { "src/lib/operator-info.ts": null } }, /src\/lib\/operator-info\.ts が無い/],
  ]);
});

test("G2: old wording, 草案 or the undecided notice in the published src, docs or README fails only G2", async (t) => {
  const brokenList = REAL_SUPPORT.replace(/export const OLD_WORDING = \[/, "export const OLD_WORDING = [\n  ...EXTRA,");
  await expectEach(t, "G2", [
    [{ snapshot: { "docs/guide.md": "# 案内\n\nこの文書は草案です。\n" } }, /1か所：docs\/guide\.md:3「草案」/],
    [{ snapshot: { "README.md": `# Fake app\n\n${OLD_WORDS[0]}の説明\n` } }, new RegExp(`README\\.md:3「${OLD_WORDS[0]}」`)],
    [{ snapshot: { "src/app/page.tsx": "export const NOTE = \"未確定（公開前に確定して掲載します）\";\n" } }, /src\/app\/page\.tsx:1「公開前に確定して掲載します」/],
    [{ snapshot: { "src/lib/operator-info.ts": `${operatorInfo(DECIDED)}// 公開前に確定して掲載します\n` } }, /1か所：src\/lib\/operator-info\.ts:\d+「公開前に確定して掲載します」/],
    [{ snapshot: { "README.md": null } }, /公開する木に README\.md が無い/],
    [{ root: { "tests/e2e/support.ts": null } }, /旧表記の一覧（tests\/e2e\/support\.ts）が無い/],
    [{ root: { "tests/e2e/support.ts": brokenList } }, /二重引用符の文字列でない要素/],
  ]);
});

test("G3: a failed, incomplete or unlinked latest check, a newer failed one, or a changed tree fails only G3", async (t) => {
  await expectEach(t, "G3", [
    [{ hygiene: { verdict: "fail", findings: [FAILED_FINDING] } }, new RegExp(`最新の点検の記録（${LATEST}）が合格でない（失敗1・未実施0）`)],
    [{ hygiene: { notRun: ["gitleaks（作業の木）"] } }, /合格でない（失敗0・未実施1）/],
    [{ extraRecords: { "hygiene-tree-20261101-140000.json": hygieneRecord("2026-11-01T05:00:00.000Z", { verdict: "fail", findings: [FAILED_FINDING] }) } }, /hygiene-tree-20261101-140000\.json）が合格でない/],
    [{ after: (f) => appendFileSync(join(f.snapshot, "README.md"), "\n点検のあとの追記。\n") }, /公開する木の指紋が、最新の点検の記録/],
    [{ link: false }, /結び付く木の指紋が無い/],
    [{ hygiene: null, extraRecords: { "hygiene-private-pr-20261101-150000.json": hygieneRecord("2026-11-01T06:00:00.000Z", { profile: "private-pr" }) } }, /公開用の点検（profile が public か tree）の記録が無い/],
    [{ extraRecords: { "hygiene-tree-20261101-160000.json": "{ not json" } }, /読めない点検の記録がある/],
  ]);
});

test("G4: a missing, undecided, altered or non-MIT LICENSE fails only G4", async (t) => {
  await expectEach(t, "G4", [
    [{ snapshot: { LICENSE: null } }, /公開する木に LICENSE が無い/],
    [{ snapshot: { LICENSE: mitLicense(UNDECIDED) } }, /著作権者が未確定（未確定の印がある）/],
    [{ snapshot: { LICENSE: mitLicense(FAKE.holder).replace("free of charge, ", "") } }, /本文が MIT の全文と違う/],
    [{ snapshot: { LICENSE: "Apache License\nVersion 2.0, January 2004\n" } }, /「MIT License」と著作権の行で始まっていない/],
    [{ snapshot: { LICENSE: mitLicense("[fullname]") } }, /^LICENSE の著作権者が未確定$/],
  ]);
});

test("G5: notices without a production package, with another version, or a missing file fails only G5", async (t) => {
  await expectEach(t, "G5", [
    [{ snapshot: { "THIRD_PARTY_NOTICES.md": notices([NOTICE_ROWS.alpha, NOTICE_ROWS.beta, NOTICE_ROWS.width]) } }, /THIRD_PARTY_NOTICES\.md に無い：1件（gamma@0\.1\.0）/],
    [{ snapshot: { "THIRD_PARTY_NOTICES.md": notices([noticeRow("alpha", "1.0.1"), NOTICE_ROWS.beta, NOTICE_ROWS.gamma, NOTICE_ROWS.width]) } }, /無い：1件（alpha@1\.0\.0）/],
    [{ snapshot: { "THIRD_PARTY_NOTICES.md": notices([NOTICE_ROWS.alpha, NOTICE_ROWS.beta, NOTICE_ROWS.gamma, noticeRow("string-width-cjs", "4.2.3")]) } }, /string-width@4\.2\.3/],
    [{ snapshot: { "THIRD_PARTY_NOTICES.md": null } }, /THIRD_PARTY_NOTICES\.md が無い/],
    [{ snapshot: { "package-lock.json": null } }, /package-lock\.json が無い/],
  ]);
});

test("G6: a missing or merged heading, an empty section, or 問題なし next to nothing unconfirmed fails only G6", async (t) => {
  await expectEach(t, "G6", [
    [{ root: { "docs/rights-and-terms.md": RIGHTS.replace("## 未確認（調べていない）", "## そのほか") } }, /見出しが無い：未確認/],
    [{ root: { "docs/rights-and-terms.md": RIGHTS.replace("## 調べた範囲（見本）", "## 調べた範囲と未確認").replace("## 未確認（調べていない）", "## そのほか") } }, /見出しが無い：未確認/],
    [{ root: { "docs/rights-and-terms.md": RIGHTS.replace("1. 見本の論点", "") } }, /中身が無い：専門家（弁護士）の確認が要る点/],
    [{ root: { "docs/rights-and-terms.md": `${RIGHTS}\nCookie の扱いは問題ありません。\n` } }, /断定が、「未確認」「確認が要る」の無い行にある：21行目/],
    [{ root: { "docs/rights-and-terms.md": null } }, /docs\/rights-and-terms\.md が無い/],
  ]);
});

test("G7: the evidence table is read as specified — blanks, unknown values, missing rows, undone or unbacked rows fail only G7", async (t) => {
  const table7 = (content: string) => ({ root: { [`${SPEC}/evidence-table.md`]: content } });
  await expectEach(t, "G7", [
    [{ root: { [`${SPEC}/evidence-table.md`]: null } }, /対応表が無い/],
    [table7(withRow(false, "1.1", { state: "未" })), /公開前で未の行：1（1\.1）/],
    [table7(withRow(false, "1.2", { evidence: `${RUNS}/no-such-record.md「記録」` })), /証拠のファイルが無い：1\.2 \.agent-harness\/runs\/no-such-record\.md/],
    [table7(withRow(false, "共通-1", { evidence: "試験で確かめた（ファイルの名前なし）" })), /証拠のファイルが書かれていない：共通-1/],
    [table7(table(tableRows(false), ["| 3.2 | 公開前 |  | tests/unit.test.ts「x」 | 済 |"])), /行目：空欄（種類）/],
    [table7(withRow(false, "2.2", { time: "公開まえ" })), /行目：知らない値（時期）/],
    [table7(withRow(false, "2.3", { evidence: "release-checklist.md に無い手順" })), /手順名が release-checklist\.md に無い：2\.3/],
    [table7(table(tableRows(false).filter((row) => row.id !== "2.1"))), /表に無い要件：2\.1/],
    [table7(table(tableRows(false)).replace("| 要件 | 時期 | 種類 | 証拠または手順名 | 状態 |\n", "")), /見出し行.*が無い/],
    [table7(table(tableRows(false), ["| 3.3 | 公開前 | 記録 | tests/unit.test.ts「x」 |"])), /行目：列が4つ/],
  ]);
});

test("G8: the highest-numbered UI review decides, by number not by name; a failing one fails only G8", async (t) => {
  const review = (n: number, text: string) => ({ root: { [`${RUNS}/review-ui-r${n}.md`]: text } });
  await expectEach(t, "G8", [
    [review(3, "# UI採点 第3周\n\n**合計 14/20・判定：不合格**（0点の項目なし）\n"), /review-ui-r3\.md（先頭10行）：不合格と書かれている/],
    [review(3, "# UI採点 第3周：15/20で合格（0点の項目なし）\n"), /合計 15\/20 で16点に届かない/],
    [review(3, "# UI採点 第3周：18/20で合格\n\n0点の項目：1件（配色）\n"), /0点の項目が無いと書かれていない/],
    [{ root: { [`${RUNS}/review-ui-r9.md`]: "# UI採点 第9周：18/20で合格（0点の項目なし）\n", [`${RUNS}/review-ui-r10.md`]: "# UI採点 第10周：13/20・不合格\n" } }, /review-ui-r10\.md/],
    [{ drop: [`${RUNS}/review-ui-`] }, /UI採点の記録.*が無い/],
  ]);
  const ordered = await gate(makeFixture(t, { root: { [`${RUNS}/review-ui-r9.md`]: "# UI採点 第9周：13/20・不合格\n", [`${RUNS}/review-ui-r10.md`]: "# UI採点 第10周：18/20で合格（0点の項目なし）\n" } }));
  assert.deepEqual(failing(ordered), [], show(ordered));
  assert.match(rows(ordered).find((row) => row.id === "G8")?.reason ?? "", /review-ui-r10\.md：合計 18\/20・合格/);
});

test("G9: a missing record or a line, list item or table cell starting with 未対処 fails only G9", async (t) => {
  await expectEach(t, "G9", [
    [{ root: { [`${RUNS}/review-final.md`]: null } }, /review-final\.md が無い/],
    [{ root: { [`${RUNS}/dynamic-inspection.md`]: null } }, /dynamic-inspection\.md が無い/],
    [{ root: { [`${RUNS}/review-final.md`]: "# 最終の独立レビュー\n\n判定：MINORのみ\n\n未対処：見本の所見\n" } }, /review-final\.md に未対処の行：5行目/],
    [{ root: { [`${RUNS}/review-final.md`]: "# 最終の独立レビュー\n\n判定：MINORのみ\n\n- **未対処** 見本\n" } }, /未対処の行：5行目/],
    [{ root: { [`${RUNS}/dynamic-inspection.md`]: "# 動的検査\n\n| 指摘 | 重さ | 対処 |\n|---|---|---|\n| 見本 | 中 | 未対処 |\n" } }, /dynamic-inspection\.md に未対処の行：5行目/],
  ]);
});

// Independent review before release, R2: the gate used to look only for the word 未対処, so a verdict of BLOCKER or MAJOR
// passed as long as nobody wrote that word. Now the verdict line is read, and each BLOCKER or MAJOR finding needs a
// 対処： line of its own, in its own section.
test("G9: the final review's verdict is read — no verdict line, a verdict that contradicts the findings, or a BLOCKER or MAJOR finding without its own 対処： line fails only G9", async (t) => {
  const review = (verdict: string, body: string) => ({ root: { [`${RUNS}/review-final.md`]: `# 最終の独立レビュー\n\n${verdict}\n\n${body}` } });
  await expectEach(t, "G9", [
    [{ root: { [`${RUNS}/review-final.md`]: "# 最終の独立レビュー\n\n- 所見1：見本（対処：直した）\n" } }, /判定の行.*が読めない/],
    [review("判定：MAJOR あり（BLOCKERなし）", "### R1 MAJOR：見本\n- 場所：x\n"), /R1（MAJOR）に「対処：」の行が無い/],
    [review("判定：BLOCKER あり", "### R1 BLOCKER：見本\n- 対処：\n"), /R1（BLOCKER）に「対処：」の行が無い/],
    [review("判定：MAJOR あり", "### R1 MAJOR：見本\n- 対処：直した\n\n### R2 MAJOR：別の見本\n- 場所：y\n"), /R2（MAJOR）に「対処：」の行が無い/],
    [review("判定：MAJOR あり", "### R1 MAJOR：見本\n- 場所：x\n\n## 対処のまとめ\n- 対処：直した\n"), /R1（MAJOR）に「対処：」の行が無い/],
    [review("判定：MINORのみ", "### R1 MAJOR：見本\n- 対処：直した\n"), /判定は MINORのみ だが、BLOCKER・MAJOR の所見（R1）がある/],
    [review("判定：MAJOR あり", "### R1 MINOR：見本\n- 場所：x\n"), /判定は MAJORあり だが、その重さの所見の見出し/],
  ]);
  // Handled findings pass, whatever the weight of the verdict at the time of the review; a MINOR finding needs no line.
  const handled = review("判定：MAJOR あり（BLOCKERなし）", "### R1 MAJOR：見本\n- 場所：x\n- 対処：直した（試験つき）\n\n### R2 MINOR：見本\n- 場所：y\n");
  const run = await gate(makeFixture(t, handled));
  assert.equal(rows(run).find((row) => row.id === "G9")?.status, "PASS", show(run));
});

test("G10: logs on, an account_id, a missing setting or no demo-only section fails only G10", async (t) => {
  await expectEach(t, "G10", [
    [{ root: { "wrangler.jsonc": WRANGLER.replace("\"enabled\": false", "\"enabled\": true") } }, /ログが止まっていない/],
    [{ root: { "wrangler.jsonc": WRANGLER.replace("\"observability\": { \"enabled\": false },", "\"observability\": { \"enabled\": false },\n  \"env\": { \"production\": { \"observability\": { \"enabled\": false, \"logs\": { \"enabled\": true } } } },") } }, /ログが止まっていない/],
    [{ root: { "wrangler.jsonc": WRANGLER.replace("\"name\": \"fake-app\",", `"name": "fake-app",\n  "account_id": "${FAKE.account}",`) } }, /account_id がある/],
    [{ root: { "wrangler.jsonc": WRANGLER.replace("\"PAGECRATE_PAUSED\", ", "") } }, /secrets\.required に無い設定：PAGECRATE_PAUSED/],
    [{ root: { "wrangler.jsonc": "{ not jsonc" } }, /wrangler\.jsonc を読めない/],
    [{ root: { "docs/operations.md": "# 運営の手順\n\n## 止める\n\nデモだけ公開する場合は本文に書く。\n" } }, /「デモだけ公開」の節が無い/],
  ]);
});

test("G11: a failing, empty or unreadable command run fails only G11", async (t) => {
  await expectEach(t, "G11", [
    [{ root: { "tools/test.mjs": "console.log('✖ fake case');\nprocess.exitCode = 1;\n" } }, /単体：失敗（終了コード 1）/],
    [{ root: { "tools/test.mjs": "console.log('ℹ tests 0');\nconsole.log('ℹ pass 0');\nconsole.log('ℹ fail 0');\n" } }, /単体：試験が0件/],
    [{ root: { "tools/test.mjs": "console.log('all good');\n" } }, /単体：件数を読めない/],
    [{ root: { "tools/typecheck.mjs": "process.exitCode = 2;\n" } }, /型検査：失敗（終了コード 2）/],
    [{ root: { "tools/lint.mjs": "process.exitCode = 1;\n" } }, /lint：失敗（終了コード 1）/],
  ], []);
});

test("G11: a missing, failed, empty, unreadable or outdated E2E record fails only G11, even with --skip-run", async (t) => {
  await expectEach(t, "G11", [
    [{ e2e: null }, /E2E の記録が無い/],
    [{ e2e: { failed: 1 } }, /E2E の記録に失敗がある/],
    [{ e2e: { passed: 0 } }, /passed が1以上の整数でない/],
    [{ e2e: "{ not json" }, /E2E の記録を読めない/],
    [{ e2e: { fingerprint: "sha256:abc" } }, /fingerprint の形が違う/],
    [{ after: (f) => appendFileSync(join(f.root, "src/app/page.tsx"), "// changed after the E2E run\n") }, /E2E の記録の指紋が現在の木と違う/],
  ]);
  const skipped = await gate(makeFixture(t));
  assert.equal(skipped.status, 0, show(skipped));
  assert.deepEqual(rows(skipped).find((row) => row.id === "G11"), { id: "G11", status: "SKIP", reason: "単体・型検査・lint は実行していない（--skip-run）。E2E の記録（81件・失敗0）の指紋が現在の木と一致" });
  assert.match(skipped.stdout, /^判定：保留（FAIL 0件・SKIP 1件）/m);
});

test("live: today's state fails L1–L3 only; each live record or undone row fails its own condition", async (t) => {
  const liveRun = (options: Options) => gate(makeFixture(t, options), ["--skip-run", "--mode", "live"]);
  const today = await liveRun({});
  assert.deepEqual(failing(today), ["L1", "L2", "L3"], show(today));
  assert.equal(today.status, 1, show(today));
  const cases: [Options, string, RegExp][] = [
    [{ live: true, root: { [`${RUNS}/live-key-check.md`]: null } }, "L1", /live-key-check\.md）が無い/],
    [{ live: true, root: { [`${RUNS}/live-key-check.md`]: "# 実キーの確認\n- 回数制限：確認した\n- 内部アドレス：未確認\n" } }, "L1", /「未確認」の行：3行目/],
    [{ live: true, root: { [`${RUNS}/legal-confirmation.md`]: null } }, "L2", /法務の確認の記録が無い：legal-confirmation\.md$/],
    [{ live: true, root: { [`${RUNS}/cloudflare-confirmation.md`]: null } }, "L2", /法務の確認の記録が無い：cloudflare-confirmation\.md$/],
    [{ live: true, root: { [`${SPEC}/evidence-table.md`]: withRow(true, "2.3", { state: "未" }) } }, "L3", /ライブ取得を開く前で未の行：1（2\.3）/],
  ];
  const runs = await Promise.all(cases.map(([options]) => liveRun(options)));
  runs.forEach((run, index) => expectOnly(run, [cases[index][1]], cases[index][2]));
});

test("a tree without .agent-harness and .kiro, or without --snapshot: the gate prints the whole table and fails those conditions", async (t) => {
  const bare = makeFixture(t, { drop: [".agent-harness/", ".kiro/"] });
  const [demo, live, noSnapshot] = await Promise.all([
    gate(bare), gate(bare, ["--skip-run", "--mode", "live"]), runGate(["--root", makeFixture(t).root, "--skip-run"]),
  ]);
  assert.deepEqual(failing(demo), ["G3", "G7", "G8", "G9", "G11"], show(demo));
  assert.equal(rows(demo).length, 11, show(demo));
  assert.equal(demo.status, 1, show(demo));
  assert.deepEqual(failing(live), ["G3", "G7", "G8", "G9", "G11", "L1", "L2", "L3"], show(live));
  assert.deepEqual(failing(noSnapshot), ["G2", "G3", "G4", "G5"], show(noSnapshot));
  for (const id of ["G2", "G3", "G4", "G5"]) assert.match(rows(noSnapshot).find((row) => row.id === id)?.reason ?? "", /公開する木の指定が無い（--snapshot）/);
  assert.match(noSnapshot.stdout, /公開する木：（指定なし）/);
});

test("nothing it read is printed: no operator name, address, holder or identifier, whether it passes or fails", async (t) => {
  const passing = makeFixture(t);
  const failingTree = makeFixture(t, {
    root: {
      "src/lib/operator-info.ts": operatorInfo({ name: FAKE.name, contact: FAKE.notMail, rightsContact: FAKE.rights }),
      "wrangler.jsonc": WRANGLER.replace("\"name\": \"fake-app\",", `"name": "fake-app",\n  "account_id": "${FAKE.account}",`),
    },
  });
  const runs = await Promise.all([gate(passing, []), gate(failingTree), runGate(["--root", passing.root, "--e2e-fingerprint"])]);
  assert.deepEqual(failing(runs[1]), ["G1", "G10"], show(runs[1]));
  for (const run of runs) {
    const printed = `${run.stdout}${run.stderr}`;
    for (const value of [FAKE.name, FAKE.holder, FAKE.contact, FAKE.rights, MAIL_DOMAIN, FAKE.notMail, "Quillmere", FAKE.account]) {
      assert.ok(!printed.includes(value), `a value read from the fixture is printed:\n${show(run)}`);
    }
  }
});

test("--e2e-fingerprint prints the documented fingerprint; bad arguments stop with exit 2 and no table", async (t) => {
  const fixture = makeFixture(t);
  const [printed, unknown, mode, missing, inRoot, noValue] = await Promise.all([
    runGate(["--root", fixture.root, "--e2e-fingerprint"]),
    runGate(["--root", fixture.root, "--force"]),
    runGate(["--root", fixture.root, "--mode", "everything"]),
    runGate(["--root", fixture.root, "--snapshot", join(fixture.root, "..", "no-such-tree")]),
    runGate(["--root", fixture.root, "--snapshot", join(fixture.root, "src")]),
    runGate(["--root", fixture.root, "--snapshot"]),
  ]);
  assert.equal(printed.status, 0, show(printed));
  assert.equal(printed.stdout.split("  ")[0], e2eFingerprint(fixture.root), show(printed));
  for (const [run, message] of [[unknown, /知らない指定です：--force/], [mode, /--mode は demo-only か live/], [missing, /--snapshot には/], [inRoot, /リポジトリの外/], [noValue, /--snapshot の値がありません/]] as const) {
    assert.equal(run.status, 2, show(run));
    assert.match(run.stderr, message, show(run));
    assert.equal(rows(run).length, 0, show(run));
  }
});
