# PageCrate

公開ページのURLを入れると、そのページの画像と動画の候補を一覧にし、選んだ素材を出典の記録つきのZIPで保存できるWebアプリです。ログインもアカウントも要りません。運営者は、入力されたURL・取得した素材・候補の一覧を保存しません。

**取得できても、素材を再利用してよいという許諾にはなりません。** 権利者の許諾と対象サイトの規約を確かめるのは、使う人です。

運営者の名称・問い合わせ先・権利者の申し立て窓口は、アプリの利用規約のページ（`/terms`）に載せています。このリポジトリのライセンスは MIT です。

## できること

- 公開された単一ページの img・picture・srcset・CSS背景・poster・video の source から候補を集める。短いスクロールで、遅れて読み込まれる画像も拾う
- 種類・名前・最小幅で絞り込み、画像はプレビューで確かめる
- 選んだ素材を変換せず、安全なIDと確かめた形式で名付け直してZIPにまとめる。ZIPの manifest には取得日時・出典ドメイン・素材ごとの成否を書き、秘密を含みうるURLのパス・クエリと元のファイル名は書かない
- 外部へ接続しないデモで、一覧から保存までを試す

iframe の中身、クリックした後に出る素材、複雑なCSS、ボット対策のあるURLや期限つきのURLは取りこぼすことがあります。動画は一覧で再生せず、原本を保存するだけです。ZIPの一部が失敗したときは、画面と manifest の両方に理由を出します。

## しないこと

複数ページの巡回、ログイン・有料の壁・CAPTCHA・DRM の回避、HLS・DASH・blob の動画の保存（検出して理由を示すだけ）、再利用してよいかの判定、外部のAIへの素材の送信はしません。アカウント・課金・管理画面もありません。

## なぜサーバーが取得を中継するのか

ブラウザーの JavaScript だけでは、多くのサイトのHTMLや素材のバイト列を読めません（CORS という制限）。ZIPを作るにはバイト列が要るので、取得は Cloudflare Workers（Cloudflare のサーバーでプログラムを動かす仕組み）が中継します。Chrome 拡張なら中継なしで作れますが、「URLを入れるだけ」の使い方とは別の製品になるので採りませんでした。

中継しても、結果は持ちません。解析した候補ごとに「チケット」（素材のURL・種類・期限を署名した文字列）を付けてブラウザーへ返し、プレビューとZIPはチケットを確かめてから素材を取り直します。結果を30分保管する案は、運営者の設備にデータが残るので捨てました。

## 手元で試す

Node.js 24 以降が要ります。手元のプレビューは、本番と同じ Workers の実行環境を手元で動かします。

```sh
npm ci
cp .dev.vars.example .dev.vars
npm run build:worker
npm run preview:worker -- --ip 127.0.0.1 --port 8787
```

ブラウザーで `http://127.0.0.1:8787/demo` を開きます。`localhost:8787` で開くと、公開 origin の設定とホスト名が合わず、API が403を返します。デモは外部のサービスなしで動きます（`.dev.vars` にある手元用のチケット鍵は要ります）。

公開サイトを運営するときは、権利と規約の確認が済むまで、実サイトの取得を止めた構成（`PAGECRATE_PAUSED=1`。デモだけが動く）で出すことをおすすめします。確認の前に開けるかどうかは、運営者が決めます。リスクは運営者が負います（[運営の手順](docs/operations.md)）。手元でその画面を見るときは、`.dev.vars` の `PAGECRATE_PAUSED` を `1` にします。

実際のサイトの解析には、Cloudflare Turnstile（ボット確認）の本物の鍵が要ります。`.dev.vars.example` の鍵は Cloudflare が公開している試験用です。公式の例では、試験用の鍵の検証結果はホスト名 `localhost`・action `test` になっており、このアプリの検査（公開 origin のホスト名と action `scan`）と合いません。そのため手元では実サイトの解析が通らない見込みです（未確認）。`npm run dev` と `next start` には Cloudflare の環境が無く、API は「混み合っています」を返します。画面の作業にだけ使えます。

wrangler を動かすコマンド（`build:worker`・`preview:worker`・`typecheck`・配置）に `WRANGLER_SEND_METRICS=false` を付けると、wrangler は匿名の利用統計を送りません。

## 一度に扱える量

1回の解析は候補200件・40秒まで、保存は1件25MiB、ZIP1つにつき合計100MiB・50件まで、プレビューは画像1枚2MiBまでです。候補の一覧は30分で使えなくなります。超えた分は打ち切るか保存の前に断り、理由を画面に出します。これらの値は利用規約とプライバシーポリシーの本文と同じ定数から来ていて、食い違うと単体試験が落ちます。

ほかに、接続元ごとの回数制限、1日の描画（解析）回数の上限、運営者による停止があります。値は運営者が決めます（[運営の手順](docs/operations.md)）。

## 安全の境界と、保存しない設計でも残るもの

取得先は、http(s) の標準ポートで公開されたアドレスだけに限ります。IPの直書き、名前解決の結果、転送のたびの転送先を確かめ、内部のアドレスなら取得しません。Cookie と認証情報は送りません。ページの描画は Cloudflare Browser Run（Cloudflare のサーバー上のブラウザー）で行いますが、ブラウザーの外向きの通信はすべて拒否する設定で開き、取得は Worker の検査つきの取得だけが行います。拒否の設定を確かめられないときは、解析を止めます。内部のURLを取得する設定は、公開された経路にありません。なお、Workers の `global_fetch_strictly_public` が接続の時点で内部アドレスを断るかは、公式文書に説明が無く未確認です。

チケットは期限の30分のあいだ何度でも使え、途中で取り消せません。止めるには署名の鍵を入れ替え、全部を無効にします。チケットを接続元に結び付けていないのは、回線が切り替わる人の保存を壊さないためです。中身は読める形のままなので、素材のURLを読めます。

保存しない設計でも、次のものは残ります。

- 運営者の設備：1日の描画回数（UTC の日付と回数だけ。7日分）
- 回数制限：接続元を日替わりの鍵で縮めた値。運営者は保存せず、Cloudflare の回数制限の仕組みがその値ごとの回数を1分間数える
- 利用者の端末：ポリシーを読んだという確認（localStorage の `pagecrate.policy`）。Cookie は使わない
- Cloudflare：ボット確認のとき、ブラウザーが接続元・ブラウザーの特徴・サイト名を Cloudflare へ送る。Cloudflare が自社の設備で持つ記録は、運営者の設定では止められない

アクセスとエラーの記録（Workers のログ）は止めてあります。障害は、保存されない `wrangler tail` で調べます。

## 開発

```sh
npm test                                        # 単体試験
WRANGLER_SEND_METRICS=false npm run typecheck   # 先に wrangler types で型を作る
npm run lint
npx playwright install chromium                 # E2E と録画の道具が使うブラウザー（初回だけ）
PAGECRATE_TEST_URL=http://127.0.0.1:8787 npm run test:e2e
```

E2E（ブラウザーを動かす試験）は、上の手順で起動した Workers プレビューに対して流します。既定の行き先の `next dev`（4381番）では API が動かないためです。Next.js 側のコードを変えたら、`npm run build:worker` からやり直します。E2E はボット確認のスクリプトと API を偽物に差し替えるので、本物の Turnstile は配置した Worker でしか確かめられません。

紹介動画は `node --import tsx scripts/record-tour.mjs`（Workers プレビューに対して録る。ffmpeg が要る）、共有用の画像は `node --import tsx scripts/make-og-image.mjs` で作り直せます。紹介動画は内蔵デモの実際の操作を録ったもので、同じ origin から配り、自動では再生せず、音声は無く、日本語の字幕が付きます。`fixtures/motion-study.webm` は ffmpeg の試験パターン（testsrc2）から作った2秒の動画で、デモの動画にも使っています。アプリの実行に ffmpeg は要りません。

`npm run hygiene`・`snapshot`・`release-gate`・`record:day` は、運営者が公開前に使う道具です（[公開前の点検](docs/release-hygiene.md)）。`release-gate` と `record:day` は、このリポジトリには含まれない作業用のフォルダ（`.kiro/`・`.agent-harness/`）を読み書きするので、このリポジトリのままでは使えません。

## 文書

- [製品の要件の要約](docs/requirements.md)：何をして、何をしないか
- [Cloudflare への配置](docs/deployment.md)：秘密値、Turnstile、プラン、切り戻し
- [運営の手順](docs/operations.md)：停止、上限、拒否ドメイン、悪用への対応
- [公開前の点検](docs/release-hygiene.md)：秘密と識別子の点検と、その記録
- [権利・規約・個人情報の確認結果](docs/rights-and-terms.md)：調べた範囲と未確認

## ライセンス

MIT ライセンスです。公開用のスナップショットを作る道具（`npm run snapshot`）が、`LICENSE`（著作権者は運営者の名称。決まっていないと未確定の印が入り、公開の関門が止めます）と、依存の第三者の表記 `THIRD_PARTY_NOTICES.md` を書き出します。依存のライセンスと同梱の素材の出どころは [docs/licenses-and-assets.md](docs/licenses-and-assets.md) にまとめました。
