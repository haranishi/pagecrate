# Cloudflare への配置

PageCrate は、Next.js を OpenNext で Cloudflare Workers に載せて動かします。データベースは使いません。この文書は、配置する運営者が手順の理由と落とし穴をつかむためのものです。配置の前後に運営者がする作業は、この文書と [運営の手順](operations.md) の最後の節ですべて挙げています。

## 使う Cloudflare の部品

| 部品 | 役割 |
|---|---|
| Workers（OpenNext） | 画面と API（解析・プレビュー・ZIP） |
| Browser Run | 対象のページを、サーバー上のブラウザーで描画する |
| Durable Object（1個） | 1日の描画回数を数える。利用者や素材の情報は持たない |
| Rate Limiting（3系統） | 解析・プレビュー・ZIP の、接続元ごとの回数制限 |
| Turnstile | 解析の前のボット確認 |

## 配置の前に決めること

**プラン**：Workers の Free は、1回の要求あたり CPU 10ms・サブリクエスト50までです。ZIP の作成が収まらない恐れがあるので、設計は Paid を前提にしています。Browser Run と Workers の Paid には自動の支出上限が無いため、請求の通知をダッシュボードで設定します。

**配置先のアカウント**：設定ファイルに `account_id` を書いていません。公開リポジトリにアカウントの識別子を入れないためです。配置先は、wrangler で認証を済ませているアカウントか、環境変数 `CLOUDFLARE_ACCOUNT_ID` で決まります。複数のアカウントに入れる人は、配置と秘密値の登録のたびに `CLOUDFLARE_ACCOUNT_ID` を必ず付けてください。付け忘れると、意図しないアカウントへ配置されることがあります。

**URL**：既定は `pagecrate.<your-subdomain>.workers.dev` です。Cloudflare の公式文書は本番に独自ドメインを勧めており、workers.dev を個人や趣味の用途向けの Free のサイトとして扱っています。公開サイトは、独自ドメインのホスト名で配置します。手元だけの設定ファイル（`wrangler.production.jsonc`。識別子が入るので Git に入れません）で `workers_dev` を `false` にし、`CLOUDFLARE_ACCOUNT_ID=<your-account-id> npx wrangler deploy --config wrangler.production.jsonc --domain <ホスト名> --secrets-file <秘密値のファイル>` で配置します。ホスト名の DNS と証明書は Cloudflare が作ります（Worker と同じアカウントにあるゾーンに限ります）。秘密値のファイルは、配置のあとに消します。

## Turnstile のウィジェット

Cloudflare のダッシュボードでウィジェットを作り、公開する URL のホスト名を登録します。Free はウィジェット1つにつきホスト名10件までで、親のドメインを登録すると、その下のサブドメインも含まれます。workers.dev のホスト名で使えるかは公式文書に記載が無く、未確認です。使えなければ独自ドメインへ移します。サイトキーと秘密鍵は、次の秘密値に入れます。本番の秘密鍵は、試験用の鍵で作ったトークンを断ります。

## 秘密値（7件）

値は Workers の Secrets にだけ置き、このリポジトリにも作業の記録にも書きません。7件のうち1件でも無いと、配置は失敗します。

| 名前 | 中身 |
|---|---|
| `PAGECRATE_PUBLIC_ORIGIN` | 公開する origin（`https://` で始まり、パスなし）。Origin の検査、ボット確認のホスト名の照合、共有用の URL の基準になる |
| `PAGECRATE_DAILY_RENDER_CAP` | 1日の描画回数の上限（1以上の整数） |
| `PAGECRATE_PAUSED` | 停止。止まらないのは `0` か `false` のときだけで、未設定や、`yes`・`on`・全角の `１` などの書き間違いは停止として読む。ふだんは `0` |
| `PAGECRATE_BLOCKED_HOSTS` | 取得を断るドメイン（カンマ区切り）。空にできないので、ふだんは `blocked.example` のような無害な値を入れる |
| `PAGECRATE_TICKET_SECRET` | チケットの署名鍵。32バイト以上の乱数にし、`.dev.vars.example` の値は使わない。回数制限の鍵の元にもなる |
| `PAGECRATE_TURNSTILE_SECRET` | Turnstile の秘密鍵 |
| `PAGECRATE_TURNSTILE_SITEKEY` | Turnstile のサイトキー（ブラウザーへ渡る公開の値） |

秘密でない設定まで Secrets に置くのには、理由が二つあります。公開 origin（workers.dev のサブドメインを含む）のような運営者ごとの値を公開リポジトリに入れないため、そしてコードを変えずに切り替えるためです。上限か公開 origin が正しくないと、実サイトの取得は閉じ、デモだけが動きます。チケット鍵が短すぎると、デモも保存できません。

`wrangler secret put <名前>` は新しい版を作り、その場で配置します。変えた値が全拠点で効くまでの時間は、まだ測っていません。停止の手順はこの時間を前提にするので、公開の前に測ります。

## 回数制限の名前空間の番号

`wrangler.jsonc` の回数制限は、名前空間の番号 8101〜8103 を使います。番号はアカウントの中で回数を共有する単位で、同じ番号を使う別の Worker とは数えが混ざります。アカウント内でほかと重ならないことを確かめてください。数えは Cloudflare の拠点ごとの近似で、厳密な上限ではありません。

## ログを止めてある理由

`observability` は無効にしてあります。プレビューの要求の URL にはチケットが入り、チケットからは素材の URL を読めます。ログが有効だと、想定外の例外がその URL ごと Cloudflare に数日残ります（Workers Logs の保持は Free で3日、Paid で7日）。障害は、保存されない `wrangler tail` で調べます（[運営の手順](operations.md)）。ログを有効に戻すときは、プライバシーポリシーを直して版を上げてください。

## 配置する

公開サイトは、権利と規約の確認が済むまで、停止の構成（`PAGECRATE_PAUSED` に `1`。デモだけが動く）で出すことをおすすめします（確認の前に開けるかどうかは、運営者が決めます）。そのあいだの Turnstile の鍵の扱いと再開の順番は、[運営の手順](operations.md) の「デモだけ公開する」の節にあります。

```sh
npm ci
npm test && WRANGLER_SEND_METRICS=false npm run typecheck && npm run lint
CLOUDFLARE_ACCOUNT_ID=<your-account-id> WRANGLER_SEND_METRICS=false npm run deploy
```

本番の前に、本番とは別名の Worker で実キーの確認をします（項目は [運営の手順](operations.md)）。別名で配置するときは、手元だけの設定ファイルを `opennextjs-cloudflare` の build と deploy に `--config` で渡し、Worker の名前、回数制限の名前空間の番号、自分自身を指す `WORKER_SELF_REFERENCE` の行き先を本番と別にします。番号を変えないと、本番と回数を共有します。その設定ファイルには識別子が入るので、Git に入れない名前にするか無視の設定に足します。

## 切り戻し

配置するたびに、配置した版と戻す先の版の ID を控えます（`wrangler deployments list`）。戻すのは `wrangler rollback <版の ID>` です。ただし公式文書によると、Durable Object のクラスを足したり消したりした前後をまたいでは戻せません。公開版の最初の配置は Durable Object を足すので、それより前の版へは戻れません。最初の配置で問題が出たら、停止するか配置を取り下げます。戻したときに秘密値がどの版の値になるかは公式文書に記載が無く、未確認です。
