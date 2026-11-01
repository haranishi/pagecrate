/**
 * The words of the terms, privacy policy and cookie page, and the summary the policy check shows, as data.
 * The pages only draw this. Everything here must match what the code does (requirements 2.4, 6.2, 6.4):
 * the numbers come from POLICY_LIMITS, which tests/policy-content.test.ts compares with the enforced constants,
 * and the operator section comes from operator-info.ts. Plain data only: the policy check imports this in the browser.
 */
import { operatorFacts, type OperatorInfo, OPERATOR_INFO } from "./operator-info";
import { POLICY_ACK_STORAGE_NAME } from "./policy";

/** What the documents promise. Each value must equal the constant the code enforces (see the test). */
export const POLICY_LIMITS = {
  /** ticket.ts TICKET_TTL_SECONDS */
  ticketMinutes: 30,
  /** assets.ts MAX_CANDIDATES */
  maxCandidates: 200,
  /** scanner.ts SCAN_MS */
  scanSeconds: 40,
  /** download.ts per file, safe-fetch.ts MAX_ASSET_BYTES */
  assetMiB: 25,
  /** download.ts total of one ZIP */
  zipMiB: 100,
  /** guard.ts MAX_DOWNLOAD_TICKETS */
  zipFiles: 50,
  /** preview-stream.ts PREVIEW_MAX_BYTES */
  previewMiB: 2,
  /** guard-adapters.ts RATE_LIMIT_PERIOD_SEC (all three routes) */
  rateWindowMinutes: 1,
  /** budget-gate.ts BUDGET_RETENTION_DAYS */
  renderCountDays: 7,
} as const;

/** Shown wherever a fact has not been observed yet (requirement 6.4). Task 6.3 replaces it with what was seen. */
export const UNOBSERVED_LABEL = "未確認";

export interface PolicyLink { readonly text: string; readonly href: string; readonly external?: boolean }
export type PolicyInline = string | PolicyLink;
export type PolicyBlock =
  | { readonly kind: "paragraph"; readonly parts: readonly PolicyInline[] }
  | { readonly kind: "list"; readonly items: readonly string[] }
  | { readonly kind: "facts"; readonly items: readonly { readonly term: string; readonly detail: string }[] }
  | { readonly kind: "table"; readonly caption: string; readonly columns: readonly string[]; readonly rows: readonly (readonly string[])[] };
export interface PolicySection { readonly heading: string; readonly blocks: readonly PolicyBlock[] }
export interface PolicyDocument { readonly title: string; readonly lead: string; readonly sections: readonly PolicySection[] }

const p = (...parts: PolicyInline[]): PolicyBlock => ({ kind: "paragraph", parts });
const list = (...items: string[]): PolicyBlock => ({ kind: "list", items });
const L = POLICY_LIMITS;

/** Cloudflare's own page on what Turnstile receives and processes (opened in a new tab, like every external link). */
export const TURNSTILE_PRIVACY_LINK: PolicyLink = {
  text: "Cloudflare の Turnstile のプライバシーに関する案内", href: "https://www.cloudflare.com/turnstile-privacy-policy/", external: true,
};

const RIGHTS_SENTENCES = [
  "PageCrate で取得できても、素材を使ってよいという許可（許諾）にはなりません。",
  "素材を使う前に、権利者の許諾と、対象のサイトの利用規約を確かめてください。",
] as const;

function operatorSection(heading: string, note: string, info: OperatorInfo): PolicySection {
  return { heading, blocks: [{ kind: "facts", items: operatorFacts(info) }, p(note)] };
}

export function termsDocument(info: OperatorInfo = OPERATOR_INFO): PolicyDocument {
  return {
    title: "利用規約",
    lead: "PageCrate を使う前にお読みください。使うときは、この規約に沿って使ってください。",
    sections: [
      { heading: "PageCrate でできること", blocks: [
        p("PageCrate は、公開されているページのURLから画像と動画の候補を一覧にし、選んだ素材を出典の記録つきのZIPファイルで保存する道具です。ログインもアカウントも要りません。"),
        p("デモは、このアプリのために作った素材だけを使います。外部のサイトには接続しません。"),
      ] },
      { heading: "取得できても、再利用してよいという許可にはなりません", blocks: [
        p(RIGHTS_SENTENCES.join("")),
        p("自分で作った素材か、権利者から許可を得た素材に使ってください。ZIPに入る出典の記録は、許諾を得たことの証明にはなりません。"),
      ] },
      { heading: "してはいけないこと", blocks: [list(
        "他人の著作権・プライバシー・肖像などの権利を侵す取得や再配布",
        "ログイン・有料の壁・CAPTCHA・DRM などの制限をくぐり抜けようとすること（PageCrate にも、くぐり抜ける機能はありません）",
        "秘密のリンク（鍵やパスワードを含むURL）や、取得する権利のない個人情報を入力すること",
        "対象のサイトやこのサービスに大きな負荷をかける使い方や、ボット確認・回数制限を回避しようとすること",
      )] },
      { heading: "一度に扱える量と、対応しないもの", blocks: [
        list(
          `1回の解析で集める候補は最大${L.maxCandidates}件、解析にかける時間は${L.scanSeconds}秒までです。超えた分は打ち切り、そのことを画面に表示します。`,
          `保存は1件${L.assetMiB}MiBまで、ZIP1つにつき合計${L.zipMiB}MiB・${L.zipFiles}件までです。`,
          `プレビューは画像1枚${L.previewMiB}MiBまでです。`,
          `候補の一覧は${L.ticketMinutes}分で使えなくなります。過ぎたら、もう一度解析してください。`,
        ),
        p("分割して配信される動画（HLS・DASH）、blob 形式の動画、ログインが必要な素材は取得しません。すべての素材を取得できるとは限りません。"),
      ] },
      { heading: "使えないとき（混雑・回数制限・停止）", blocks: [
        p("同じ接続元から短い時間に何度も使うと、しばらく使えなくなります。画面に、次に使えるまでの目安を表示します。"),
        p("ページを描画する回数には1日の上限があります。上限に達すると、その日の解析は終わります。再開は日本時間の午前9時ごろです。その間もデモは使えます。"),
        p("運営者が取得を止めることがあります。止めている間も、説明とデモは見られます。サービスの内容は、予告なく変えたり終えたりすることがあります。"),
      ] },
      operatorSection("運営者と窓口", "権利者の方で、PageCrate による取得を止めてほしいサイトがある場合は、申し立て窓口へご連絡ください。運営者は、指定したドメインへの取得を断る設定ができます。", info),
      { heading: "規約の変更", blocks: [p("内容を変えたときは、このページの版を更新します。")] },
    ],
  };
}

export function privacyDocument(info: OperatorInfo = OPERATOR_INFO): PolicyDocument {
  return {
    title: "プライバシーポリシー",
    lead: "PageCrate はログインなしで使えます。入力したURLや集めた素材を、運営者の設備に保存しません。何がどこで処理され、何が残らないかを説明します。",
    sections: [
      { heading: "入力したURLとページの内容は、Cloudflare の設備で処理します", blocks: [
        p("URLを送ると、PageCrate は Cloudflare の設備で対象のページを開き、画像と動画の候補を探します。使うのは、Cloudflare Workers（Cloudflare のサーバーでプログラムを動かす仕組み）と、ブラウザー描画（Cloudflare のサーバー上のブラウザーでページを開く仕組み）です。プレビューやZIPを作るときも、同じ設備で素材をもう一度取得します。"),
        p("対象のサイトへは、Cloudflare のサーバーから PageCrate として接続します。あなたのブラウザーの Cookie やログイン情報は送りません。サイトの住所（ドメイン名）を調べるときは、Cloudflare の名前解決の仕組み（DNS）を使います。"),
        p("外部のAIに素材を送ることはありません。Cloudflare が自社の運用のために扱う情報は、", { text: "Cloudflare のプライバシーポリシー", href: "https://www.cloudflare.com/privacypolicy/", external: true }, "に従います。"),
      ] },
      { heading: "運営者の設備に残さないもの", blocks: [
        list(
          "入力したURL",
          "取得したページの内容と素材",
          "候補の一覧",
          "氏名・メールアドレス・アカウント（PageCrate にはログインもアカウントもありません）",
        ),
        p(`候補の一覧には、素材ごとに「チケット」を付けて、あなたのブラウザーに返します。チケットは、素材のURLと有効期限を、改ざんできない形にまとめた文字列です。運営者の設備には残さず、発行から${L.ticketMinutes}分で使えなくなります。`),
        p("運営者は、アクセスの記録もエラーの記録も保存しない設定にしています。ただし、Cloudflare がサービスを動かすために自分の設備で持つ記録は、運営者の設定では止められません。"),
        p(`運営者の設備に残るのは、1日にページを描画した回数（日付と回数）だけです。1日の上限を守るために数えるもので、URLやあなたの情報とは結びつけません。${L.renderCountDays}日分だけ残し、古い分は、新しい日の最初の描画のときに消します（描画のない日が続くと、その間は残ります）。`),
      ] },
      { heading: "回数制限とボット確認のために、一時的に使う情報", blocks: [
        p(`使いすぎを防ぐため、接続元（IPアドレス）を日替わりの鍵で縮めた値を使います。縮める前に、IPv6 の接続元は同じ回線にまとめて割り当てられる範囲（/64）に、IPv6 の形で書かれた IPv4 の接続元は元の IPv4 にまとめます。値だけから接続元を割り出すことはできない作りで、運営者は値を保存せず、ログにも出しません。この値は${L.rateWindowMinutes}分間の回数を数える判定にだけ使い、取得したURLや素材とは結びつけません。鍵は毎日、日本時間の午前9時に変わります。IPアドレスそのものは保存しません。`),
        p(
          "ボット確認には、Cloudflare の Turnstile（人の操作であることを確かめる仕組み）を使います。解析を始めるときだけ、あなたのブラウザーが Cloudflare から確認用のプログラムを読み込み、Cloudflare と直接通信します（画面を開いただけでは読み込みません）。",
          "このとき Cloudflare は、あなたの接続元（IPアドレス）、ブラウザーの種類や通信の特徴、このサイトの名前などを受け取って処理します。詳しくは、",
          TURNSTILE_PRIVACY_LINK,
          "を読んでください。",
        ),
        p("確認が済むと、使い切りの「確認済みの印」があなたのブラウザーに渡ります。PageCrate のサーバーは、その印が正しいかを Cloudflare に問い合わせます。この問い合わせには、あなたの接続元を含めません。デモは外部と通信しないので、ボット確認を使いません。"),
        p(`Turnstile があなたの端末に何を置くかは、まだ確かめていません（${UNOBSERVED_LABEL}）。確かめたら、`, { text: "Cookieについて", href: "/cookies" }, "のページを更新します。"),
      ] },
      { heading: "取得できても、再利用の許可ではありません", blocks: [p(RIGHTS_SENTENCES.join(""))] },
      { heading: "共有のボタン", blocks: [
        p("画面の共有のボタン（X・LINE）は外部のサービスへのリンクで、押したときだけそのサービスへ移動します。押しても、運営者には何も送られません。端末の共有とリンクのコピーは、あなたの端末の中で動きます。"),
        p("X や LINE を開いたあとは、それぞれのサービスの規約とプライバシーポリシーに従います。共有するのは、このサイトのトップページのリンクだけです。"),
      ] },
      { heading: "このポリシーを読んだという確認", blocks: [
        p("使う前に、このポリシーを読んだことを確認していただきます。その確認は、あなたの端末（ブラウザーの保存領域）にだけ残し、運営者の設備には送りません。"),
      ] },
      operatorSection("運営者と問い合わせ先", "このポリシーについてのご質問は、問い合わせ先へお願いします。", info),
      { heading: "このポリシーの変更", blocks: [p("内容を変えたときは版を更新します。版が変わると、次に使うときに、もう一度確認をお願いします。")] },
    ],
  };
}

export function cookiesDocument(): PolicyDocument {
  return {
    title: "Cookieについて",
    lead: "PageCrate 自身は Cookie を使いません。あなたの端末（ブラウザー）に置くものは、次の表のとおりです。",
    sections: [
      { heading: "端末に置くもの", blocks: [
        { kind: "table", caption: "PageCrate があなたの端末に置くもの", columns: ["置くもの", "置く場所と中身", "外への送信", "残る期間"], rows: [
          ["ポリシーの確認", `ブラウザーの保存領域（localStorage）に、${POLICY_ACK_STORAGE_NAME} という名前で、確認した版と日時を置きます。`, "どこにも送りません", "ブラウザーで消すまで。保存できないブラウザーでは、ページを開いている間だけ"],
          ["ボット確認（Cloudflare Turnstile）", UNOBSERVED_LABEL, UNOBSERVED_LABEL, UNOBSERVED_LABEL],
          ["そのほか", "ありません", "なし", "なし"],
        ] },
        p(`ボット確認は、解析を始めるときだけ読み込みます。Turnstile が端末に何を置くかは、まだ確かめていないため「${UNOBSERVED_LABEL}」と書いています。確かめたら、この表を更新します。`),
        p("分析や広告のための Cookie や仕組みは使いません。"),
      ] },
      { heading: "消すとき", blocks: [
        p("ブラウザーの設定でこのサイトのデータを消すと、ポリシーの確認も消えます。次に使うとき、もう一度確認をお願いします。"),
      ] },
    ],
  };
}

/** What the policy check shows before the first start (requirement 2.1). The full text is on /privacy. */
export const POLICY_SUMMARY: readonly string[] = [
  "入力したURLとページの内容は、Cloudflare の設備で処理します。運営者は保存しません。",
  `ログインはなく、氏名やメールアドレスも集めません。候補の一覧は${L.ticketMinutes}分で使えなくなります。`,
  "使いすぎを防ぐため、接続元を日替わりの鍵で縮めた値を、短い時間だけ使います。運営者はその値を保存しません。",
  "解析を始めるときは、ボット確認（Cloudflare Turnstile）のために、ブラウザーが Cloudflare と通信します。このとき、接続元（IPアドレス）などが Cloudflare に渡ります。",
  RIGHTS_SENTENCES.join(""),
  "この確認は、この端末の中だけに残します。運営者には送りません。",
];

/** All the words of a document in reading order, for checks and search. */
export function policyDocumentText(document: PolicyDocument): string {
  const blockText = (block: PolicyBlock): string[] => {
    switch (block.kind) {
      case "paragraph": return [block.parts.map(part => typeof part === "string" ? part : part.text).join("")];
      case "list": return [...block.items];
      case "facts": return block.items.map(item => `${item.term}：${item.detail}`);
      case "table": return [block.caption, block.columns.join(" / "), ...block.rows.map(row => row.join(" / "))];
    }
  };
  return [document.title, document.lead, ...document.sections.flatMap(section => [section.heading, ...section.blocks.flatMap(blockText)])].join("\n");
}
