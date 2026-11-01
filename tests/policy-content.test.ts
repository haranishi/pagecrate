import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  cookiesDocument, policyDocumentText, POLICY_LIMITS, POLICY_SUMMARY, privacyDocument, termsDocument, TURNSTILE_PRIVACY_LINK, UNOBSERVED_LABEL,
  type PolicyBlock, type PolicyDocument, type PolicyLink,
} from "../src/lib/policy-content";
import { missingOperatorFields, OPERATOR_FIELD_LABELS, OPERATOR_INFO, operatorFacts, UNDECIDED_LABEL, type OperatorInfo } from "../src/lib/operator-info";
import { POLICY_ACK_STORAGE_NAME, POLICY_VERSION, policyVersionDate } from "../src/lib/policy";
import { TICKET_TTL_SECONDS } from "../src/lib/ticket";
import { MAX_CANDIDATES } from "../src/lib/assets";
import { SCAN_MS } from "../src/lib/scanner";
import { MAX_ASSET_BYTES } from "../src/lib/safe-fetch";
import { MAX_DOWNLOAD_TICKETS } from "../src/lib/guard";
import { PREVIEW_MAX_BYTES } from "../src/lib/preview-stream";
import { RATE_LIMIT_PERIOD_SEC } from "../src/lib/guard-adapters";
import { BUDGET_RETENTION_DAYS } from "../src/lib/budget-gate";
import { zipStream, type ZipInput } from "../src/lib/download";
import type { safeFetch } from "../src/lib/safe-fetch";

const MiB = 1024 * 1024;
const NO_OPERATOR: OperatorInfo = { name: null, contact: null, rightsContact: null };
const documents = (info: OperatorInfo = OPERATOR_INFO) => [termsDocument(info), privacyDocument(info), cookiesDocument()];
const allText = (info?: OperatorInfo) => [...documents(info).map(policyDocumentText), ...POLICY_SUMMARY].join("\n");
const blocks = (document: PolicyDocument) => document.sections.flatMap(section => section.blocks);
const root = new URL("..", import.meta.url);

test("policy documents: no draft notice is left in the pages, their frame or their words", () => {
  for (const banned of ["草案", "限定テスト", "一般提供前"]) {
    assert.equal(allText().includes(banned), false, banned);
    for (const file of ["src/app/terms/page.tsx", "src/app/privacy/page.tsx", "src/app/cookies/page.tsx", "src/components/policy-page.tsx"]) {
      assert.equal(readFileSync(new URL(file, root), "utf8").includes(banned), false, `${banned} in ${file}`);
    }
  }
  assert.equal(readFileSync(new URL("src/components/policy-page.tsx", root), "utf8").includes("/login"), false, "the frame no longer leads to a login screen");
});

test("policy documents: an undecided operator, contact or rights desk is shown as 未確定 in the terms and the privacy policy", () => {
  assert.equal(UNDECIDED_LABEL, "未確定（公開前に確定して掲載します）");
  for (const document of [termsDocument(NO_OPERATOR), privacyDocument(NO_OPERATOR)]) {
    const text = policyDocumentText(document);
    for (const label of Object.values(OPERATOR_FIELD_LABELS)) assert.ok(text.includes(`${label}：${UNDECIDED_LABEL}`), `${document.title}: ${label}`);
  }
  // A blank value is still undecided, and the release gate sees it.
  const partial: OperatorInfo = { name: "  ", contact: "contact@example.test", rightsContact: null };
  assert.deepEqual(missingOperatorFields(partial), ["name", "rightsContact"]);
  assert.deepEqual(operatorFacts(partial).map(fact => fact.detail), [UNDECIDED_LABEL, "contact@example.test", UNDECIDED_LABEL]);
  const filled: OperatorInfo = { name: "例の運営者", contact: "contact@example.test", rightsContact: "rights@example.test" };
  assert.deepEqual(missingOperatorFields(filled), []);
  assert.equal(policyDocumentText(termsDocument(filled)).includes(UNDECIDED_LABEL), false);
  // The pages read the one shared record.
  assert.deepEqual(termsDocument(), termsDocument(OPERATOR_INFO));
  assert.deepEqual(privacyDocument(), privacyDocument(OPERATOR_INFO));
  assert.deepEqual(missingOperatorFields(), missingOperatorFields(OPERATOR_INFO));
});

test("policy numbers: the limits the documents state equal the constants the code enforces", () => {
  assert.equal(POLICY_LIMITS.ticketMinutes * 60, TICKET_TTL_SECONDS);
  assert.equal(POLICY_LIMITS.maxCandidates, MAX_CANDIDATES);
  assert.equal(POLICY_LIMITS.scanSeconds * 1000, SCAN_MS);
  assert.equal(POLICY_LIMITS.assetMiB * MiB, MAX_ASSET_BYTES);
  assert.equal(POLICY_LIMITS.zipFiles, MAX_DOWNLOAD_TICKETS);
  assert.equal(POLICY_LIMITS.previewMiB * MiB, PREVIEW_MAX_BYTES);
  for (const route of ["scan", "preview", "download"] as const) assert.equal(POLICY_LIMITS.rateWindowMinutes * 60, RATE_LIMIT_PERIOD_SEC[route], route);
  assert.equal(POLICY_LIMITS.renderCountDays, BUDGET_RETENTION_DAYS);
  // The sentences carry the same numbers (built here from the imported constants, not typed in).
  const terms = policyDocumentText(termsDocument());
  const privacy = policyDocumentText(privacyDocument());
  for (const phrase of [`最大${MAX_CANDIDATES}件`, `${SCAN_MS / 1000}秒まで`, `1件${MAX_ASSET_BYTES / MiB}MiBまで`, `合計${POLICY_LIMITS.zipMiB}MiB・${MAX_DOWNLOAD_TICKETS}件まで`, `1枚${PREVIEW_MAX_BYTES / MiB}MiBまで`, `${TICKET_TTL_SECONDS / 60}分で使えなくなります`]) {
    assert.ok(terms.includes(phrase), `terms: ${phrase}`);
  }
  for (const phrase of [`発行から${TICKET_TTL_SECONDS / 60}分で使えなくなります`, `${RATE_LIMIT_PERIOD_SEC.scan / 60}分間の回数`, `${BUDGET_RETENTION_DAYS}日分だけ残し`]) {
    assert.ok(privacy.includes(phrase), `privacy: ${phrase}`);
  }
  assert.ok(POLICY_SUMMARY.some(line => line.includes(`${TICKET_TTL_SECONDS / 60}分`)));
});

test("policy numbers: the ZIP limits stated (per file and in total) are the ones the ZIP stream enforces", async () => {
  // download.ts keeps both limits private, so the check watches the stream: the first fetch is capped at the
  // per-file size, files filling the stated total are all saved, and the next one is refused before any fetch.
  const fileBytes = POLICY_LIMITS.assetMiB * MiB;
  const totalBytes = POLICY_LIMITS.zipMiB * MiB;
  assert.equal(totalBytes % fileBytes, 0, "the check fills the total with whole files");
  const fits = totalBytes / fileBytes;
  const body = Buffer.alloc(fileBytes);
  body.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const caps: number[] = [];
  const fetcher: typeof safeFetch = async (url, options) => {
    caps.push(options?.maxBytes ?? Number.NaN);
    return { status: 200, headers: { "content-type": "image/png" }, body, url };
  };
  const input: ZipInput = { pageOrigin: "https://fixture.example", demo: false,
    assets: Array.from({ length: fits + 1 }, (_, index) => ({ id: `policy-${index}`, url: `https://fixture.example/${index}.png`, kind: "image" as const })) };
  const reader = zipStream(input, () => undefined, { fetcher, scheduleDeadline: () => () => undefined }).getReader();
  const tail: Uint8Array[] = [];
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    tail.push(item.value);
    if (tail.length > 8) tail.shift();
  }
  assert.equal(caps[0], fileBytes, "the per-file cap");
  assert.equal(caps.length, fits, "the file past the total is refused without a fetch");
  const manifest = Buffer.concat(tail).toString();
  assert.match(manifest, new RegExp(`"saved": ${fits}\\b`));
  assert.match(manifest, new RegExp(`"id": "policy-${fits}"[^}]*"status": "failed"`));
});

test("policy documents: the cookie page is a table of what is kept on the device, with Turnstile 未確認", () => {
  assert.equal(UNOBSERVED_LABEL, "未確認");
  const tables = blocks(cookiesDocument()).filter((block): block is Extract<PolicyBlock, { kind: "table" }> => block.kind === "table");
  assert.equal(tables.length, 1);
  const [table] = tables;
  assert.ok(table.rows.every(row => row.length === table.columns.length));
  const turnstile = table.rows.find(([name]) => name.includes("Turnstile"));
  assert.ok(turnstile, "a row for the bot check");
  assert.deepEqual(turnstile.slice(1), Array(table.columns.length - 1).fill(UNOBSERVED_LABEL));
  const ack = table.rows.find(([name]) => name.includes("ポリシーの確認"));
  assert.ok(ack, "a row for the policy check");
  assert.ok(ack[1].includes(POLICY_ACK_STORAGE_NAME) && ack[1].includes("localStorage"));
  assert.ok(ack[2].includes("送りません"));
  const rest = table.rows.find(([name]) => name === "そのほか");
  assert.ok(rest && rest[1] === "ありません");
  assert.equal(table.rows.length, 3, "nothing else is kept");
});

test("policy documents: the privacy policy covers what requirement 2.4 asks for, in plain words", () => {
  const privacy = policyDocumentText(privacyDocument());
  for (const phrase of ["Cloudflare Workers", "ブラウザー描画", "運営者の設備に残さないもの", "入力したURL", "候補の一覧", "氏名・メールアドレス・アカウント",
    "日替わりの鍵", "取得したURLや素材とは結びつけません", "Turnstile", "Cloudflare と直接通信", "許諾", "端末（ブラウザーの保存領域）にだけ"]) {
    assert.ok(privacy.includes(phrase), phrase);
  }
  assert.ok(policyDocumentText(termsDocument()).includes("権利者の許諾と、対象のサイトの利用規約を確かめてください"));
  assert.ok(POLICY_SUMMARY.some(line => line.includes("Turnstile")) && POLICY_SUMMARY.some(line => line.includes("端末の中だけ")));
});

test("policy documents: links go to existing pages or to an https site, and the version is a dated one above the last", () => {
  for (const document of documents()) {
    for (const block of blocks(document)) {
      if (block.kind !== "paragraph") continue;
      for (const part of block.parts) {
        if (typeof part === "string") continue;
        if (part.external) assert.equal(new URL(part.href).protocol, "https:", part.href);
        else assert.ok(existsSync(new URL(`src/app${part.href}/page.tsx`, root)), part.href);
      }
    }
  }
  assert.match(POLICY_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  // 2026-10-31.1 was the public rewrite; the version went up again when the logs and Turnstile disclosures were added.
  assert.ok(POLICY_VERSION > "2026-10-31.1", "the version went up with the new disclosures");
  assert.equal(policyVersionDate("2026-10-31.1"), "2026年10月31日");
  assert.equal(policyVersionDate(), `${Number(POLICY_VERSION.slice(0, 4))}年${Number(POLICY_VERSION.slice(5, 7))}月${Number(POLICY_VERSION.slice(8, 10))}日`);
  assert.throws(() => policyVersionDate("draft"));
});

test("policy documents: the client key and the render count are described as far as the code goes, no further", () => {
  const privacy = policyDocumentText(privacyDocument());
  const all = [privacy, ...POLICY_SUMMARY].join("\n");
  // A key holder can work an IPv4 address out of the value by trying them all: the words promise only what is true.
  for (const overclaim of ["接続元には戻せません", "元に戻せない", "戻すことはできません"]) assert.equal(all.includes(overclaim), false, overclaim);
  for (const phrase of ["値だけから接続元を割り出すことはできない作り", "運営者は値を保存せず、ログにも出しません", "/64", "元の IPv4 にまとめます"]) assert.ok(privacy.includes(phrase), phrase);
  // The count is deleted when a new day's first render runs (budget-gate.ts), not on a timer: with no render, it stays.
  assert.ok(privacy.includes(`${BUDGET_RETENTION_DAYS}日分だけ残し、古い分は、新しい日の最初の描画のときに消します（描画のない日が続くと、その間は残ります）。`));
  assert.equal(privacy.includes("日たつと消します"), false);
  assert.ok(POLICY_SUMMARY.some(line => line.includes("運営者はその値を保存しません")));
});

test("policy documents: the share buttons are described as links that go out only when pressed, sending nothing to the operator", () => {
  const privacy = privacyDocument();
  const section = privacy.sections.find(item => item.heading === "共有のボタン");
  assert.ok(section, "a section on the share buttons");
  // In that section: what happens on this site, and that X and LINE follow their own rules once opened.
  const text = policyDocumentText({ ...privacy, sections: [section] });
  for (const phrase of ["外部のサービスへのリンクで、押したときだけそのサービスへ移動します", "運営者には何も送られません", "端末の中で動きます",
    "X や LINE を開いたあとは、それぞれのサービスの規約とプライバシーポリシーに従います。", "共有するのは、このサイトのトップページのリンクだけです。"]) {
    assert.ok(text.includes(phrase), phrase);
  }
});

test("policy documents: the operator keeps no access or error records, and what the bot check hands to Cloudflare is named, with Cloudflare's page", () => {
  const privacy = privacyDocument();
  const text = policyDocumentText(privacy);
  // wrangler.jsonc turns Workers Logs off (tests/guard-adapters.test.ts holds that setting); Cloudflare's own records are not ours to stop.
  assert.ok(text.includes("運営者は、アクセスの記録もエラーの記録も保存しない設定にしています。"));
  assert.ok(text.includes("ただし、Cloudflare がサービスを動かすために自分の設備で持つ記録は、運営者の設定では止められません。"));
  assert.equal(text.includes("要求ごとのアクセス記録は残さない"), false, "the old sentence said nothing of error records");
  // Turnstile: the connecting address, the browser and its connection, and this site's name go to Cloudflare.
  assert.ok(text.includes("このとき Cloudflare は、あなたの接続元（IPアドレス）、ブラウザーの種類や通信の特徴、このサイトの名前などを受け取って処理します。"));
  assert.deepEqual(TURNSTILE_PRIVACY_LINK, { text: "Cloudflare の Turnstile のプライバシーに関する案内", href: "https://www.cloudflare.com/turnstile-privacy-policy/", external: true });
  const links = blocks(privacy).flatMap(block => block.kind === "paragraph" ? block.parts.filter((part): part is PolicyLink => typeof part !== "string") : []);
  assert.ok(links.includes(TURNSTILE_PRIVACY_LINK), "the privacy policy links to it (external links open in a new tab, policy-page.tsx)");
  assert.ok(text.includes(`詳しくは、${TURNSTILE_PRIVACY_LINK.text}を読んでください。`));
  // The policy check says it too, in a word.
  const summary = POLICY_SUMMARY.find(line => line.includes("Turnstile"));
  assert.ok(summary?.includes("このとき、接続元（IPアドレス）などが Cloudflare に渡ります。"), summary ?? "no summary line on Turnstile");
});
