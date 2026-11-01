// Tests for scripts/make-public-snapshot.mjs, the public snapshot tool. Each case builds a throwaway repository in the
// OS temp folder (git, a fake package-lock.json and a fake node_modules), runs the real command on it with --repo, and
// reads the tree it wrote. The real node_modules and the real private NG list are never read; every fake name, word
// and address is assembled at run time, so this file passes the pre-publication check itself. The check that the tool
// runs gets a stand-in gitleaks that finds nothing, so these cases test the snapshot, not gitleaks.
import test, { after, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const SCRIPT = here("../scripts/make-public-snapshot.mjs");
const HYGIENE = here("../scripts/hygiene.mjs");
const HYGIENE_CONFIG = here("../scripts/hygiene.config.json");
const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
const EVIDENCE = ".agent-harness/evidence/hygiene";
const SHARED = mkdtempSync(join(tmpdir(), "snapshot-shared-"));
after(() => rmSync(SHARED, { recursive: true, force: true }));

const GITLEAKS_STUB = join(SHARED, "gitleaks-stub");
writeFileSync(GITLEAKS_STUB, "#!/bin/sh\nif [ \"$1\" = version ]; then echo 8.0.0-stub; exit 0; fi\necho '[]'\n");
chmodSync(GITLEAKS_STUB, 0o755);
const NO_TOOL = join(SHARED, "missing-tool");

const FAKE = {
  ngWord: ["vorq", "linde"].join(""), // the fake private word; also the fake real name in the fake repository's git config
  handle: ["snap", "tester"].join("-"),
};
const NOREPLY = ["4242+", FAKE.handle, "@users.noreply.github.com"].join("");
const HOLDER = "Example Works";
const UNDECIDED = "<OPERATOR-NAME-UNDECIDED>";

// --- the fake repository ----------------------------------------------------------------------------------------
type Tree = Record<string, string | Buffer>;
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const mit = (holder: string) => `MIT License\n\nCopyright (c) 2020 ${holder}\n\nFAKE-MIT-TERMS: permission is granted, for the test only.\n`;
const LOCK = {
  name: "fake-app", version: "0.0.0", lockfileVersion: 3, requires: true,
  packages: {
    "": { name: "fake-app", version: "0.0.0" },
    "node_modules/alpha": { version: "1.0.0", license: "MIT" },
    "node_modules/beta": { version: "2.0.0", license: "MIT" },
    "node_modules/gamma": { version: "3.0.0", license: "MIT" },
    "node_modules/@scope/delta": { version: "4.0.0", license: "Apache-2.0" },
    "node_modules/epsilon": { version: "5.0.0", license: "ISC" },
    "node_modules/zeta-x64": { version: "6.0.0", license: "MIT", optional: true },
    "node_modules/@img/sharp-libvips-fake": { version: "1.0.0", license: "LGPL-3.0-or-later", optional: true },
    "node_modules/caniuse-lite": { version: "1.0.1", license: "CC-BY-4.0" },
    "node_modules/alpha/node_modules/eta": { version: "0.1.0", license: "BSD-3-Clause" },
    "node_modules/devonly": { version: "9.0.0", license: "MIT", dev: true },
    "node_modules/devopt": { version: "9.1.0", license: "MIT", devOptional: true },
  },
};
const PRODUCTION = ["alpha", "beta", "gamma", "@scope/delta", "epsilon", "zeta-x64", "@img/sharp-libvips-fake", "caniuse-lite", "eta"];
const pkgJson = (name: string, version: string) => json({ name, version });
const nodeModules = (): Tree => ({
  "node_modules/alpha/package.json": pkgJson("alpha", "1.0.0"),
  "node_modules/alpha/LICENSE": mit("Alpha Authors"),
  "node_modules/beta/package.json": pkgJson("beta", "2.0.0"),
  "node_modules/beta/LICENSE": mit("Alpha Authors"), // the same text as alpha
  "node_modules/gamma/package.json": pkgJson("gamma", "3.0.0"),
  "node_modules/gamma/license.md": mit("Gamma Team").replace(/\n/g, "\r\n"), // the same terms, another holder, CRLF
  "node_modules/@scope/delta/package.json": pkgJson("@scope/delta", "4.0.0"),
  "node_modules/@scope/delta/LICENSE": "Apache License\nVersion 2.0, January 2004\n\n2. Grant of Copyright License. FAKE-APACHE-TERMS for the test.\n\n   Copyright [yyyy] [name of copyright owner]\n",
  "node_modules/@scope/delta/NOTICE": "Delta\nCopyright 2022 Delta Org\n",
  "node_modules/epsilon/package.json": pkgJson("epsilon", "5.0.0"), // installed, without a license file
  "node_modules/caniuse-lite/package.json": pkgJson("caniuse-lite", "1.0.1"),
  "node_modules/caniuse-lite/LICENSE": "Attribution 4.0 International\n\nFAKE-CC-BY-TERMS for the test.\n",
  "node_modules/alpha/node_modules/eta/package.json": pkgJson("eta", "0.1.0"),
  "node_modules/alpha/node_modules/eta/LICENSE": "Copyright (c) 2019, Eta\nAll rights reserved.\nPortions Copyright 2018 Eta Contributors\n\nFAKE-BSD-TERMS: keep the above copyright notice.\n",
  "node_modules/devonly/package.json": pkgJson("devonly", "9.0.0"),
  "node_modules/devonly/LICENSE": "FAKE-DEV-ONLY-TERMS\n",
  "node_modules/devopt/package.json": pkgJson("devopt", "9.1.0"),
  "node_modules/devopt/LICENSE": "FAKE-DEV-OPTIONAL-TERMS\n",
});
const operatorInfo = (name: string | null) =>
  `export const OPERATOR_INFO = { name: ${name === null ? "null" : JSON.stringify(name)}, contact: null, rightsContact: null };\n`;

const repoFiles = (): Tree => ({
  ".gitignore": "node_modules/\n.next/\n.open-next/\n.wrangler/\ntest-results/\ncloudflare-env.d.ts\nnext-env.d.ts\n*.log\n",
  "README.md": "# Fake app\n",
  "package.json": json({ name: "fake-app", version: "0.0.0", private: true }),
  "package-lock.json": json(LOCK),
  "tsconfig.json": "{}\n",
  "next.config.ts": "export default {};\n",
  "eslint.config.mjs": "export default [];\n",
  "playwright.config.ts": "export default {};\n",
  "wrangler.jsonc": "{ \"name\": \"fake-app\" }\n",
  "open-next.config.ts": "export default {};\n",
  "worker.ts": "export default {};\n",
  ".dev.vars.example": "TICKET_SECRET=\n",
  "AGENTS.md": "Read the docs first.\n",
  "CLAUDE.md": "@AGENTS.md\n",
  ".precheck-ng.example.txt": "# example only\nexample-word\n",
  ".github/PULL_REQUEST_TEMPLATE.md": "## What changed\n",
  "src/lib/operator-info.ts": operatorInfo(null),
  "src/app/page.tsx": "export default function Page() { return null; }\n",
  "public/og.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\"/>\n",
  "tests/a.test.ts": "export {};\n",
  "fixtures/sample.txt": "sample\n",
  "docs/guide.md": "# Guide\n",
  "docs/licenses-and-assets.md": "| `public/og.svg` | drawn in code |\n",
  "scripts/make-og-image.mjs": "export {};\n",
  "scripts/record-tour.mjs": "export {};\n",
  "scripts/hygiene.mjs": readFileSync(HYGIENE),
  "scripts/hygiene.config.json": readFileSync(HYGIENE_CONFIG),
  "scripts/make-public-snapshot.mjs": readFileSync(SCRIPT),
  // Never published:
  "scripts/migrate-database.mjs": "export {};\n",
  ".agent-harness/runs/log.md": "work log\n",
  "research/notes.md": "notes\n",
  ".kiro/specs/demo/design.md": "# Design\n",
  ".kiro/specs/demo/release-checklist.md": "# Release steps\n",
  ".precheck-ng.txt": `# fake private list\n${FAKE.ngWord}\n`,
  ".dev.vars": "TICKET_SECRET=\n",
  "docs/.dev.vars.local": "TICKET_SECRET=\n",
  "notes.txt": "a new file that nobody listed\n",
  "next-env.d.ts": "/// <reference types=\"next\" />\n", // ignored by .gitignore but tracked (git add -f), so published
  "public/debug.log": "ignored\n",
  ".next/server/page.js": "built\n",
  ".open-next/worker.js": "built\n",
  ".wrangler/state/v3/d1.sqlite": "state\n",
  "test-results/report.txt": "result\n",
  "tests/playwright-report/index.html": "<p>report</p>\n", // not in .gitignore: only the tool's own rule keeps it out
  "cloudflare-env.d.ts": "declare global {}\n",
  ...nodeModules(),
});
const EXPECTED_TREE = [
  ".dev.vars.example", ".github/PULL_REQUEST_TEMPLATE.md", ".gitignore", ".precheck-ng.example.txt", "AGENTS.md", "CLAUDE.md", "LICENSE", "README.md",
  "THIRD_PARTY_NOTICES.md", "docs/guide.md", "docs/licenses-and-assets.md", "eslint.config.mjs", "fixtures/sample.txt", "next-env.d.ts", "next.config.ts",
  "open-next.config.ts", "package-lock.json", "package.json", "playwright.config.ts", "public/og.svg", "scripts/hygiene.config.json", "scripts/hygiene.mjs",
  "scripts/make-og-image.mjs", "scripts/make-public-snapshot.mjs", "scripts/record-tour.mjs", "src/app/page.tsx", "src/lib/operator-info.ts",
  "tests/a.test.ts", "tsconfig.json", "worker.ts", "wrangler.jsonc",
];

function git(cwd: string, args: string[]) {
  const result = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args[0]} failed`);
  return result.stdout;
}
function writeTree(root: string, files: Tree) {
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
}
function makeRepo(t: TestContext, overrides: Tree = {}, email = NOREPLY): string {
  const root = mkdtempSync(join(tmpdir(), "snapshot-repo-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeTree(root, { ...repoFiles(), ...overrides });
  for (const args of [["init", "-q"], ["config", "user.email", email], ["config", "user.name", FAKE.ngWord], ["config", "commit.gpgsign", "false"], ["add", "-f", "next-env.d.ts"]]) git(root, args);
  return root;
}
/** A path that does not exist yet, inside a fresh temp folder (outside every fake repository). */
function newOut(t: TestContext): string {
  const parent = mkdtempSync(join(tmpdir(), "snapshot-out-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return join(parent, "tree");
}
function listTree(dir: string): string[] {
  const found: string[] = [];
  const walk = (rel: string) => {
    for (const entry of readdirSync(rel ? join(dir, rel) : dir, { withFileTypes: true })) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { if (entry.name !== ".git") walk(path); } else found.push(path);
    }
  };
  walk("");
  return found.sort();
}

// --- running the tool -------------------------------------------------------------------------------------------
interface SnapshotRecord {
  fingerprint: string; files: number; verdict: string; problems: string[];
  license: { type: string; holder: string; holderSource: string };
  notices: { packages: number; withText: number; withoutText: number; notInstalled: number; texts: number; notices: number; versionMismatch: number };
  git: { branch: string; commits: number; head: string; files: number } | null;
  hygiene: { exit: number | null; record: string | null };
  manifest: [string, string][];
}
interface Run { status: number | null; stdout: string; stderr: string; record: SnapshotRecord | null }

const records = (repo: string) => (existsSync(join(repo, EVIDENCE)) ? readdirSync(join(repo, EVIDENCE)) : []);
function runTool(repo: string | null, args: string[], env: Record<string, string> = {}): Run {
  const before = repo ? new Set(records(repo)) : new Set<string>();
  const result = spawnSync(process.execPath, ["--import", TSX, SCRIPT, ...(repo ? ["--repo", repo] : []), ...args], {
    cwd: SHARED, encoding: "utf8", env: { ...process.env, HYGIENE_GITLEAKS: GITLEAKS_STUB, HYGIENE_FFPROBE: NO_TOOL, ...env },
  });
  const fresh = repo ? records(repo).filter((name) => name.startsWith("snapshot-") && !before.has(name)) : [];
  const record = fresh.length === 1 ? (JSON.parse(readFileSync(join(repo ?? "", EVIDENCE, fresh[0]), "utf8")) as SnapshotRecord) : null;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, record };
}
const snapshot = (repo: string, out: string, args: string[] = []) => runTool(repo, ["--out", out, ...args]);
const show = (run: Run) => `exit ${run.status}\n${run.stdout}\n${run.stderr}`;
const read = (out: string, rel: string) => readFileSync(join(out, rel), "utf8");
const gitOut = (out: string, args: string[]) => spawnSync("git", ["-C", out, ...args], { encoding: "utf8" }).stdout;

// --- cases ------------------------------------------------------------------------------------------------------
test("the tree holds the allowlist only: no work records, research, .kiro, NG list, secrets, unlisted or built files", (t) => {
  const repo = makeRepo(t);
  const out = newOut(t);
  const run = snapshot(repo, out, ["--holder", HOLDER]);
  assert.equal(run.status, 0, show(run));
  assert.deepEqual(listTree(out), EXPECTED_TREE, show(run));
  assert.equal(run.record?.verdict, "ready-for-review", show(run));
  assert.equal(run.record?.files, EXPECTED_TREE.length);
  assert.match(run.stdout, /許可の一覧に無い：.*notes\.txt/);
  assert.match(run.stdout, /判定：OK/);
  assert.ok(!`${run.stdout}${run.stderr}`.includes(FAKE.ngWord), "nothing private is printed");
});

test("LICENSE is MIT; an undecided operator name writes the mark, warns and exits non-zero, a decided one is written", (t) => {
  const undecided = makeRepo(t);
  const out = newOut(t);
  const run = snapshot(undecided, out);
  assert.equal(run.status, 1, show(run));
  const license = read(out, "LICENSE").split("\n");
  assert.equal(license[0], "MIT License");
  assert.equal(license[2], `Copyright (c) 2026 ${UNDECIDED}`);
  assert.match(run.stdout, /警告：運営者の名称が未確定/);
  assert.match(run.stdout, /判定：NG（運営者の名称が未確定）/);
  assert.equal(run.record?.license.holder, "undecided");
  assert.deepEqual(run.record?.problems, ["運営者の名称が未確定"]);
  assert.deepEqual(listTree(out), EXPECTED_TREE, "the tree is still written, with the warning");

  const blank = snapshot(makeRepo(t, { "src/lib/operator-info.ts": operatorInfo("   ") }), newOut(t));
  assert.equal(blank.status, 1, show(blank));
  assert.equal(blank.record?.license.holder, "undecided", "a blank name is undecided");

  const decidedOut = newOut(t);
  const decided = snapshot(makeRepo(t, { "src/lib/operator-info.ts": operatorInfo(HOLDER) }), decidedOut);
  assert.equal(decided.status, 0, show(decided));
  const text = read(decidedOut, "LICENSE");
  assert.equal(text.split("\n")[2], `Copyright (c) 2026 ${HOLDER}`);
  assert.match(text, /^MIT License\n\nCopyright \(c\) 2026 .+\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\n/);
  assert.match(text, /The above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software\.\n/);
  assert.ok(text.endsWith("OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n"));
  assert.equal(decided.record?.license.holderSource, "src/lib/operator-info.ts");

  const givenOut = newOut(t);
  const given = snapshot(undecided, givenOut, ["--holder", HOLDER]);
  assert.equal(given.status, 0, show(given));
  assert.equal(read(givenOut, "LICENSE").split("\n")[2], `Copyright (c) 2026 ${HOLDER}`);
  assert.ok(![decided.stdout, given.stdout].some((printed) => printed.includes(HOLDER)), "the holder's name is not printed");
});

test("THIRD_PARTY_NOTICES covers every non-development entry, merges the same terms and lists the ones without text", (t) => {
  const out = newOut(t);
  const run = snapshot(makeRepo(t), out, ["--holder", HOLDER]);
  assert.equal(run.status, 0, show(run));
  const notices = read(out, "THIRD_PARTY_NOTICES.md");
  for (const name of PRODUCTION) assert.ok(notices.includes(`\`${name}\``), `${name} is listed`);
  for (const devOnly of ["devonly", "devopt", "FAKE-DEV-ONLY-TERMS", "FAKE-DEV-OPTIONAL-TERMS"]) assert.ok(!notices.includes(devOnly), `${devOnly} is not listed`);
  assert.match(notices, /- パッケージ：9件（本文あり 6件・全文なし 3件）/);
  assert.deepEqual(run.record?.notices, { packages: 9, withText: 6, withoutText: 3, notInstalled: 2, texts: 4, notices: 1, versionMismatch: 0 });

  // One body for the three MIT packages, with each package's own copyright line above it.
  assert.equal(notices.split("FAKE-MIT-TERMS").length - 1, 1, "the MIT terms are written once");
  const sections = notices.split("\n### ");
  const mitSection = sections.find((section) => section.includes("FAKE-MIT-TERMS")) ?? "";
  for (const name of ["alpha", "beta", "gamma"]) assert.ok(mitSection.includes(`\`${name}\``), `${name} is under the MIT body`);
  assert.ok(mitSection.includes("Copyright (c) 2020 Alpha Authors") && mitSection.includes("Copyright (c) 2020 Gamma Team"));
  assert.ok(!mitSection.includes("`delta`") && !mitSection.includes("FAKE-APACHE-TERMS"));

  // A copyright line is told apart from the terms that mention copyright, and from Apache-2.0's template line.
  const apacheSection = sections.find((section) => section.includes("FAKE-APACHE-TERMS")) ?? "";
  assert.match(apacheSection, /\| `@scope\/delta` \| 4\.0\.0 \| Apache-2\.0 \| （本文を参照） \|/);
  assert.ok(apacheSection.includes("\n2. Grant of Copyright License. FAKE-APACHE-TERMS") && apacheSection.includes("\n   Copyright [yyyy] [name of copyright owner]\n"));
  const bsdSection = sections.find((section) => section.includes("FAKE-BSD-TERMS")) ?? "";
  assert.match(bsdSection, /\| `eta` \| 0\.1\.0 \| BSD-3-Clause \| Copyright \(c\) 2019, Eta<br>Portions Copyright 2018 Eta Contributors \|/);
  assert.ok(bsdSection.includes("\nAll rights reserved.\n\nFAKE-BSD-TERMS: keep the above copyright notice.\n"));

  // Apache-2.0 with its NOTICE copied; the packages without a text are named with the reason.
  assert.ok(notices.includes("Copyright 2022 Delta Org") && notices.includes("### NOTICE 1（1件）"));
  const without = notices.slice(notices.indexOf("## 全文なし"), notices.indexOf("## 本文ごとのパッケージ"));
  assert.match(without, /\| `epsilon` \| 5\.0\.0 \| ISC \| node_modules にライセンスのファイルが無い \|/);
  assert.match(without, /\| `zeta-x64` \| 6\.0\.0 \| MIT \| この端末の node_modules に無い（ほかの端末向けの任意の部品） \|/);
  assert.match(without, /\| `@img\/sharp-libvips-fake` \| 1\.0\.0 \| LGPL-3\.0-or-later \| .* \| 配らない：sharp の任意のネイティブ部品/);
  assert.match(notices, /\| `caniuse-lite` \| 1\.0\.1 \| CC-BY-4\.0 \| .* \| 表示の義務：/);

  // The copied tool's license, and the fonts and assets.
  assert.ok(notices.includes("`scripts/hygiene.mjs` は、hundred-days") && notices.includes("MIT License\n\nCopyright (c) 2026 "));
  assert.match(notices, /書体のファイル：同梱していません/);
  assert.match(notices, /\| `public\/og\.svg` \| あり \|/);
  assert.match(notices.split("\n")[0], /^# 第三者のソフトウェアと素材の表記$/);
  assert.match(notices, /配らない物（配置の道具、ほかの端末向けの任意の部品など）も含む上位集合/);
  assert.match(notices, /Worker の bundle に実際に入るパッケージの内訳は、まだ確かめていません/);
});

test("--include-kiro adds .kiro/ without release-checklist.md, and the check still passes", (t) => {
  const out = newOut(t);
  const run = snapshot(makeRepo(t), out, ["--include-kiro", "--holder", HOLDER]);
  assert.equal(run.status, 0, show(run));
  assert.deepEqual(listTree(out), [...EXPECTED_TREE, ".kiro/specs/demo/design.md"].sort(), show(run));
});

test("the check's config is the one list of what is never published: inside it is dropped, naming it is refused", (t) => {
  const config = JSON.parse(readFileSync(HYGIENE_CONFIG, "utf8")) as { nonPublicDirs: string[] };
  const nested = makeRepo(t, {
    "scripts/hygiene.config.json": json({ ...config, nonPublicDirs: [...config.nonPublicDirs, "docs/private/"] }),
    "docs/private/plan.md": "# A private plan\n",
  });
  const out = newOut(t);
  const run = snapshot(nested, out, ["--holder", HOLDER]);
  assert.equal(run.status, 0, show(run));
  assert.deepEqual(listTree(out), EXPECTED_TREE, show(run));

  const clash = makeRepo(t, { "scripts/hygiene.config.json": json({ ...config, nonPublicDirs: [...config.nonPublicDirs, "docs/"] }) });
  const clashOut = newOut(t);
  const refused = snapshot(clash, clashOut, ["--holder", HOLDER]);
  assert.equal(refused.status, 2, show(refused));
  assert.match(refused.stderr, /許可の一覧に、公開しないディレクトリ.*docs\//);
  assert.ok(!existsSync(clashOut), "nothing is written");
});

test("--init-git commits the whole tree once, by the noreply address and its account name, with no AI signature or remote", (t) => {
  const out = newOut(t);
  const run = snapshot(makeRepo(t), out, ["--init-git", "--holder", HOLDER]);
  assert.equal(run.status, 0, show(run));
  assert.equal(gitOut(out, ["rev-list", "--count", "HEAD"]).trim(), "1");
  assert.equal(gitOut(out, ["branch", "--show-current"]).trim(), "main");
  assert.equal(gitOut(out, ["remote"]).trim(), "");
  const [authorName, authorEmail, committerName, committerEmail, message] = gitOut(out, ["log", "-1", "--format=%an%x00%ae%x00%cn%x00%ce%x00%B"]).split("\0");
  assert.deepEqual([authorName, authorEmail, committerName, committerEmail], [FAKE.handle, NOREPLY, FAKE.handle, NOREPLY]);
  assert.equal(message.trim(), "Initial public snapshot");
  const log = gitOut(out, ["log", "--format=fuller"]);
  assert.doesNotMatch(log, /co-authored-by|signed-off-by|claude|anthropic|generated with|codex|openai/i);
  assert.ok(!log.includes(FAKE.ngWord), "git config user.name (a real name) is never used");
  assert.deepEqual(gitOut(out, ["ls-files"]).trim().split("\n").sort(), EXPECTED_TREE, "every file is committed, ignored ones too");
  assert.equal(gitOut(out, ["status", "--porcelain"]), "");
  assert.deepEqual(run.record?.git && { branch: run.record.git.branch, commits: run.record.git.commits, files: run.record.git.files }, { branch: "main", commits: 1, files: EXPECTED_TREE.length });
});

test("--init-git refuses an author address that is not noreply, before writing anything", (t) => {
  const out = newOut(t);
  const run = snapshot(makeRepo(t, {}, ["person", "example.org"].join("@")), out, ["--init-git", "--holder", HOLDER]);
  assert.equal(run.status, 2, show(run));
  assert.match(run.stderr, /noreply のアドレスではない/);
  assert.ok(!existsSync(out));
});

test("never writes into a folder that has files (with --force too) or that is inside the repository", (t) => {
  const repo = makeRepo(t);
  const used = mkdtempSync(join(tmpdir(), "snapshot-used-"));
  t.after(() => rmSync(used, { recursive: true, force: true }));
  writeFileSync(join(used, "keep.txt"), "keep me\n");
  for (const extra of [[], ["--force"]]) {
    const run = snapshot(repo, used, ["--holder", HOLDER, ...extra]);
    assert.equal(run.status, 2, show(run));
    assert.match(run.stderr, extra.length ? /--force を付けても書きません/ : /空ではありません。上書きはしません/);
    assert.deepEqual(readdirSync(used), ["keep.txt"]);
    assert.equal(readFileSync(join(used, "keep.txt"), "utf8"), "keep me\n");
  }
  const inRepo = join(repo, "public-copy");
  const refused = snapshot(repo, inRepo, ["--holder", HOLDER]);
  assert.equal(refused.status, 2, show(refused));
  assert.match(refused.stderr, /リポジトリの外にしてください/);
  assert.ok(!existsSync(inRepo));

  const empty = mkdtempSync(join(tmpdir(), "snapshot-empty-"));
  t.after(() => rmSync(empty, { recursive: true, force: true }));
  const run = snapshot(repo, empty, ["--holder", HOLDER]);
  assert.equal(run.status, 0, show(run));
  assert.deepEqual(listTree(empty), EXPECTED_TREE);
});

test("the fingerprint is stable, written next to the check's record, recomputable, and changes with the content", (t) => {
  const repo = makeRepo(t);
  const [outA, outB, outC] = [newOut(t), newOut(t), newOut(t)];
  const first = snapshot(repo, outA, ["--holder", HOLDER]);
  const second = snapshot(repo, outB, ["--holder", HOLDER]);
  assert.equal(first.status, 0, show(first));
  const fingerprint = first.record?.fingerprint ?? "";
  assert.match(fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(second.record?.fingerprint, fingerprint, "the same input gives the same fingerprint");
  assert.match(first.stdout, new RegExp(`木の指紋：${fingerprint}`));

  // Recomputed here from the files alone: sha256 over "<sha256>  <path>\n", sorted by path.
  const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
  const lines = listTree(outA).map((rel) => `${sha(readFileSync(join(outA, rel)))}  ${rel}\n`).join("");
  assert.equal(`sha256:${sha(lines)}`, fingerprint);
  assert.deepEqual(first.record?.manifest.map(([, rel]) => rel), listTree(outA));

  // The check's record sits in the same folder as the snapshot's record.
  assert.match(first.record?.hygiene.record ?? "", /^\.agent-harness\/evidence\/hygiene\/hygiene-tree-\d{8}-\d{6}(?:-\d+)?\.json$/);
  assert.ok(existsSync(join(repo, first.record?.hygiene.record ?? "missing")));
  assert.equal(first.record?.hygiene.exit, 0);

  const printed = runTool(null, ["--fingerprint", outA]);
  assert.equal(printed.status, 0, show(printed));
  assert.ok(printed.stdout.startsWith(`${fingerprint}  `), show(printed));

  writeFileSync(join(repo, "src/app/page.tsx"), "export default function Page() { return 1; }\n");
  const changed = snapshot(repo, outC, ["--holder", HOLDER]);
  assert.notEqual(changed.record?.fingerprint, fingerprint, "another content, another fingerprint");
  writeFileSync(join(outA, "README.md"), "# Changed after the check\n");
  assert.ok(!runTool(null, ["--fingerprint", outA]).stdout.startsWith(fingerprint), "editing the written tree changes it too");
});

test("a failed check makes the run fail, and the value it found is not printed", (t) => {
  const out = newOut(t);
  const run = snapshot(makeRepo(t, { "docs/guide.md": `# Guide by ${FAKE.ngWord}\n` }), out, ["--holder", HOLDER]);
  assert.equal(run.status, 1, show(run));
  assert.match(run.stdout, /判定：NG（点検で失敗）/);
  assert.match(run.stdout, /docs\/guide\.md:1 {2}個人NGワード/);
  assert.equal(run.record?.hygiene.exit, 1);
  assert.ok(!`${run.stdout}${run.stderr}`.includes(FAKE.ngWord));
});
