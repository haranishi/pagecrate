# 第三者のソフトウェアと素材の表記

この文書は、`scripts/make-public-snapshot.mjs` が公開用のスナップショットを作るときに、`package-lock.json` と `node_modules` から機械的に作ったものです。手で直さず、道具を直して作り直してください。

## この一覧の範囲

- `package-lock.json` の開発用でない項目（`dev`・`devOptional` の印が無いもの）をすべて載せています。実際に配る物だけでなく、配らない物（配置の道具、ほかの端末向けの任意の部品など）も含む上位集合です。
- 閲覧者のブラウザーへ配る JavaScript と、Cloudflare で動く Worker の bundle に実際に入るパッケージの内訳は、まだ確かめていません（[docs/licenses-and-assets.md](docs/licenses-and-assets.md) の「未確認」）。
- ライセンスの文は、各パッケージの `node_modules/<パッケージ>/` にある `LICENSE*`（`LICENCE*`・`COPYING*` を含む）と `NOTICE*` のファイルから写しました。著作権の行を除いた本文が同じものは1つにまとめ、その本文の上に、当てはまるパッケージと各パッケージの著作権の行を並べています。本文と著作権の行を合わせたものが、各パッケージのファイルの文です。著作権の行として見分けられなかった記述は本文に残し、表には「本文を参照」と書いています。
- ライセンスのファイルが見つからないパッケージも、「全文なし」として一覧に残しています。

## 集計

- パッケージ：410件（本文あり 321件・全文なし 89件）
- 本文の種類：39種類
- NOTICE の種類：0種類

| ライセンス（package-lock.json の記載） | 件数 |
|---|---:|
| MIT | 241 |
| Apache-2.0 | 111 |
| ISC | 20 |
| LGPL-3.0-or-later | 10 |
| BlueOak-1.0.0 | 8 |
| BSD-3-Clause | 7 |
| Apache-2.0 AND LGPL-3.0-or-later | 3 |
| BSD-2-Clause | 3 |
| MIT OR Apache-2.0 | 3 |
| 0BSD | 1 |
| Apache-2.0 AND LGPL-3.0-or-later AND MIT | 1 |
| CC-BY-4.0 | 1 |
| CC0-1.0 | 1 |

## このリポジトリが含む第三者のコード

`scripts/hygiene.mjs` は、hundred-days（https://github.com/haranishi/hundred-days）の `scripts/precheck.mjs` を複製して直した道具です。複製元のリポジトリの LICENSE は、ソースコードを MIT ライセンスとし、`day-*/data/` などの第三者のデータだけを対象外にしています。`scripts/precheck.mjs` はソースコードなので MIT です。次は、その LICENSE の MIT の部分をそのまま写したものです。

```text
MIT License

Copyright (c) 2026 haranishi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 同梱の書体と素材

- 書体のファイル：同梱していません（この道具が木の中を調べ、woff・woff2・ttf・otf・eot・ttc のファイルが無いことを確かめました）
- 画像・動画・音声・字幕のファイル：7件。出どころは [docs/licenses-and-assets.md](docs/licenses-and-assets.md) の「同梱の素材の出どころ」にまとめています。この道具は、その文書にファイルかフォルダの名前があるかだけを確かめます。

| ファイル | 出どころの記載 |
|---|---|
| `fixtures/motion-study.webm` | あり |
| `public/og.png` | あり |
| `public/tour/pagecrate-tour-poster.webp` | あり |
| `public/tour/pagecrate-tour.ja.vtt` | あり |
| `public/tour/pagecrate-tour.mp4` | あり |
| `public/tour/pagecrate-tour.webm` | あり |
| `src/app/icon.svg` | あり |

## 全文なし

ライセンスのファイルが見つからなかったパッケージです（89件。この端末の `node_modules` に無いもの 69件・ファイルが無いもの 20件）。

| パッケージ | 版 | ライセンス | 理由 | 備考 |
|---|---|---|---|---|
| `@ast-grep/napi-darwin-arm64` | 0.45.3 | MIT | node_modules にライセンスのファイルが無い | — |
| `@ast-grep/napi-darwin-x64` | 0.45.3 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@ast-grep/napi-linux-arm64-gnu` | 0.45.3 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@ast-grep/napi-linux-arm64-musl` | 0.45.3 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@ast-grep/napi-linux-x64-gnu` | 0.45.3 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@ast-grep/napi-linux-x64-musl` | 0.45.3 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@ast-grep/napi-win32-arm64-msvc` | 0.45.3 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@ast-grep/napi-win32-ia32-msvc` | 0.45.3 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@ast-grep/napi-win32-x64-msvc` | 0.45.3 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@aws-sdk/credential-provider-http` | 3.972.76 | Apache-2.0 | node_modules にライセンスのファイルが無い | — |
| `@aws-sdk/credential-provider-login` | 3.972.81 | Apache-2.0 | node_modules にライセンスのファイルが無い | — |
| `@aws-sdk/nested-clients` | 3.997.48 | Apache-2.0 | node_modules にライセンスのファイルが無い | — |
| `@cloudflare/kv-asset-handler` | 0.5.0 | MIT OR Apache-2.0 | node_modules にライセンスのファイルが無い | — |
| `@cloudflare/playwright` | 1.3.6 | Apache-2.0 | node_modules にライセンスのファイルが無い | — |
| `@cloudflare/unenv-preset` | 2.16.2 | MIT OR Apache-2.0 | node_modules にライセンスのファイルが無い | — |
| `@cloudflare/workerd-darwin-64` | 1.20261023.1 | Apache-2.0 | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@cloudflare/workerd-darwin-arm64` | 1.20261023.1 | Apache-2.0 | node_modules にライセンスのファイルが無い | — |
| `@cloudflare/workerd-linux-64` | 1.20261023.1 | Apache-2.0 | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@cloudflare/workerd-linux-arm64` | 1.20261023.1 | Apache-2.0 | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@cloudflare/workerd-windows-64` | 1.20261023.1 | Apache-2.0 | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@emnapi/runtime` | 1.11.3 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/aix-ppc64` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/android-arm` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/android-arm64` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/android-x64` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/darwin-arm64` | 0.28.2 | MIT | node_modules にライセンスのファイルが無い | — |
| `@esbuild/darwin-x64` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/freebsd-arm64` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/freebsd-x64` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/linux-arm` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/linux-arm64` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/linux-ia32` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/linux-loong64` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/linux-mips64el` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/linux-ppc64` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/linux-riscv64` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/linux-s390x` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/linux-x64` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/netbsd-arm64` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/netbsd-x64` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/openbsd-arm64` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/openbsd-x64` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/openharmony-arm64` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/sunos-x64` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/win32-arm64` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/win32-ia32` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@esbuild/win32-x64` | 0.28.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@img/sharp-darwin-x64` | 0.35.5 | Apache-2.0 | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@img/sharp-freebsd-wasm32` | 0.35.5 | Apache-2.0 | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@img/sharp-libvips-darwin-arm64` | 1.3.4 | LGPL-3.0-or-later | node_modules にライセンスのファイルが無い | 配らない：sharp の任意のネイティブ部品（画像処理の libvips）。公開リポジトリは node\_modules を含まず、Worker の bundle にも入らない見込み（内訳は未確認）。配るなら LGPL-3.0 の条件に従った表示と提供が要る |
| `@img/sharp-libvips-darwin-x64` | 1.3.4 | LGPL-3.0-or-later | この端末の node_modules に無い（ほかの端末向けの任意の部品） | 配らない：sharp の任意のネイティブ部品（画像処理の libvips）。公開リポジトリは node\_modules を含まず、Worker の bundle にも入らない見込み（内訳は未確認）。配るなら LGPL-3.0 の条件に従った表示と提供が要る |
| `@img/sharp-libvips-linux-arm` | 1.3.4 | LGPL-3.0-or-later | この端末の node_modules に無い（ほかの端末向けの任意の部品） | 配らない：sharp の任意のネイティブ部品（画像処理の libvips）。公開リポジトリは node\_modules を含まず、Worker の bundle にも入らない見込み（内訳は未確認）。配るなら LGPL-3.0 の条件に従った表示と提供が要る |
| `@img/sharp-libvips-linux-arm64` | 1.3.4 | LGPL-3.0-or-later | この端末の node_modules に無い（ほかの端末向けの任意の部品） | 配らない：sharp の任意のネイティブ部品（画像処理の libvips）。公開リポジトリは node\_modules を含まず、Worker の bundle にも入らない見込み（内訳は未確認）。配るなら LGPL-3.0 の条件に従った表示と提供が要る |
| `@img/sharp-libvips-linux-ppc64` | 1.3.4 | LGPL-3.0-or-later | この端末の node_modules に無い（ほかの端末向けの任意の部品） | 配らない：sharp の任意のネイティブ部品（画像処理の libvips）。公開リポジトリは node\_modules を含まず、Worker の bundle にも入らない見込み（内訳は未確認）。配るなら LGPL-3.0 の条件に従った表示と提供が要る |
| `@img/sharp-libvips-linux-riscv64` | 1.3.4 | LGPL-3.0-or-later | この端末の node_modules に無い（ほかの端末向けの任意の部品） | 配らない：sharp の任意のネイティブ部品（画像処理の libvips）。公開リポジトリは node\_modules を含まず、Worker の bundle にも入らない見込み（内訳は未確認）。配るなら LGPL-3.0 の条件に従った表示と提供が要る |
| `@img/sharp-libvips-linux-s390x` | 1.3.4 | LGPL-3.0-or-later | この端末の node_modules に無い（ほかの端末向けの任意の部品） | 配らない：sharp の任意のネイティブ部品（画像処理の libvips）。公開リポジトリは node\_modules を含まず、Worker の bundle にも入らない見込み（内訳は未確認）。配るなら LGPL-3.0 の条件に従った表示と提供が要る |
| `@img/sharp-libvips-linux-x64` | 1.3.4 | LGPL-3.0-or-later | この端末の node_modules に無い（ほかの端末向けの任意の部品） | 配らない：sharp の任意のネイティブ部品（画像処理の libvips）。公開リポジトリは node\_modules を含まず、Worker の bundle にも入らない見込み（内訳は未確認）。配るなら LGPL-3.0 の条件に従った表示と提供が要る |
| `@img/sharp-libvips-linuxmusl-arm64` | 1.3.4 | LGPL-3.0-or-later | この端末の node_modules に無い（ほかの端末向けの任意の部品） | 配らない：sharp の任意のネイティブ部品（画像処理の libvips）。公開リポジトリは node\_modules を含まず、Worker の bundle にも入らない見込み（内訳は未確認）。配るなら LGPL-3.0 の条件に従った表示と提供が要る |
| `@img/sharp-libvips-linuxmusl-x64` | 1.3.4 | LGPL-3.0-or-later | この端末の node_modules に無い（ほかの端末向けの任意の部品） | 配らない：sharp の任意のネイティブ部品（画像処理の libvips）。公開リポジトリは node\_modules を含まず、Worker の bundle にも入らない見込み（内訳は未確認）。配るなら LGPL-3.0 の条件に従った表示と提供が要る |
| `@img/sharp-linux-arm` | 0.35.5 | Apache-2.0 | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@img/sharp-linux-arm64` | 0.35.5 | Apache-2.0 | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@img/sharp-linux-ppc64` | 0.35.5 | Apache-2.0 | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@img/sharp-linux-riscv64` | 0.35.5 | Apache-2.0 | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@img/sharp-linux-s390x` | 0.35.5 | Apache-2.0 | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@img/sharp-linux-x64` | 0.35.5 | Apache-2.0 | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@img/sharp-linuxmusl-arm64` | 0.35.5 | Apache-2.0 | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@img/sharp-linuxmusl-x64` | 0.35.5 | Apache-2.0 | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@img/sharp-wasm32` | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later AND MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | 配らない：sharp の任意のネイティブ部品（画像処理の libvips）。公開リポジトリは node\_modules を含まず、Worker の bundle にも入らない見込み（内訳は未確認）。配るなら LGPL-3.0 の条件に従った表示と提供が要る |
| `@img/sharp-webcontainers-wasm32` | 0.35.5 | Apache-2.0 | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@img/sharp-win32-arm64` | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | この端末の node_modules に無い（ほかの端末向けの任意の部品） | 配らない：sharp の任意のネイティブ部品（画像処理の libvips）。公開リポジトリは node\_modules を含まず、Worker の bundle にも入らない見込み（内訳は未確認）。配るなら LGPL-3.0 の条件に従った表示と提供が要る |
| `@img/sharp-win32-ia32` | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | この端末の node_modules に無い（ほかの端末向けの任意の部品） | 配らない：sharp の任意のネイティブ部品（画像処理の libvips）。公開リポジトリは node\_modules を含まず、Worker の bundle にも入らない見込み（内訳は未確認）。配るなら LGPL-3.0 の条件に従った表示と提供が要る |
| `@img/sharp-win32-x64` | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | この端末の node_modules に無い（ほかの端末向けの任意の部品） | 配らない：sharp の任意のネイティブ部品（画像処理の libvips）。公開リポジトリは node\_modules を含まず、Worker の bundle にも入らない見込み（内訳は未確認）。配るなら LGPL-3.0 の条件に従った表示と提供が要る |
| `@next/env` | 16.4.2 | MIT | node_modules にライセンスのファイルが無い | — |
| `@next/swc-darwin-arm64` | 16.4.2 | MIT | node_modules にライセンスのファイルが無い | — |
| `@next/swc-darwin-x64` | 16.4.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@next/swc-linux-arm64-gnu` | 16.4.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@next/swc-linux-arm64-musl` | 16.4.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@next/swc-linux-x64-gnu` | 16.4.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@next/swc-linux-x64-musl` | 16.4.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@next/swc-win32-arm64-msvc` | 16.4.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `@next/swc-win32-x64-msvc` | 16.4.2 | MIT | この端末の node_modules に無い（ほかの端末向けの任意の部品） | — |
| `client-only` | 0.0.1 | MIT | node_modules にライセンスのファイルが無い | — |
| `eastasianwidth` | 0.2.0 | MIT | node_modules にライセンスのファイルが無い | — |
| `imurmurhash` | 0.1.4 | MIT | node_modules にライセンスのファイルが無い | — |
| `miniflare` | 5.20261023.3-beta | MIT | node_modules にライセンスのファイルが無い | — |
| `tr46` | 0.0.3 | MIT | node_modules にライセンスのファイルが無い | — |
| `undici-types` | 5.26.5 | MIT | node_modules にライセンスのファイルが無い | — |
| `workerd` | 1.20261023.1 | Apache-2.0 | node_modules にライセンスのファイルが無い | — |
| `wrangler` | 4.156.0 | MIT OR Apache-2.0 | node_modules にライセンスのファイルが無い | — |

## 本文ごとのパッケージ

### 本文 1（MIT・81件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `@ast-grep/napi` | 0.45.3 | MIT | Copyright (c) 2020 N-API for Rust | — |
| `@node-minify/core` | 9.0.2 | MIT | Copyright (c) 2024 Rodolphe Stoclin | — |
| `@node-minify/terser` | 9.0.1 | MIT | Copyright (c) 2024 Rodolphe Stoclin | — |
| `@node-minify/utils` | 9.0.1 | MIT | Copyright (c) 2024 Rodolphe Stoclin | — |
| `@opennextjs/aws` | 4.1.11 | MIT | Copyright (c) 2022 SST | — |
| `@sindresorhus/is` | 7.2.0 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `abort-controller` | 3.0.0 | MIT | Copyright (c) 2017 Toru Nagashima | — |
| `acorn` | 8.18.0 | MIT | Copyright (C) 2012-2022 by various contributors (see AUTHORS) | — |
| `ansi-regex` | 5.0.1 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (sindresorhus.com) | — |
| `ansi-regex` | 6.4.0 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `ansi-regex` | 6.4.0 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `ansi-regex` | 6.4.0 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `ansi-regex` | 6.5.0 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `ansi-styles` | 4.3.0 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (sindresorhus.com) | — |
| `ansi-styles` | 6.2.3 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `ansi-styles` | 6.2.3 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `blake3-wasm` | 2.1.5 | MIT | Copyright (c) 2019 Connor Peet | — |
| `brace-expansion` | 2.1.7 | MIT | Copyright (c) 2013 Julian Gruber &lt;julian@juliangruber.com&gt; | — |
| `buffer-from` | 1.1.2 | MIT | Copyright (c) 2016, 2018 Linus Unnebäck | — |
| `call-bind-apply-helpers` | 1.0.2 | MIT | Copyright (c) 2024 Jordan Harband | — |
| `call-bound` | 1.0.4 | MIT | Copyright (c) 2024 Jordan Harband | — |
| `chalk` | 5.6.2 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `dunder-proto` | 1.0.1 | MIT | Copyright (c) 2024 ECMAScript Shims | — |
| `error-stack-parser-es` | 1.0.5 | MIT | Copyright (c) 2023-PRESENT Anthony Fu &lt;https://github.com/antfu&gt;<br>Copyright (c) 2017 Eric Wendelin and other contributors | — |
| `es-define-property` | 1.0.1 | MIT | Copyright (c) 2024 Jordan Harband | — |
| `es-errors` | 1.3.0 | MIT | Copyright (c) 2024 Jordan Harband | — |
| `es-object-atoms` | 1.1.2 | MIT | Copyright (c) 2024 Jordan Harband | — |
| `es-set-tostringtag` | 2.1.0 | MIT | Copyright (c) 2022 ECMAScript Shims | — |
| `esbuild` | 0.28.2 | MIT | Copyright (c) 2020 Evan Wallace | — |
| `escalade` | 3.2.0 | MIT | Copyright (c) Luke Edwards &lt;luke.edwards05@gmail.com&gt; (lukeed.com) | — |
| `fflate` | 0.8.3 | MIT | Copyright (c) 2026 Arjun Barrett | — |
| `get-east-asian-width` | 1.7.0 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `get-intrinsic` | 1.3.0 | MIT | Copyright (c) 2020 Jordan Harband | — |
| `get-proto` | 1.0.1 | MIT | Copyright (c) 2025 Jordan Harband | — |
| `gopd` | 1.2.0 | MIT | Copyright (c) 2022 Jordan Harband | — |
| `gzip-size` | 6.0.0 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `has-symbols` | 1.1.0 | MIT | Copyright (c) 2016 Jordan Harband | — |
| `has-tostringtag` | 1.0.2 | MIT | Copyright (c) 2021 Inspect JS | — |
| `hasown` | 2.0.4 | MIT | Copyright (c) Jordan Harband and contributors | — |
| `is-fullwidth-code-point` | 3.0.0 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (sindresorhus.com) | — |
| `math-intrinsics` | 1.1.0 | MIT | Copyright (c) 2024 ECMAScript Shims | — |
| `merge-descriptors` | 2.0.0 | MIT | Copyright (c) Jonathan Ong &lt;me@jongleberry.com&gt;<br>Copyright (c) Douglas Christopher Wilson &lt;doug@somethingdoug.com&gt;<br>Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `node-domexception` | 1.0.0 | MIT | Copyright (c) 2021 Jimmy Wärting | — |
| `object-inspect` | 1.13.4 | MIT | Copyright (c) 2013 James Halliday | — |
| `path-key` | 3.1.1 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (sindresorhus.com) | — |
| `react` | 19.3.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. | — |
| `react-dom` | 19.3.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. | — |
| `safer-buffer` | 2.1.2 | MIT | Copyright (c) 2018 Nikita Skovoroda &lt;chalkerx@gmail.com&gt; | — |
| `scheduler` | 0.28.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. | — |
| `shebang-command` | 2.0.0 | MIT | Copyright (c) Kevin Mårtensson &lt;kevinmartensson@gmail.com&gt; (github.com/kevva) | — |
| `shebang-regex` | 3.0.0 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (sindresorhus.com) | — |
| `side-channel` | 1.1.1 | MIT | Copyright (c) 2019 Jordan Harband | — |
| `side-channel-list` | 1.0.1 | MIT | Copyright (c) 2024 Jordan Harband | — |
| `side-channel-map` | 1.0.1 | MIT | Copyright (c) 2024 Jordan Harband | — |
| `side-channel-weakmap` | 1.0.2 | MIT | Copyright (c) 2019 Jordan Harband | — |
| `string-width` | 4.2.3 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (sindresorhus.com) | — |
| `string-width` | 4.2.3 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (sindresorhus.com) | — |
| `string-width` | 5.1.2 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `string-width` | 7.2.0 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `string-width` | 7.2.0 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `string-width` | 8.3.0 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `strip-ansi` | 6.0.1 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (sindresorhus.com) | — |
| `strip-ansi` | 6.0.1 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (sindresorhus.com) | — |
| `strip-ansi` | 7.2.0 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `strip-ansi` | 7.2.0 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `strip-ansi` | 7.2.0 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `strip-ansi` | 7.2.0 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `styled-jsx` | 5.1.6 | MIT | Copyright (c) 2016-present Vercel, Inc. | — |
| `supports-color` | 10.2.2 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `toidentifier` | 1.0.1 | MIT | Copyright (c) 2016 Douglas Christopher Wilson &lt;doug@somethingdoug.com&gt; | — |
| `ts-tqdm` | 0.8.6 | MIT | Copyright (c) 2023 Leandro Del'Arco | — |
| `undici` | 6.29.1 | MIT | Copyright (c) Matteo Collina and Undici contributors | — |
| `undici` | 7.30.1 | MIT | Copyright (c) Matteo Collina and Undici contributors | — |
| `undici-types` | 8.9.0 | MIT | Copyright (c) Matteo Collina and Undici contributors | — |
| `unenv` | 2.0.0-rc.24 | MIT | Copyright (c) Pooya Parsa &lt;pooya@pi0.io&gt; | — |
| `wrap-ansi` | 7.0.0 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `wrap-ansi` | 8.1.0 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `wrap-ansi` | 9.0.2 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `yargs` | 18.2.0 | MIT | Copyright 2010 James Halliday (mail@substack.net); Modified work Copyright 2014 Contributors (ben@npmjs.com) | — |
| `yocto-spinner` | 1.2.2 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |
| `yoctocolors` | 2.2.0 | MIT | Copyright (c) Sindre Sorhus &lt;sindresorhus@gmail.com&gt; (https://sindresorhus.com) | — |

```text
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 本文 2（Apache-2.0・77件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `@aws-sdk/checksums` | 3.1001.3 | Apache-2.0 | Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/client-cloudfront` | 3.984.0 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/client-dynamodb` | 3.984.0 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/client-lambda` | 3.984.0 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/client-s3` | 3.984.0 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/client-sqs` | 3.984.0 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/credential-provider-env` | 3.972.74 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/credential-provider-ini` | 3.973.19 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/credential-provider-node` | 3.972.86 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/credential-provider-process` | 3.972.74 | Apache-2.0 | Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/credential-provider-sso` | 3.973.18 | Apache-2.0 | Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/credential-provider-web-identity` | 3.972.80 | Apache-2.0 | Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/dynamodb-codec` | 3.973.48 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/endpoint-cache` | 3.972.11 | Apache-2.0 | Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/middleware-bucket-endpoint` | 3.972.52 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/middleware-endpoint-discovery` | 3.972.32 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/middleware-expect-continue` | 3.972.48 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/middleware-flexible-checksums` | 3.974.58 | Apache-2.0 | Copyright 2018-2022 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/middleware-host-header` | 3.972.49 | Apache-2.0 | Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/middleware-location-constraint` | 3.972.45 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/middleware-logger` | 3.972.48 | Apache-2.0 | Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/middleware-recursion-detection` | 3.972.50 | Apache-2.0 | Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/middleware-sdk-s3` | 3.972.79 | Apache-2.0 | Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/middleware-sdk-sqs` | 3.972.44 | Apache-2.0 | Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/middleware-ssec` | 3.972.45 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/middleware-user-agent` | 3.972.78 | Apache-2.0 | Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/region-config-resolver` | 3.972.52 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/signature-v4-multi-region` | 3.984.0 | Apache-2.0 | Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/signature-v4-multi-region` | 3.996.48 | Apache-2.0 | Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/signature-v4-multi-region` | 3.996.48 | Apache-2.0 | Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/token-providers` | 3.1150.0 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/types` | 3.974.6 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/util-endpoints` | 3.984.0 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/util-locate-window` | 3.965.10 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/util-user-agent-browser` | 3.972.49 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/util-user-agent-node` | 3.973.64 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@aws-sdk/xml-builder` | 3.972.41 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/config-resolver` | 4.7.2 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/core` | 3.36.0 | Apache-2.0 | Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/credential-provider-imds` | 4.5.2 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/eventstream-serde-browser` | 4.5.2 | Apache-2.0 | Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/eventstream-serde-config-resolver` | 4.6.2 | Apache-2.0 | Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/eventstream-serde-node` | 4.5.2 | Apache-2.0 | Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/fetch-http-handler` | 5.8.0 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/hash-blob-browser` | 4.5.2 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/hash-node` | 4.5.2 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/hash-stream-node` | 4.5.2 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/invalid-dependency` | 4.5.2 | Apache-2.0 | Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/is-array-buffer` | 2.2.0 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/md5-js` | 4.5.2 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/middleware-content-length` | 4.5.2 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/middleware-endpoint` | 4.7.2 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/middleware-retry` | 4.8.2 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/middleware-serde` | 4.5.2 | Apache-2.0 | Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/middleware-stack` | 4.5.2 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/node-config-provider` | 4.6.2 | Apache-2.0 | Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/node-http-handler` | 4.12.1 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/protocol-http` | 5.6.2 | Apache-2.0 | Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/signature-v4` | 5.7.4 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/smithy-client` | 4.15.2 | Apache-2.0 | Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/types` | 4.19.0 | Apache-2.0 | Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/url-parser` | 4.5.2 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/util-base64` | 4.6.2 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/util-body-length-browser` | 4.5.2 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/util-body-length-node` | 4.5.2 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/util-buffer-from` | 2.2.0 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/util-defaults-mode-browser` | 4.6.2 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/util-defaults-mode-node` | 4.5.2 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/util-endpoints` | 3.7.2 | Apache-2.0 | Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/util-middleware` | 4.5.2 | Apache-2.0 | Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/util-retry` | 4.6.2 | Apache-2.0 | Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/util-stream` | 4.8.2 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/util-utf8` | 2.3.0 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/util-utf8` | 2.3.0 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/util-utf8` | 2.3.0 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/util-utf8` | 4.5.2 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@smithy/util-waiter` | 4.6.2 | Apache-2.0 | Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |

```text
                                Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "{}"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

### 本文 3（MIT・34件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `accepts` | 2.0.0 | MIT | Copyright (c) 2014 Jonathan Ong &lt;me@jongleberry.com&gt;<br>Copyright (c) 2015 Douglas Christopher Wilson &lt;doug@somethingdoug.com&gt; | — |
| `body-parser` | 2.4.0 | MIT | Copyright (c) 2014 Jonathan Ong &lt;me@jongleberry.com&gt;<br>Copyright (c) 2014-2015 Douglas Christopher Wilson &lt;doug@somethingdoug.com&gt; | — |
| `bytes` | 3.1.2 | MIT | Copyright (c) 2012-2014 TJ Holowaychuk &lt;tj@vision-media.ca&gt;<br>Copyright (c) 2015 Jed Watson &lt;jed.watson@me.com&gt; | — |
| `commander` | 2.20.3 | MIT | Copyright (c) 2011 TJ Holowaychuk &lt;tj@vision-media.ca&gt; | — |
| `content-disposition` | 2.0.1 | MIT | Copyright (c) 2014-2017 Douglas Christopher Wilson | — |
| `content-type` | 2.1.0 | MIT | Copyright (c) 2015 Douglas Christopher Wilson | — |
| `cookie` | 0.7.2 | MIT | Copyright (c) 2012-2014 Roman Shtylman &lt;shtylman@gmail.com&gt;<br>Copyright (c) 2015 Douglas Christopher Wilson &lt;doug@somethingdoug.com&gt; | — |
| `cookie` | 1.1.1 | MIT | Copyright (c) 2012-2014 Roman Shtylman &lt;shtylman@gmail.com&gt;<br>Copyright (c) 2015 Douglas Christopher Wilson &lt;doug@somethingdoug.com&gt; | — |
| `cookie-signature` | 1.2.2 | MIT | Copyright (c) 2012–2024 LearnBoost &lt;tj@learnboost.com&gt; and other contributors; | — |
| `debug` | 4.4.3 | MIT | Copyright (c) 2014-2017 TJ Holowaychuk &lt;tj@vision-media.ca&gt;<br>Copyright (c) 2018-2021 Josh Junon | — |
| `depd` | 2.0.0 | MIT | Copyright (c) 2014-2018 Douglas Christopher Wilson | — |
| `encodeurl` | 2.0.0 | MIT | Copyright (c) 2016 Douglas Christopher Wilson | — |
| `escape-html` | 1.0.3 | MIT | Copyright (c) 2012-2013 TJ Holowaychuk<br>Copyright (c) 2015 Andreas Lubbe<br>Copyright (c) 2015 Tiancheng "Timothy" Gu | — |
| `etag` | 1.8.1 | MIT | Copyright (c) 2014-2016 Douglas Christopher Wilson | — |
| `express` | 5.3.0 | MIT | Copyright (c) 2009-2014 TJ Holowaychuk &lt;tj@vision-media.ca&gt;<br>Copyright (c) 2013-2014 Roman Shtylman &lt;shtylman+expressjs@gmail.com&gt;<br>Copyright (c) 2014-2015 Douglas Christopher Wilson &lt;doug@somethingdoug.com&gt; | — |
| `finalhandler` | 2.1.1 | MIT | Copyright (c) 2014-2022 Douglas Christopher Wilson &lt;doug@somethingdoug.com&gt; | — |
| `forwarded` | 0.2.0 | MIT | Copyright (c) 2014-2017 Douglas Christopher Wilson | — |
| `fresh` | 2.0.0 | MIT | Copyright (c) 2012 TJ Holowaychuk &lt;tj@vision-media.ca&gt;<br>Copyright (c) 2016-2017 Douglas Christopher Wilson &lt;doug@somethingdoug.com&gt; | — |
| `media-typer` | 1.1.1 | MIT | Copyright (c) 2014-2017 Douglas Christopher Wilson | — |
| `mime-db` | 1.52.0 | MIT | Copyright (c) 2014 Jonathan Ong &lt;me@jongleberry.com&gt;<br>Copyright (c) 2015-2022 Douglas Christopher Wilson &lt;doug@somethingdoug.com&gt; | — |
| `mime-db` | 1.54.0 | MIT | Copyright (c) 2014 Jonathan Ong &lt;me@jongleberry.com&gt;<br>Copyright (c) 2015-2022 Douglas Christopher Wilson &lt;doug@somethingdoug.com&gt; | — |
| `mime-types` | 2.1.35 | MIT | Copyright (c) 2014 Jonathan Ong &lt;me@jongleberry.com&gt;<br>Copyright (c) 2015 Douglas Christopher Wilson &lt;doug@somethingdoug.com&gt; | — |
| `mime-types` | 3.0.2 | MIT | Copyright (c) 2014 Jonathan Ong &lt;me@jongleberry.com&gt;<br>Copyright (c) 2015 Douglas Christopher Wilson &lt;doug@somethingdoug.com&gt; | — |
| `negotiator` | 1.1.0 | MIT | Copyright (c) 2012-2014 Federico Romero<br>Copyright (c) 2012-2014 Isaac Z. Schlueter<br>Copyright (c) 2014-2015 Douglas Christopher Wilson | — |
| `on-finished` | 2.4.1 | MIT | Copyright (c) 2013 Jonathan Ong &lt;me@jongleberry.com&gt;<br>Copyright (c) 2014 Douglas Christopher Wilson &lt;doug@somethingdoug.com&gt; | — |
| `parseurl` | 1.3.3 | MIT | Copyright (c) 2014 Jonathan Ong &lt;me@jongleberry.com&gt;<br>Copyright (c) 2014-2017 Douglas Christopher Wilson &lt;doug@somethingdoug.com&gt; | — |
| `proxy-addr` | 2.0.8 | MIT | Copyright (c) 2014-2016 Douglas Christopher Wilson | — |
| `range-parser` | 1.3.0 | MIT | Copyright (c) 2012-2014 TJ Holowaychuk &lt;tj@vision-media.ca&gt;<br>Copyright (c) 2015-2016 Douglas Christopher Wilson &lt;doug@somethingdoug.com | — |
| `router` | 2.2.0 | MIT | Copyright (c) 2013 Roman Shtylman<br>Copyright (c) 2014-2022 Douglas Christopher Wilson | — |
| `send` | 1.2.1 | MIT | Copyright (c) 2012 TJ Holowaychuk<br>Copyright (c) 2014-2022 Douglas Christopher Wilson | — |
| `serve-static` | 2.2.1 | MIT | Copyright (c) 2010 Sencha Inc.<br>Copyright (c) 2011 LearnBoost<br>Copyright (c) 2011 TJ Holowaychuk<br>Copyright (c) 2014-2016 Douglas Christopher Wilson | — |
| `type-is` | 2.1.0 | MIT | Copyright (c) 2014 Jonathan Ong &lt;me@jongleberry.com&gt;<br>Copyright (c) 2014-2015 Douglas Christopher Wilson &lt;doug@somethingdoug.com&gt; | — |
| `unpipe` | 1.0.0 | MIT | Copyright (c) 2015 Douglas Christopher Wilson &lt;doug@somethingdoug.com&gt; | — |
| `vary` | 1.1.2 | MIT | Copyright (c) 2014-2017 Douglas Christopher Wilson | — |

```text
(The MIT License)

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

### 本文 4（MIT・27件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `@cspotcode/source-map-support` | 0.8.1 | MIT | Copyright (c) 2014 Evan Wallace | — |
| `ansi-colors` | 4.1.3 | MIT | Copyright (c) 2015-present, Brian Woodward. | — |
| `asynckit` | 0.4.0 | MIT | Copyright (c) 2016 Alex Indigo | — |
| `ci-info` | 4.4.0 | MIT | Copyright (c) 2016 Thomas Watson Steen | — |
| `color-name` | 1.1.4 | MIT | Copyright (c) 2015 Dmitry Ivanov | — |
| `cross-spawn` | 7.0.6 | MIT | Copyright (c) 2018 Made With MOXY Lda &lt;hello@moxy.studio&gt; | — |
| `ee-first` | 1.1.1 | MIT | Copyright (c) 2014 Jonathan Ong me@jongleberry.com | — |
| `enquirer` | 2.4.1 | MIT | Copyright (c) 2016-present, Jon Schlinkert. | — |
| `event-target-shim` | 5.0.1 | MIT | Copyright (c) 2015 Toru Nagashima | — |
| `form-data-encoder` | 1.7.2 | MIT | Copyright (c) 2021-present Nick K. | — |
| `formdata-node` | 4.4.1 | MIT | Copyright (c) 2017-present Nick K. | — |
| `http-errors` | 2.0.1 | MIT | Copyright (c) 2014 Jonathan Ong me@jongleberry.com<br>Copyright (c) 2016 Douglas Christopher Wilson doug@somethingdoug.com | — |
| `kleur` | 4.1.5 | MIT | Copyright (c) Luke Edwards &lt;luke.edwards05@gmail.com&gt; (lukeed.com) | — |
| `mnemonist` | 0.38.3 | MIT | Copyright (c) 2016 Guillaume Plique (Yomguithereal) | — |
| `ms` | 2.1.3 | MIT | Copyright (c) 2020 Vercel, Inc. | — |
| `nanoid` | 3.3.19 | MIT | Copyright 2017 Andrey Sitnik &lt;andrey@sitnik.ru&gt; | — |
| `next` | 16.4.2 | MIT | Copyright (c) 2025 Vercel, Inc. | — |
| `node-fetch` | 2.7.0 | MIT | Copyright (c) 2016 David Frank | — |
| `obliterator` | 1.6.1 | MIT | Copyright (c) 2017 Guillaume Plique (Yomguithereal) | — |
| `path-to-regexp` | 6.3.0 | MIT | Copyright (c) 2014 Blake Embrey (hello@blakeembrey.com) | — |
| `path-to-regexp` | 8.4.2 | MIT | Copyright (c) 2014 Blake Embrey (hello@blakeembrey.com) | — |
| `postcss` | 8.5.23 | MIT | Copyright 2013 Andrey Sitnik &lt;andrey@sitnik.es&gt; | — |
| `raw-body` | 3.0.2 | MIT | Copyright (c) 2013-2014 Jonathan Ong &lt;me@jongleberry.com&gt;<br>Copyright (c) 2014-2022 Douglas Christopher Wilson &lt;doug@somethingdoug.com&gt; | — |
| `source-map-support` | 0.5.21 | MIT | Copyright (c) 2014 Evan Wallace | — |
| `statuses` | 2.0.2 | MIT | Copyright (c) 2014 Jonathan Ong &lt;me@jongleberry.com&gt;<br>Copyright (c) 2016 Douglas Christopher Wilson &lt;doug@somethingdoug.com&gt; | — |
| `web-streams-polyfill` | 4.0.0-beta.3 | MIT | Copyright (c) 2021 Mattias Buelens<br>Copyright (c) 2016 Diwank Singh Tomer | — |
| `whatwg-url` | 5.0.0 | MIT | Copyright (c) 2015–2016 Sebastian Mayr | — |

```text
The MIT License (MIT)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 本文 5（MIT・26件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `@jridgewell/gen-mapping` | 0.3.13 | MIT | Copyright 2024 Justin Ridgewell &lt;justin@ridgewell.name&gt; | — |
| `@jridgewell/resolve-uri` | 3.1.2 | MIT | Copyright 2019 Justin Ridgewell &lt;jridgewell@google.com&gt; | — |
| `@jridgewell/source-map` | 0.3.11 | MIT | Copyright 2024 Justin Ridgewell &lt;justin@ridgewell.name&gt; | — |
| `@jridgewell/sourcemap-codec` | 1.6.0 | MIT | Copyright 2024 Justin Ridgewell &lt;justin@ridgewell.name&gt; | — |
| `@jridgewell/trace-mapping` | 0.3.31 | MIT | Copyright 2024 Justin Ridgewell &lt;justin@ridgewell.name&gt; | — |
| `@jridgewell/trace-mapping` | 0.3.9 | MIT | Copyright 2022 Justin Ridgewell &lt;justin@ridgewell.name&gt; | — |
| `@opennextjs/cloudflare` | 1.20.12 | MIT | Copyright (c) 2020 Cloudflare, Inc. | — |
| `aws4fetch` | 1.0.20 | MIT | Copyright 2018 Michael Hart (michael.hart.au@gmail.com) | — |
| `color-convert` | 2.0.1 | MIT | Copyright (c) 2011-2016 Heather Arthur &lt;fayearthur@gmail.com&gt; | — |
| `combined-stream` | 1.0.8 | MIT | Copyright (c) 2011 Debuggable Limited &lt;felix@debuggable.com&gt; | — |
| `delayed-stream` | 1.0.0 | MIT | Copyright (c) 2011 Debuggable Limited &lt;felix@debuggable.com&gt; | — |
| `duplexer` | 0.1.2 | MIT | Copyright (c) 2012 Raynos. | — |
| `emoji-regex` | 10.6.0 | MIT | Copyright Mathias Bynens &lt;https://mathiasbynens.be/&gt; | — |
| `emoji-regex` | 10.6.0 | MIT | Copyright Mathias Bynens &lt;https://mathiasbynens.be/&gt; | — |
| `emoji-regex` | 8.0.0 | MIT | Copyright Mathias Bynens &lt;https://mathiasbynens.be/&gt; | — |
| `emoji-regex` | 8.0.0 | MIT | Copyright Mathias Bynens &lt;https://mathiasbynens.be/&gt; | — |
| `emoji-regex` | 9.2.2 | MIT | Copyright Mathias Bynens &lt;https://mathiasbynens.be/&gt; | — |
| `form-data` | 4.0.6 | MIT | Copyright (c) 2012 Felix Geisendörfer (felix@debuggable.com) and contributors | — |
| `function-bind` | 1.1.2 | MIT | Copyright (c) 2013 Raynos. | — |
| `humanize-ms` | 1.2.1 | MIT | （本文を参照） | — |
| `iconv-lite` | 0.7.3 | MIT | Copyright (c) 2011 Alexander Shtuchkin | — |
| `ipaddr.js` | 1.9.1 | MIT | Copyright (C) 2011-2017 whitequark &lt;whitequark@whitequark.org&gt; | — |
| `ipaddr.js` | 2.5.0 | MIT | Copyright (C) 2011-2017 whitequark &lt;whitequark@whitequark.org&gt; | — |
| `is-promise` | 4.0.0 | MIT | Copyright (c) 2014 Forbes Lindesay | — |
| `urlpattern-polyfill` | 10.1.0 | MIT | Copyright 2020 Intel Corporation | — |
| `ws` | 8.21.0 | MIT | Copyright (c) 2011 Einar Otto Stangvik &lt;einaros@gmail.com&gt;<br>Copyright (c) 2013 Arnout Kazemier and contributors<br>Copyright (c) 2016 Luigi Pinca and contributors | — |

```text
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 本文 6（ISC・11件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `foreground-child` | 3.3.1 | ISC | Copyright (c) 2015-2023 Isaac Z. Schlueter and Contributors | — |
| `glob` | 10.5.0 | ISC | Copyright (c) 2009-2023 Isaac Z. Schlueter and Contributors | — |
| `inherits` | 2.0.4 | ISC | Copyright (c) Isaac Z. Schlueter | — |
| `isexe` | 2.0.0 | ISC | Copyright (c) Isaac Z. Schlueter and Contributors | — |
| `lru-cache` | 10.4.3 | ISC | Copyright (c) 2010-2023 Isaac Z. Schlueter and Contributors | — |
| `minimatch` | 9.0.9 | ISC | Copyright (c) 2011-2023 Isaac Z. Schlueter and Contributors | — |
| `once` | 1.4.0 | ISC | Copyright (c) Isaac Z. Schlueter and Contributors | — |
| `semver` | 7.8.5 | ISC | Copyright (c) Isaac Z. Schlueter and Contributors | — |
| `signal-exit` | 4.1.0 | ISC | Copyright (c) 2015-2023 Benjamin Coe, Isaac Z. Schlueter, and Contributors | — |
| `which` | 2.0.2 | ISC | Copyright (c) Isaac Z. Schlueter and Contributors | — |
| `wrappy` | 1.0.2 | ISC | Copyright (c) Isaac Z. Schlueter and Contributors | — |

```text
The ISC License

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR
IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

### 本文 7（ISC・7件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `@isaacs/cliui` | 8.0.2 | ISC | Copyright (c) 2015, Contributors | — |
| `cliui` | 9.0.1 | ISC | Copyright (c) 2015, Contributors | — |
| `setprototypeof` | 1.2.0 | ISC | Copyright (c) 2015, Wes Todd | — |
| `write-file-atomic` | 5.0.1 | ISC | Copyright (c) 2015, Rebecca Turner | — |
| `y18n` | 5.0.8 | ISC | Copyright (c) 2015, Contributors | — |
| `yaml` | 2.9.1 | ISC | Copyright Eemeli Aro &lt;eemeli@gmail.com&gt; | — |
| `yargs-parser` | 22.0.0 | ISC | Copyright (c) 2016, Contributors | — |

```text
Permission to use, copy, modify, and/or distribute this software
for any purpose with or without fee is hereby granted, provided
that the above copyright notice and this permission notice
appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES
OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE
LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES
OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

### 本文 8（Apache-2.0・MIT・5件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `@aws-crypto/sha1-browser` | 5.2.0 | Apache-2.0 | （本文を参照） | — |
| `@aws-crypto/sha256-browser` | 5.2.0 | Apache-2.0 | （本文を参照） | — |
| `@aws-crypto/supports-web-crypto` | 5.2.0 | Apache-2.0 | （本文を参照） | — |
| `@pkgjs/parseargs` | 0.11.0 | MIT | （本文を参照） | — |
| `baseline-browser-mapping` | 2.11.25 | Apache-2.0 | （本文を参照） | — |

```text
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

### 本文 9（MIT・5件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `@poppinss/colors` | 4.1.6 | MIT | Copyright 2021 Harminder Virk, contributors | — |
| `@poppinss/dumper` | 0.6.5 | MIT | Copyright (c) 2023 | — |
| `@poppinss/exception` | 1.2.3 | MIT | Copyright (c) 2023 | — |
| `youch` | 4.1.0-beta.10 | MIT | Copyright (c) 2023 | — |
| `youch-core` | 0.3.3 | MIT | Copyright (c) 2024 | — |

```text
# The MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

### 本文 10（BSD-3-Clause・4件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `@dotenvx/dotenvx` | 2.38.0 | BSD-3-Clause | Copyright (c) 2024, Scott Motte | — |
| `@dotenvx/primitives` | 3.3.1 | BSD-3-Clause | Copyright (c) 2024, Scott Motte | — |
| `@dotenvx/providers` | 0.3.8 | BSD-3-Clause | Copyright (c) 2024, Scott Motte | — |
| `@dotenvx/tooling` | 1.0.5 | BSD-3-Clause | Copyright (c) 2026, Scott Motte | — |

```text
BSD 3-Clause License

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### 本文 11（MIT・4件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `@tsconfig/node18` | 18.2.7 | MIT | Copyright (c) Microsoft Corporation. | — |
| `@types/node` | 18.19.130 | MIT | Copyright (c) Microsoft Corporation. | — |
| `@types/node` | 26.6.1 | MIT | Copyright (c) Microsoft Corporation. | — |
| `@types/node-fetch` | 2.6.13 | MIT | Copyright (c) Microsoft Corporation. | — |

```text
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE
```

### 本文 12（BlueOak-1.0.0・4件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `lru-cache` | 11.5.3 | BlueOak-1.0.0 | （本文を参照） | — |
| `minipass` | 7.1.3 | BlueOak-1.0.0 | （本文を参照） | — |
| `path-scurry` | 1.11.1 | BlueOak-1.0.0 | （本文を参照） | — |
| `path-scurry` | 2.0.2 | BlueOak-1.0.0 | （本文を参照） | — |

```text
# Blue Oak Model License

Version 1.0.0

## Purpose

This license gives everyone as much permission to work with
this software as possible, while protecting contributors
from liability.

## Acceptance

In order to receive this license, you must agree to its
rules.  The rules of this license are both obligations
under that agreement and conditions to your license.
You must not do anything with this software that triggers
a rule that you cannot or will not follow.

## Copyright

Each contributor licenses you to do everything with this
software that would otherwise infringe that contributor's
copyright in it.

## Notices

You must ensure that everyone who gets a copy of
any part of this software from you, with or without
changes, also gets the text of this license or a link to
<https://blueoakcouncil.org/license/1.0.0>.

## Excuse

If anyone notifies you in writing that you have not
complied with [Notices](#notices), you can keep your
license by taking all practical steps to comply within 30
days after the notice.  If you do not do so, your license
ends immediately.

## Patent

Each contributor licenses you to do everything with this
software that would otherwise infringe any patent claims
they can license or become able to license.

## Reliability

No contributor can revoke this license.

## No Liability

***As far as the law allows, this software comes as is,
without any warranty or condition, and no contributor
will be liable to anyone for any damages related to this
software or this license, under any kind of legal claim.***
```

### 本文 13（Apache-2.0・3件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `@aws-crypto/sha256-js` | 5.2.0 | Apache-2.0 | （本文を参照） | — |
| `@aws-crypto/util` | 5.2.0 | Apache-2.0 | （本文を参照） | — |
| `detect-libc` | 2.1.2 | Apache-2.0 | （本文を参照） | — |

```text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "{}"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright {yyyy} {name of copyright owner}

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

### 本文 14（Apache-2.0・3件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `@aws-sdk/core` | 3.978.3 | Apache-2.0 | Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved. | — |
| `@swc/helpers` | 0.5.23 | Apache-2.0 | Copyright 2024 SWC contributors. | — |
| `cloudflare` | 4.5.0 | Apache-2.0 | Copyright 2025 Cloudflare | — |

```text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

### 本文 15（Apache-2.0・2件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `@img/sharp-darwin-arm64` | 0.35.5 | Apache-2.0 | （本文を参照） | — |
| `sharp` | 0.35.5 | Apache-2.0 | （本文を参照） | — |

```text
Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

"License" shall mean the terms and conditions for use, reproduction, and
distribution as defined by Sections 1 through 9 of this document.

"Licensor" shall mean the copyright owner or entity authorized by the copyright
owner that is granting the License.

"Legal Entity" shall mean the union of the acting entity and all other entities
that control, are controlled by, or are under common control with that entity.
For the purposes of this definition, "control" means (i) the power, direct or
indirect, to cause the direction or management of such entity, whether by
contract or otherwise, or (ii) ownership of fifty percent (50%) or more of the
outstanding shares, or (iii) beneficial ownership of such entity.

"You" (or "Your") shall mean an individual or Legal Entity exercising
permissions granted by this License.

"Source" form shall mean the preferred form for making modifications, including
but not limited to software source code, documentation source, and configuration
files.

"Object" form shall mean any form resulting from mechanical transformation or
translation of a Source form, including but not limited to compiled object code,
generated documentation, and conversions to other media types.

"Work" shall mean the work of authorship, whether in Source or Object form, made
available under the License, as indicated by a copyright notice that is included
in or attached to the work (an example is provided in the Appendix below).

"Derivative Works" shall mean any work, whether in Source or Object form, that
is based on (or derived from) the Work and for which the editorial revisions,
annotations, elaborations, or other modifications represent, as a whole, an
original work of authorship. For the purposes of this License, Derivative Works
shall not include works that remain separable from, or merely link (or bind by
name) to the interfaces of, the Work and Derivative Works thereof.

"Contribution" shall mean any work of authorship, including the original version
of the Work and any modifications or additions to that Work or Derivative Works
thereof, that is intentionally submitted to Licensor for inclusion in the Work
by the copyright owner or by an individual or Legal Entity authorized to submit
on behalf of the copyright owner. For the purposes of this definition,
"submitted" means any form of electronic, verbal, or written communication sent
to the Licensor or its representatives, including but not limited to
communication on electronic mailing lists, source code control systems, and
issue tracking systems that are managed by, or on behalf of, the Licensor for
the purpose of discussing and improving the Work, but excluding communication
that is conspicuously marked or otherwise designated in writing by the copyright
owner as "Not a Contribution."

"Contributor" shall mean Licensor and any individual or Legal Entity on behalf
of whom a Contribution has been received by Licensor and subsequently
incorporated within the Work.

2. Grant of Copyright License.

Subject to the terms and conditions of this License, each Contributor hereby
grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free,
irrevocable copyright license to reproduce, prepare Derivative Works of,
publicly display, publicly perform, sublicense, and distribute the Work and such
Derivative Works in Source or Object form.

3. Grant of Patent License.

Subject to the terms and conditions of this License, each Contributor hereby
grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free,
irrevocable (except as stated in this section) patent license to make, have
made, use, offer to sell, sell, import, and otherwise transfer the Work, where
such license applies only to those patent claims licensable by such Contributor
that are necessarily infringed by their Contribution(s) alone or by combination
of their Contribution(s) with the Work to which such Contribution(s) was
submitted. If You institute patent litigation against any entity (including a
cross-claim or counterclaim in a lawsuit) alleging that the Work or a
Contribution incorporated within the Work constitutes direct or contributory
patent infringement, then any patent licenses granted to You under this License
for that Work shall terminate as of the date such litigation is filed.

4. Redistribution.

You may reproduce and distribute copies of the Work or Derivative Works thereof
in any medium, with or without modifications, and in Source or Object form,
provided that You meet the following conditions:

You must give any other recipients of the Work or Derivative Works a copy of
this License; and
You must cause any modified files to carry prominent notices stating that You
changed the files; and
You must retain, in the Source form of any Derivative Works that You distribute,
all copyright, patent, trademark, and attribution notices from the Source form
of the Work, excluding those notices that do not pertain to any part of the
Derivative Works; and
If the Work includes a "NOTICE" text file as part of its distribution, then any
Derivative Works that You distribute must include a readable copy of the
attribution notices contained within such NOTICE file, excluding those notices
that do not pertain to any part of the Derivative Works, in at least one of the
following places: within a NOTICE text file distributed as part of the
Derivative Works; within the Source form or documentation, if provided along
with the Derivative Works; or, within a display generated by the Derivative
Works, if and wherever such third-party notices normally appear. The contents of
the NOTICE file are for informational purposes only and do not modify the
License. You may add Your own attribution notices within Derivative Works that
You distribute, alongside or as an addendum to the NOTICE text from the Work,
provided that such additional attribution notices cannot be construed as
modifying the License.
You may add Your own copyright statement to Your modifications and may provide
additional or different license terms and conditions for use, reproduction, or
distribution of Your modifications, or for any such Derivative Works as a whole,
provided Your use, reproduction, and distribution of the Work otherwise complies
with the conditions stated in this License.

5. Submission of Contributions.

Unless You explicitly state otherwise, any Contribution intentionally submitted
for inclusion in the Work by You to the Licensor shall be under the terms and
conditions of this License, without any additional terms or conditions.
Notwithstanding the above, nothing herein shall supersede or modify the terms of
any separate license agreement you may have executed with Licensor regarding
such Contributions.

6. Trademarks.

This License does not grant permission to use the trade names, trademarks,
service marks, or product names of the Licensor, except as required for
reasonable and customary use in describing the origin of the Work and
reproducing the content of the NOTICE file.

7. Disclaimer of Warranty.

Unless required by applicable law or agreed to in writing, Licensor provides the
Work (and each Contributor provides its Contributions) on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied,
including, without limitation, any warranties or conditions of TITLE,
NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A PARTICULAR PURPOSE. You are
solely responsible for determining the appropriateness of using or
redistributing the Work and assume any risks associated with Your exercise of
permissions under this License.

8. Limitation of Liability.

In no event and under no legal theory, whether in tort (including negligence),
contract, or otherwise, unless required by applicable law (such as deliberate
and grossly negligent acts) or agreed to in writing, shall any Contributor be
liable to You for damages, including any direct, indirect, special, incidental,
or consequential damages of any character arising as a result of this License or
out of the use or inability to use the Work (including but not limited to
damages for loss of goodwill, work stoppage, computer failure or malfunction, or
any and all other commercial damages or losses), even if such Contributor has
been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability.

While redistributing the Work or Derivative Works thereof, You may choose to
offer, and charge a fee for, acceptance of support, warranty, indemnity, or
other liability obligations and/or rights consistent with this License. However,
in accepting such obligations, You may act only on Your own behalf and on Your
sole responsibility, not on behalf of any other Contributor, and only if You
agree to indemnify, defend, and hold each Contributor harmless for any liability
incurred by, or claims asserted against, such Contributor by reason of your
accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work

To apply the Apache License to your work, attach the following boilerplate
notice, with the fields enclosed by brackets "[]" replaced with your own
identifying information. (Don't include the brackets!) The text should be
enclosed in the appropriate comment syntax for the file format. We also
recommend that a file or class name and description of purpose be included on
the same "printed page" as the copyright notice for easier identification within
third-party archives.

   Copyright [yyyy] [name of copyright owner]

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
```

### 本文 16（MIT・2件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `fsevents` | 2.3.2 | MIT | Copyright (C) 2010-2020 by Philipp Dunkel, Ben Noordhuis, Elan Shankar, Paul Miller | — |
| `fsevents` | 2.3.3 | MIT | Copyright (C) 2010-2020 by Philipp Dunkel, Ben Noordhuis, Elan Shankar, Paul Miller | — |

```text
MIT License
-----------

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### 本文 17（BlueOak-1.0.0・2件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `glob` | 13.0.6 | BlueOak-1.0.0 | （本文を参照） | — |
| `package-json-from-dist` | 1.0.1 | BlueOak-1.0.0 | （本文を参照） | — |

```text
All packages under `src/` are licensed according to the terms in
their respective `LICENSE` or `LICENSE.md` files.

The remainder of this project is licensed under the Blue Oak
Model License, as follows:

-----

# Blue Oak Model License

Version 1.0.0

## Purpose

This license gives everyone as much permission to work with
this software as possible, while protecting contributors
from liability.

## Acceptance

In order to receive this license, you must agree to its
rules.  The rules of this license are both obligations
under that agreement and conditions to your license.
You must not do anything with this software that triggers
a rule that you cannot or will not follow.

## Copyright

Each contributor licenses you to do everything with this
software that would otherwise infringe that contributor's
copyright in it.

## Notices

You must ensure that everyone who gets a copy of
any part of this software from you, with or without
changes, also gets the text of this license or a link to
<https://blueoakcouncil.org/license/1.0.0>.

## Excuse

If anyone notifies you in writing that you have not
complied with [Notices](#notices), you can keep your
license by taking all practical steps to comply within 30
days after the notice.  If you do not do so, your license
ends immediately.

## Patent

Each contributor licenses you to do everything with this
software that would otherwise infringe any patent claims
they can license or become able to license.

## Reliability

No contributor can revoke this license.

## No Liability

***As far as the law allows, this software comes as is,
without any warranty or condition, and no contributor
will be liable to anyone for any damages related to this
software or this license, under any kind of legal claim.***
```

### 本文 18（BlueOak-1.0.0・2件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `jackspeak` | 3.4.3 | BlueOak-1.0.0 | （本文を参照） | — |
| `minimatch` | 10.2.6 | BlueOak-1.0.0 | （本文を参照） | — |

```text
# Blue Oak Model License

Version 1.0.0

## Purpose

This license gives everyone as much permission to work with
this software as possible, while protecting contributors
from liability.

## Acceptance

In order to receive this license, you must agree to its
rules. The rules of this license are both obligations
under that agreement and conditions to your license.
You must not do anything with this software that triggers
a rule that you cannot or will not follow.

## Copyright

Each contributor licenses you to do everything with this
software that would otherwise infringe that contributor's
copyright in it.

## Notices

You must ensure that everyone who gets a copy of
any part of this software from you, with or without
changes, also gets the text of this license or a link to
<https://blueoakcouncil.org/license/1.0.0>.

## Excuse

If anyone notifies you in writing that you have not
complied with [Notices](#notices), you can keep your
license by taking all practical steps to comply within 30
days after the notice. If you do not do so, your license
ends immediately.

## Patent

Each contributor licenses you to do everything with this
software that would otherwise infringe any patent claims
they can license or become able to license.

## Reliability

No contributor can revoke this license.

## No Liability

**_As far as the law allows, this software comes as is,
without any warranty or condition, and no contributor
will be liable to anyone for any damages related to this
software or this license, under any kind of legal claim._**
```

### 本文 19（BSD-3-Clause・2件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `source-map` | 0.6.1 | BSD-3-Clause | Copyright (c) 2009-2011, Mozilla Foundation and contributors | — |
| `source-map-js` | 1.2.2 | BSD-3-Clause | Copyright (c) 2009-2011, Mozilla Foundation and contributors | — |

```text
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the names of the Mozilla Foundation nor the names of project
  contributors may be used to endorse or promote products derived from this
  software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### 本文 20（Apache-2.0・1件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `@aws/lambda-invoke-store` | 0.3.0 | Apache-2.0 | （本文を参照） | — |

```text
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.
```

### 本文 21（MIT・1件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `@img/colour` | 1.1.0 | MIT | Copyright (c) 2012 Heather Arthur<br>Copyright (c) 2011-2016 Heather Arthur &lt;fayearthur@gmail.com&gt;.<br>Copyright (c) 2016-2021 Josh Junon &lt;josh@junon.me&gt;.<br>Copyright (c) 2011 Heather Arthur &lt;fayearthur@gmail.com&gt;<br>Copyright (c) 2015 Dmitry Ivanov | — |

```text
# Licensing

## color

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## color-convert

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## color-string

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## color-name

The MIT License (MIT)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

### 本文 22（CC0-1.0・1件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `@speed-highlight/core` | 1.2.24 | CC0-1.0 | （本文を参照） | — |

```text
Creative Commons Legal Code

CC0 1.0 Universal

    CREATIVE COMMONS CORPORATION IS NOT A LAW FIRM AND DOES NOT PROVIDE
    LEGAL SERVICES. DISTRIBUTION OF THIS DOCUMENT DOES NOT CREATE AN
    ATTORNEY-CLIENT RELATIONSHIP. CREATIVE COMMONS PROVIDES THIS
    INFORMATION ON AN "AS-IS" BASIS. CREATIVE COMMONS MAKES NO WARRANTIES
    REGARDING THE USE OF THIS DOCUMENT OR THE INFORMATION OR WORKS
    PROVIDED HEREUNDER, AND DISCLAIMS LIABILITY FOR DAMAGES RESULTING FROM
    THE USE OF THIS DOCUMENT OR THE INFORMATION OR WORKS PROVIDED
    HEREUNDER.

Statement of Purpose

The laws of most jurisdictions throughout the world automatically confer
exclusive Copyright and Related Rights (defined below) upon the creator
and subsequent owner(s) (each and all, an "owner") of an original work of
authorship and/or a database (each, a "Work").

Certain owners wish to permanently relinquish those rights to a Work for
the purpose of contributing to a commons of creative, cultural and
scientific works ("Commons") that the public can reliably and without fear
of later claims of infringement build upon, modify, incorporate in other
works, reuse and redistribute as freely as possible in any form whatsoever
and for any purposes, including without limitation commercial purposes.
These owners may contribute to the Commons to promote the ideal of a free
culture and the further production of creative, cultural and scientific
works, or to gain reputation or greater distribution for their Work in
part through the use and efforts of others.

For these and/or other purposes and motivations, and without any
expectation of additional consideration or compensation, the person
associating CC0 with a Work (the "Affirmer"), to the extent that he or she
is an owner of Copyright and Related Rights in the Work, voluntarily
elects to apply CC0 to the Work and publicly distribute the Work under its
terms, with knowledge of his or her Copyright and Related Rights in the
Work and the meaning and intended legal effect of CC0 on those rights.

1. Copyright and Related Rights. A Work made available under CC0 may be
protected by copyright and related or neighboring rights ("Copyright and
Related Rights"). Copyright and Related Rights include, but are not
limited to, the following:

  i. the right to reproduce, adapt, distribute, perform, display,
     communicate, and translate a Work;
 ii. moral rights retained by the original author(s) and/or performer(s);
iii. publicity and privacy rights pertaining to a person's image or
     likeness depicted in a Work;
 iv. rights protecting against unfair competition in regards to a Work,
     subject to the limitations in paragraph 4(a), below;
  v. rights protecting the extraction, dissemination, use and reuse of data
     in a Work;
 vi. database rights (such as those arising under Directive 96/9/EC of the
     European Parliament and of the Council of 11 March 1996 on the legal
     protection of databases, and under any national implementation
     thereof, including any amended or successor version of such
     directive); and
vii. other similar, equivalent or corresponding rights throughout the
     world based on applicable law or treaty, and any national
     implementations thereof.

2. Waiver. To the greatest extent permitted by, but not in contravention
of, applicable law, Affirmer hereby overtly, fully, permanently,
irrevocably and unconditionally waives, abandons, and surrenders all of
Affirmer's Copyright and Related Rights and associated claims and causes
of action, whether now known or unknown (including existing as well as
future claims and causes of action), in the Work (i) in all territories
worldwide, (ii) for the maximum duration provided by applicable law or
treaty (including future time extensions), (iii) in any current or future
medium and for any number of copies, and (iv) for any purpose whatsoever,
including without limitation commercial, advertising or promotional
purposes (the "Waiver"). Affirmer makes the Waiver for the benefit of each
member of the public at large and to the detriment of Affirmer's heirs and
successors, fully intending that such Waiver shall not be subject to
revocation, rescission, cancellation, termination, or any other legal or
equitable action to disrupt the quiet enjoyment of the Work by the public
as contemplated by Affirmer's express Statement of Purpose.

3. Public License Fallback. Should any part of the Waiver for any reason
be judged legally invalid or ineffective under applicable law, then the
Waiver shall be preserved to the maximum extent permitted taking into
account Affirmer's express Statement of Purpose. In addition, to the
extent the Waiver is so judged Affirmer hereby grants to each affected
person a royalty-free, non transferable, non sublicensable, non exclusive,
irrevocable and unconditional license to exercise Affirmer's Copyright and
Related Rights in the Work (i) in all territories worldwide, (ii) for the
maximum duration provided by applicable law or treaty (including future
time extensions), (iii) in any current or future medium and for any number
of copies, and (iv) for any purpose whatsoever, including without
limitation commercial, advertising or promotional purposes (the
"License"). The License shall be deemed effective as of the date CC0 was
applied by Affirmer to the Work. Should any part of the License for any
reason be judged legally invalid or ineffective under applicable law, such
partial invalidity or ineffectiveness shall not invalidate the remainder
of the License, and in such case Affirmer hereby affirms that he or she
will not (i) exercise any of his or her remaining Copyright and Related
Rights in the Work or (ii) assert any associated claims and causes of
action with respect to the Work, in either case contrary to Affirmer's
express Statement of Purpose.

4. Limitations and Disclaimers.

 a. No trademark or patent rights held by Affirmer are waived, abandoned,
    surrendered, licensed or otherwise affected by this document.
 b. Affirmer offers the Work as-is and makes no representations or
    warranties of any kind concerning the Work, express, implied,
    statutory or otherwise, including without limitation warranties of
    title, merchantability, fitness for a particular purpose, non
    infringement, or the absence of latent or other defects, accuracy, or
    the present or absence of errors, whether or not discoverable, all to
    the greatest extent permissible under applicable law.
 c. Affirmer disclaims responsibility for clearing rights of other persons
    that may apply to the Work or any use thereof, including without
    limitation any person's Copyright and Related Rights in the Work.
    Further, Affirmer disclaims responsibility for obtaining any necessary
    consents, permissions or other rights required for any use of the
    Work.
 d. Affirmer understands and acknowledges that Creative Commons is not a
    party to this document and has no duty or obligation with respect to
    this CC0 or use of the Work.
```

### 本文 23（MIT・1件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `agentkeepalive` | 4.6.0 | MIT | Copyright(c) node-modules and other contributors.<br>Copyright(c) 2012 - 2015 fengmk2 &lt;fengmk2@gmail.com&gt; | — |

```text
The MIT License

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

### 本文 24（MIT・1件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `array-timsort` | 1.0.3 | MIT | Copyright (c) 2015 Marco Ziccardi | — |

```text
The MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### 本文 25（MIT・1件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `balanced-match` | 1.0.2 | MIT | Copyright (c) 2013 Julian Gruber &lt;julian@juliangruber.com&gt; | — |

```text
(MIT)

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 本文 26（MIT・1件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `balanced-match` | 4.0.4 | MIT | （本文を参照） | — |

```text
(MIT)

Original code Copyright Julian Gruber <julian@juliangruber.com>

Port to TypeScript Copyright Isaac Z. Schlueter <i@izs.me>

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 本文 27（MIT・1件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `bowser` | 2.14.1 | MIT | Copyright 2015, Dustin Diaz (the "Original Author") | — |

```text
All rights reserved.

MIT License

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

Distributions of all or part of the Software intended to be used
by the recipients as they would use the unmodified Software,
containing modifications that substantially alter, remove, or
disable functionality of the Software, outside of the documented
configuration mechanisms provided by the Software, shall be
modified such that the Original Author's bug reporting email
addresses and urls are either replaced with the contact information
of the parties responsible for the changes, or removed entirely.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

Except where noted, this license applies to any and all software
programs and associated documentation files created by the
Original Author, when distributed with the Software.
```

### 本文 28（MIT・1件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `brace-expansion` | 5.0.12 | MIT | Copyright Julian Gruber &lt;julian@juliangruber.com&gt; | — |

```text
MIT License

TypeScript port Copyright Isaac Z. Schlueter <i@izs.me>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 本文 29（CC-BY-4.0・1件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `caniuse-lite` | 1.0.30001810 | CC-BY-4.0 | （本文を参照） | 表示の義務：ビルドのときに使う、ブラウザーの対応状況のデータ。配る物に入るなら、作者の表示と CC BY 4.0 へのリンクが要る（公開リポジトリは node\_modules を含まないので、リポジトリ自体はこのデータを配らない） |

```text
Attribution 4.0 International

=======================================================================

Creative Commons Corporation ("Creative Commons") is not a law firm and
does not provide legal services or legal advice. Distribution of
Creative Commons public licenses does not create a lawyer-client or
other relationship. Creative Commons makes its licenses and related
information available on an "as-is" basis. Creative Commons gives no
warranties regarding its licenses, any material licensed under their
terms and conditions, or any related information. Creative Commons
disclaims all liability for damages resulting from their use to the
fullest extent possible.

Using Creative Commons Public Licenses

Creative Commons public licenses provide a standard set of terms and
conditions that creators and other rights holders may use to share
original works of authorship and other material subject to copyright
and certain other rights specified in the public license below. The
following considerations are for informational purposes only, are not
exhaustive, and do not form part of our licenses.

     Considerations for licensors: Our public licenses are
     intended for use by those authorized to give the public
     permission to use material in ways otherwise restricted by
     copyright and certain other rights. Our licenses are
     irrevocable. Licensors should read and understand the terms
     and conditions of the license they choose before applying it.
     Licensors should also secure all rights necessary before
     applying our licenses so that the public can reuse the
     material as expected. Licensors should clearly mark any
     material not subject to the license. This includes other CC-
     licensed material, or material used under an exception or
     limitation to copyright. More considerations for licensors:
	wiki.creativecommons.org/Considerations_for_licensors

     Considerations for the public: By using one of our public
     licenses, a licensor grants the public permission to use the
     licensed material under specified terms and conditions. If
     the licensor's permission is not necessary for any reason--for
     example, because of any applicable exception or limitation to
     copyright--then that use is not regulated by the license. Our
     licenses grant only permissions under copyright and certain
     other rights that a licensor has authority to grant. Use of
     the licensed material may still be restricted for other
     reasons, including because others have copyright or other
     rights in the material. A licensor may make special requests,
     such as asking that all changes be marked or described.
     Although not required by our licenses, you are encouraged to
     respect those requests where reasonable. More_considerations
     for the public:
	wiki.creativecommons.org/Considerations_for_licensees

=======================================================================

Creative Commons Attribution 4.0 International Public License

By exercising the Licensed Rights (defined below), You accept and agree
to be bound by the terms and conditions of this Creative Commons
Attribution 4.0 International Public License ("Public License"). To the
extent this Public License may be interpreted as a contract, You are
granted the Licensed Rights in consideration of Your acceptance of
these terms and conditions, and the Licensor grants You such rights in
consideration of benefits the Licensor receives from making the
Licensed Material available under these terms and conditions.

Section 1 -- Definitions.

  a. Adapted Material means material subject to Copyright and Similar
     Rights that is derived from or based upon the Licensed Material
     and in which the Licensed Material is translated, altered,
     arranged, transformed, or otherwise modified in a manner requiring
     permission under the Copyright and Similar Rights held by the
     Licensor. For purposes of this Public License, where the Licensed
     Material is a musical work, performance, or sound recording,
     Adapted Material is always produced where the Licensed Material is
     synched in timed relation with a moving image.

  b. Adapter's License means the license You apply to Your Copyright
     and Similar Rights in Your contributions to Adapted Material in
     accordance with the terms and conditions of this Public License.

  c. Copyright and Similar Rights means copyright and/or similar rights
     closely related to copyright including, without limitation,
     performance, broadcast, sound recording, and Sui Generis Database
     Rights, without regard to how the rights are labeled or
     categorized. For purposes of this Public License, the rights
     specified in Section 2(b)(1)-(2) are not Copyright and Similar
     Rights.

  d. Effective Technological Measures means those measures that, in the
     absence of proper authority, may not be circumvented under laws
     fulfilling obligations under Article 11 of the WIPO Copyright
     Treaty adopted on December 20, 1996, and/or similar international
     agreements.

  e. Exceptions and Limitations means fair use, fair dealing, and/or
     any other exception or limitation to Copyright and Similar Rights
     that applies to Your use of the Licensed Material.

  f. Licensed Material means the artistic or literary work, database,
     or other material to which the Licensor applied this Public
     License.

  g. Licensed Rights means the rights granted to You subject to the
     terms and conditions of this Public License, which are limited to
     all Copyright and Similar Rights that apply to Your use of the
     Licensed Material and that the Licensor has authority to license.

  h. Licensor means the individual(s) or entity(ies) granting rights
     under this Public License.

  i. Share means to provide material to the public by any means or
     process that requires permission under the Licensed Rights, such
     as reproduction, public display, public performance, distribution,
     dissemination, communication, or importation, and to make material
     available to the public including in ways that members of the
     public may access the material from a place and at a time
     individually chosen by them.

  j. Sui Generis Database Rights means rights other than copyright
     resulting from Directive 96/9/EC of the European Parliament and of
     the Council of 11 March 1996 on the legal protection of databases,
     as amended and/or succeeded, as well as other essentially
     equivalent rights anywhere in the world.

  k. You means the individual or entity exercising the Licensed Rights
     under this Public License. Your has a corresponding meaning.

Section 2 -- Scope.

  a. License grant.

       1. Subject to the terms and conditions of this Public License,
          the Licensor hereby grants You a worldwide, royalty-free,
          non-sublicensable, non-exclusive, irrevocable license to
          exercise the Licensed Rights in the Licensed Material to:

            a. reproduce and Share the Licensed Material, in whole or
               in part; and

            b. produce, reproduce, and Share Adapted Material.

       2. Exceptions and Limitations. For the avoidance of doubt, where
          Exceptions and Limitations apply to Your use, this Public
          License does not apply, and You do not need to comply with
          its terms and conditions.

       3. Term. The term of this Public License is specified in Section
          6(a).

       4. Media and formats; technical modifications allowed. The
          Licensor authorizes You to exercise the Licensed Rights in
          all media and formats whether now known or hereafter created,
          and to make technical modifications necessary to do so. The
          Licensor waives and/or agrees not to assert any right or
          authority to forbid You from making technical modifications
          necessary to exercise the Licensed Rights, including
          technical modifications necessary to circumvent Effective
          Technological Measures. For purposes of this Public License,
          simply making modifications authorized by this Section 2(a)
          (4) never produces Adapted Material.

       5. Downstream recipients.

            a. Offer from the Licensor -- Licensed Material. Every
               recipient of the Licensed Material automatically
               receives an offer from the Licensor to exercise the
               Licensed Rights under the terms and conditions of this
               Public License.

            b. No downstream restrictions. You may not offer or impose
               any additional or different terms or conditions on, or
               apply any Effective Technological Measures to, the
               Licensed Material if doing so restricts exercise of the
               Licensed Rights by any recipient of the Licensed
               Material.

       6. No endorsement. Nothing in this Public License constitutes or
          may be construed as permission to assert or imply that You
          are, or that Your use of the Licensed Material is, connected
          with, or sponsored, endorsed, or granted official status by,
          the Licensor or others designated to receive attribution as
          provided in Section 3(a)(1)(A)(i).

  b. Other rights.

       1. Moral rights, such as the right of integrity, are not
          licensed under this Public License, nor are publicity,
          privacy, and/or other similar personality rights; however, to
          the extent possible, the Licensor waives and/or agrees not to
          assert any such rights held by the Licensor to the limited
          extent necessary to allow You to exercise the Licensed
          Rights, but not otherwise.

       2. Patent and trademark rights are not licensed under this
          Public License.

       3. To the extent possible, the Licensor waives any right to
          collect royalties from You for the exercise of the Licensed
          Rights, whether directly or through a collecting society
          under any voluntary or waivable statutory or compulsory
          licensing scheme. In all other cases the Licensor expressly
          reserves any right to collect such royalties.

Section 3 -- License Conditions.

Your exercise of the Licensed Rights is expressly made subject to the
following conditions.

  a. Attribution.

       1. If You Share the Licensed Material (including in modified
          form), You must:

            a. retain the following if it is supplied by the Licensor
               with the Licensed Material:

                 i. identification of the creator(s) of the Licensed
                    Material and any others designated to receive
                    attribution, in any reasonable manner requested by
                    the Licensor (including by pseudonym if
                    designated);

                ii. a copyright notice;

               iii. a notice that refers to this Public License;

                iv. a notice that refers to the disclaimer of
                    warranties;

                 v. a URI or hyperlink to the Licensed Material to the
                    extent reasonably practicable;

            b. indicate if You modified the Licensed Material and
               retain an indication of any previous modifications; and

            c. indicate the Licensed Material is licensed under this
               Public License, and include the text of, or the URI or
               hyperlink to, this Public License.

       2. You may satisfy the conditions in Section 3(a)(1) in any
          reasonable manner based on the medium, means, and context in
          which You Share the Licensed Material. For example, it may be
          reasonable to satisfy the conditions by providing a URI or
          hyperlink to a resource that includes the required
          information.

       3. If requested by the Licensor, You must remove any of the
          information required by Section 3(a)(1)(A) to the extent
          reasonably practicable.

       4. If You Share Adapted Material You produce, the Adapter's
          License You apply must not prevent recipients of the Adapted
          Material from complying with this Public License.

Section 4 -- Sui Generis Database Rights.

Where the Licensed Rights include Sui Generis Database Rights that
apply to Your use of the Licensed Material:

  a. for the avoidance of doubt, Section 2(a)(1) grants You the right
     to extract, reuse, reproduce, and Share all or a substantial
     portion of the contents of the database;

  b. if You include all or a substantial portion of the database
     contents in a database in which You have Sui Generis Database
     Rights, then the database in which You have Sui Generis Database
     Rights (but not its individual contents) is Adapted Material; and

  c. You must comply with the conditions in Section 3(a) if You Share
     all or a substantial portion of the contents of the database.

For the avoidance of doubt, this Section 4 supplements and does not
replace Your obligations under this Public License where the Licensed
Rights include other Copyright and Similar Rights.

Section 5 -- Disclaimer of Warranties and Limitation of Liability.

  a. UNLESS OTHERWISE SEPARATELY UNDERTAKEN BY THE LICENSOR, TO THE
     EXTENT POSSIBLE, THE LICENSOR OFFERS THE LICENSED MATERIAL AS-IS
     AND AS-AVAILABLE, AND MAKES NO REPRESENTATIONS OR WARRANTIES OF
     ANY KIND CONCERNING THE LICENSED MATERIAL, WHETHER EXPRESS,
     IMPLIED, STATUTORY, OR OTHER. THIS INCLUDES, WITHOUT LIMITATION,
     WARRANTIES OF TITLE, MERCHANTABILITY, FITNESS FOR A PARTICULAR
     PURPOSE, NON-INFRINGEMENT, ABSENCE OF LATENT OR OTHER DEFECTS,
     ACCURACY, OR THE PRESENCE OR ABSENCE OF ERRORS, WHETHER OR NOT
     KNOWN OR DISCOVERABLE. WHERE DISCLAIMERS OF WARRANTIES ARE NOT
     ALLOWED IN FULL OR IN PART, THIS DISCLAIMER MAY NOT APPLY TO YOU.

  b. TO THE EXTENT POSSIBLE, IN NO EVENT WILL THE LICENSOR BE LIABLE
     TO YOU ON ANY LEGAL THEORY (INCLUDING, WITHOUT LIMITATION,
     NEGLIGENCE) OR OTHERWISE FOR ANY DIRECT, SPECIAL, INDIRECT,
     INCIDENTAL, CONSEQUENTIAL, PUNITIVE, EXEMPLARY, OR OTHER LOSSES,
     COSTS, EXPENSES, OR DAMAGES ARISING OUT OF THIS PUBLIC LICENSE OR
     USE OF THE LICENSED MATERIAL, EVEN IF THE LICENSOR HAS BEEN
     ADVISED OF THE POSSIBILITY OF SUCH LOSSES, COSTS, EXPENSES, OR
     DAMAGES. WHERE A LIMITATION OF LIABILITY IS NOT ALLOWED IN FULL OR
     IN PART, THIS LIMITATION MAY NOT APPLY TO YOU.

  c. The disclaimer of warranties and limitation of liability provided
     above shall be interpreted in a manner that, to the extent
     possible, most closely approximates an absolute disclaimer and
     waiver of all liability.

Section 6 -- Term and Termination.

  a. This Public License applies for the term of the Copyright and
     Similar Rights licensed here. However, if You fail to comply with
     this Public License, then Your rights under this Public License
     terminate automatically.

  b. Where Your right to use the Licensed Material has terminated under
     Section 6(a), it reinstates:

       1. automatically as of the date the violation is cured, provided
          it is cured within 30 days of Your discovery of the
          violation; or

       2. upon express reinstatement by the Licensor.

     For the avoidance of doubt, this Section 6(b) does not affect any
     right the Licensor may have to seek remedies for Your violations
     of this Public License.

  c. For the avoidance of doubt, the Licensor may also offer the
     Licensed Material under separate terms or conditions or stop
     distributing the Licensed Material at any time; however, doing so
     will not terminate this Public License.

  d. Sections 1, 5, 6, 7, and 8 survive termination of this Public
     License.

Section 7 -- Other Terms and Conditions.

  a. The Licensor shall not be bound by any additional or different
     terms or conditions communicated by You unless expressly agreed.

  b. Any arrangements, understandings, or agreements regarding the
     Licensed Material not stated herein are separate from and
     independent of the terms and conditions of this Public License.

Section 8 -- Interpretation.

  a. For the avoidance of doubt, this Public License does not, and
     shall not be interpreted to, reduce, limit, restrict, or impose
     conditions on any use of the Licensed Material that could lawfully
     be made without permission under this Public License.

  b. To the extent possible, if any provision of this Public License is
     deemed unenforceable, it shall be automatically reformed to the
     minimum extent necessary to make it enforceable. If the provision
     cannot be reformed, it shall be severed from this Public License
     without affecting the enforceability of the remaining terms and
     conditions.

  c. No term or condition of this Public License will be waived and no
     failure to comply consented to unless expressly agreed to by the
     Licensor.

  d. Nothing in this Public License constitutes or may be interpreted
     as a limitation upon, or waiver of, any privileges and immunities
     that apply to the Licensor or You, including from the legal
     processes of any jurisdiction or authority.

=======================================================================

Creative Commons is not a party to its public
licenses. Notwithstanding, Creative Commons may elect to apply one of
its public licenses to material it publishes and in those instances
will be considered the “Licensor.” The text of the Creative Commons
public licenses is dedicated to the public domain under the CC0 Public
Domain Dedication. Except for the limited purpose of indicating that
material is shared under a Creative Commons public license or as
otherwise permitted by the Creative Commons policies published at
creativecommons.org/policies, Creative Commons does not authorize the
use of the trademark "Creative Commons" or any other trademark or logo
of Creative Commons without its prior written consent including,
without limitation, in connection with any unauthorized modifications
to any of its public licenses or any other arrangements,
understandings, or agreements concerning use of licensed material. For
the avoidance of doubt, this paragraph does not form part of the
public licenses.

Creative Commons may be contacted at creativecommons.org.
```

### 本文 30（MIT・1件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `comment-json` | 4.6.2 | MIT | Copyright (c) 2013 kaelzhang &lt;&gt;, contributors | — |

```text
http://kael.me/

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

### 本文 31（BSD-2-Clause・1件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `esprima` | 4.0.1 | BSD-2-Clause | Copyright JS Foundation and other contributors, https://js.foundation/ | — |

```text
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

  * Redistributions of source code must retain the above copyright
    notice, this list of conditions and the following disclaimer.
  * Redistributions in binary form must reproduce the above copyright
    notice, this list of conditions and the following disclaimer in the
    documentation and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### 本文 32（ISC・1件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `get-caller-file` | 2.0.5 | ISC | Copyright 2018 Stefan Penner | — |

```text
ISC License (ISC)

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

### 本文 33（MIT・1件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `mkdirp` | 3.0.1 | MIT | Copyright (c) 2011-2023 James Halliday (mail@substack.net) and Isaac Z. Schlueter (i@izs.me) | — |

```text
This project is free software released under the MIT license:

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### 本文 34（MIT・1件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `pathe` | 2.0.3 | MIT | Copyright (c) Pooya Parsa &lt;pooya@pi0.io&gt; - Daniel Roe &lt;daniel@roe.dev&gt;<br>Copyright Joyent, Inc. and other Node contributors.<br>Copyright (c) 2023-present Fabio Spampinato | — |

```text
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.

---

Bundled zeptomatch (https://github.com/fabiospampinato/zeptomatch)

The MIT License (MIT)

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
```

### 本文 35（ISC・1件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `picocolors` | 1.1.1 | ISC | Copyright (c) 2021-2024 Oleksii Raspopov, Kostiantyn Denysov, Anton Verinov | — |

```text
ISC License

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

### 本文 36（BSD-3-Clause・1件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `qs` | 6.16.1 | BSD-3-Clause | Copyright (c) 2014, Nathan LaFreniere and other \[contributors\](https://github.com/ljharb/qs/graphs/contributors) | — |

```text
BSD 3-Clause License

All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### 本文 37（BSD-2-Clause・1件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `terser` | 5.36.0 | BSD-2-Clause | Copyright 2012-2018 (c) Mihai Bazon &lt;mihai.bazon@gmail.com&gt; | — |

```text
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:

    * Redistributions of source code must retain the above
      copyright notice, this list of conditions and the following
      disclaimer.

    * Redistributions in binary form must reproduce the above
      copyright notice, this list of conditions and the following
      disclaimer in the documentation and/or other materials
      provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
SUCH DAMAGE.
```

### 本文 38（0BSD・1件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `tslib` | 2.8.1 | 0BSD | Copyright (c) Microsoft Corporation. | — |

```text
Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
```

### 本文 39（BSD-2-Clause・1件）

| パッケージ | 版 | ライセンス | 著作権の行 | 備考 |
|---|---|---|---|---|
| `webidl-conversions` | 3.0.1 | BSD-2-Clause | Copyright (c) 2014, Domenic Denicola | — |

```text
# The BSD 2-Clause License

All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```
