# JRO Tools Plus 仕様

## 概要

JRO Tools Plus は JRO 公式系サイト向けの Chrome Extension です。

主な役割は次の通りです。

- `https://rotool.gungho.jp/*` 上で、モンスター・マップ検索結果のドロップ率表示を補助する
- 拡張機能の Side Panel から、キャラクター情報ページを起点に所持 Zeny 情報を収集・保存・表示する
- 公式アイテム・モンスターの閲覧履歴とお気に入りを保存し、JRO Searchと共有する

## Chrome Extension 設定

Manifest は `public/manifest.json` で管理します。

- Manifest version: `3`
- 拡張機能名: `JRO Tools Plus`
- Side Panel: `tools/sidepanel.html`
- Background service worker: `background/service-worker.js`
- Content script 対象:
  - `https://rotool.gungho.jp/*`
  - `https://asgrcat.github.io/jro-search/items/*`
  - `https://asgrcat.github.io/jro-search/monsters/*`
- Content script 実行タイミング: `document_end`
- Content script 出力:
  - `content_scripts/loader.js`
  - `content_scripts/web-library-bridge.js`
  - `css/jro_tools_plus.min.css`

要求権限は次の通りです。

- `sidePanel`: 拡張機能アイコンから Side Panel を開閉する
- `storage`: Side Panel 設定・Zeny 収集結果・前回取得日時を `chrome.storage.local` に保存する
- `unlimitedStorage`: Zeny 収集結果の保存容量制限を緩和する
- `scripting`: Side Panel から対象タブへ scraper を注入・実行する

Host permissions は次の通りです。

- `https://rowebtool.gungho.jp/*`: Side Panel を先に開いた後でキャラクター情報ページへ切り替えた場合でも、対象タブの URL 判定と scraper 注入を実行する
- `https://rotool.gungho.jp/*`: 現在の公式詳細ページを判定する
- `https://asgrcat.github.io/*`: 公開検索ページとの共有と、公開アイテム・モンスター名の取得に使用する

`web_accessible_resources` では次のリソースを JRO 公式系ドメインから参照可能にします。

- `css/jro_tools_plus.min.css`
- `tools/js/zeny-characterpage-scraper.js`

対象ドメインは次の通りです。

- `https://rotool.gungho.jp/*`
- `https://rowebtool.gungho.jp/*`

## Content Script

入口は `content_scripts/scripts/loader.ts` です。

`loader.ts` は SCSS を import し、webpack によって CSS と JS に分離されます。`rotool.gungho.jp` の `/monster/*` と `/map/*` では検索結果のドロップ率表示を補助します。

検索結果のドロップ率表示は SCSS で定義します。

- `content_scripts/sass/monster.scss`
- `content_scripts/sass/map.scss`

対象 class は `rate0` から `rate10` です。表示文言は次の通りです。

| class | 表示 |
| --- | --- |
| `rate0` | `0.3%以下` |
| `rate1` | `約0.5%` |
| `rate2` | `約1%` |
| `rate3` | `約5%` |
| `rate4` | `約10%` |
| `rate5` | `約15%` |
| `rate6` | `約20%` |
| `rate7` | `約25%` |
| `rate8` | `約50%` |
| `rate9` | `約75%` |
| `rate10` | `100%` |

## Side Panel 画面

Side Panel の HTML は `tools/sidepanel.html` です。拡張機能アイコンを押すと `background/service-worker.js` が `chrome.sidePanel.open()` で Side Panel を開きます。開いている状態でもう一度拡張機能アイコンを押すと、Chrome 141+ の `chrome.sidePanel.close()` で閉じます。

Side Panel のヘッダーには4つのページ切り替えメニューを横一列に表示します。狭い幅では文字と余白を詰め、320px幅でも折り返さずに表示します。

- `所持Zeny`: 所持 Zeny 収集画面
- `お気に入り`: 保存済みの一覧・名前検索・セット絞り込み・現在の公式ページの登録／解除
- `閲覧履歴`: 最近開いた公式詳細・Webプレビューの一覧とお気に入り操作
- `更新履歴`: 同梱した `public/data/version-history.json` とインストール済みの固定バージョンを表示

更新履歴はWeb版のライトテーマと同じカード形式です。バージョン名を左、日付を右に置き、その下に変更内容を表示します。インストール済みバージョンのカードだけ枠線を強調し、独立したバージョン表示行は置きません。Web版の履歴データではなく、JRO Tools Plus自身の履歴を表示します。

お気に入りと閲覧履歴は、それぞれ独立した `アイテム` / `モンスター` の対象切り替えを持ち、初期表示はアイテムです。各行の虫眼鏡アイコンはJRO Searchの対象詳細（`items/?id=...` / `monsters/?id=...`）を新しいタブで開きます。公式ページ専用のアイコンは置かず、名前のリンクは従来どおり公式詳細です。虫眼鏡には「JRO Searchで開く」、ハートには状態に応じた「お気に入りに追加」「お気に入りから削除」と対象セットを、ホバー・キーボードフォーカス時のツールチップおよび読み上げ名で示します。公式ページの詳細本文はSide Panelへ複製しません。

一覧カードには名前、JRO Searchのアイコン、お気に入りボタンを表示し、名前の下の種別・セット名・閲覧日時の補足行は表示しません。セット所属と閲覧日時の保存・共有、および履歴の並び順は維持します。

旧 popup 用の HTML として `tools/index.html` も残していますが、Manifest の `action.default_popup` は使いません。

Side Panel の TypeScript は `tools/ts/jro-tools-settings.ts` です。主な責務は次の通りです。

- hash に応じたページ表示切り替え
- Zeny 表示形式の保存・復元
- Zeny 収集ボタンの有効・無効状態管理
- active tab の切り替え・URL 変更に応じた対象ページ再判定
- 収集済み Zeny データの表示
- 対象タブへの scraper 注入と実行

## 所持 Zeny 収集

所持 Zeny 収集は Side Panel の `取得開始` ボタンから実行します。

実行対象 URL は次の形式です。

```text
https://rowebtool.gungho.jp/character
https://rowebtool.gungho.jp/character/{world}/{characterId}
```

実装上の判定正規表現は次の通りです。

```text
^https:\/\/rowebtool\.gungho\.jp\/character\/?(?:\?[^#]*)?(?:#.*)?$
^https:\/\/rowebtool\.gungho\.jp\/character\/\w+\/\d+$
```

対象外ページで Side Panel を開いた場合、収集ボタンは disabled になり、`取得対象外のページです` を表示します。

### 収集フロー

1. Side Panel が最後にフォーカスされたブラウザウィンドウの active tab を取得する
2. 対象 URL であれば `tools/js/zeny-characterpage-scraper.js` を対象タブへ注入する
3. 対象ページ上の `worldchange` form から world option 一覧を取得する
4. 各 world について `https://rowebtool.gungho.jp/character/{world}/0` を fetch する
5. キャラクター詳細ページへのリンク一覧を抽出する
6. 各キャラクター詳細ページを fetch する
7. キャラクター名と Zeny を抽出する
8. world ごとに合計 Zeny を集計して Side Panel に表示する
9. 収集結果と前回取得日時を `chrome.storage.local` に保存する

各 fetch 前には 1500ms の待機を入れています。収集完了後は 5 分間のクールダウンを設けます。

収集中は Side Panel のステータスの1行目に「対象タブを閉じないでください」、改行後に現在の取得状況を表示します。収集中に対象タブが閉じられた場合は収集を中断し、保存済みの Zeny 収集結果は上書きしません。

### Scraper

Scraper は `tools/ts/zeny-characterpage-scraper.ts` です。対象ページの `window` に次の関数を公開します。

- `getWorldOptionsFromPage()`
- `scrapeCharacterLinksForWorld(worldValue, worldText)`
- `scrapeCharacterDetails(characterPageLink)`

抽出対象 selector は次の通りです。

- world list: `document.forms.namedItem("worldchange")` の `world` select
- character links: `body > main > article > div > div.listSet > ul > li > dl > dt > a`
- character name: `body > main > article > section > div.base > table > tbody > tr:nth-child(1) > td:nth-child(2)`
- zeny: `body > main > article > section > div.info > table > tbody > tr:nth-child(2) > td`

## 保存データ

保存先は `chrome.storage.local` です。

| key | 内容 |
| --- | --- |
| `zenyDisplayPreference` | Zeny 表示形式。`full` または `short` |
| `zenyCrawlLastUpdatedTimestamp` | 前回取得日時の Unix epoch milliseconds |
| `zenyCrawlResultsData` | 収集したキャラクター別 Zeny 情報の配列 |
| `jro-tools-plus.personalLibrary` | 型別のセット・お気に入り・閲覧履歴、更新順序と同期世代 |

`zenyCrawlResultsData` の要素は次の形です。

```ts
interface CharacterDetail {
  value: string;
  text: string;
  href: string;
  characterName?: string;
  zeny?: string;
}
```

## お気に入り・閲覧履歴の共有

共有の対象は、同じChromeプロファイルで利用している拡張機能と公開JRO Searchです。別端末・別プロファイルへのクラウド同期は行いません。Zeny・キャラクター情報は共有しません。

- 公式のアイテム・モンスター詳細をトップフレームで開いたときだけ閲覧を記録します。Chrome全体の履歴権限は要求しません。
- 履歴は種類ごとに最新50件。同じ対象の再訪問は重複追加せず先頭へ移します。
- 既存のWebお気に入りセットと所属を取り込みます。Side Panelからセットを選んで登録・解除できます。セットの作成・名前変更・削除はWeb側で行います。
- 最後に確認したWeb状態との差分を適用し、古いタブが変更していないデータで最新状態を上書きしないようにします。
- 同期世代 `syncId` が変わった場合は初回取り込みとして扱い、再インストールや拡張機能の保存領域初期化によってWeb側の既存データが消えることを防ぎます。
- Webの変更イベントと拡張機能の保存変更イベントで反映します。旧Web版には1.5秒間隔の変更検出も使います（画面の即時更新にはWeb側の対応が必要です）。
- Webを開いていないときも拡張機能は単独で保存・表示できます。次回Webを開いたときに共有します。拡張機能がない場合もWeb単独で利用できます。
- 拡張機能の無効化・更新による通信切断や壊れたJSONでは保存データを消去せず、エラーを画面やコンソールへ出しません。拡張機能を再度有効にした後はWebタブを再読み込みしてください。
- 名前取得が失敗した場合も既知の名前またはIDで利用を続けます。保存内容を外部サーバーへ送信しません。

### ディレクトリとテスト境界

| 場所 | 責務 |
| --- | --- |
| `tools/lib/personal-library.ts` | URL検証、正規化、履歴・お気に入りの純粋な更新処理 |
| `tools/lib/web-sync.ts` | Web保存形式と拡張機能形式の変換、差分マージ |
| `tools/lib/library-view.ts` | 一覧の絞り込み、更新履歴の読み取り |
| `background/lib/personal-library.ts` | 送信元検証、Chrome保存API、更新の直列化 |
| `content_scripts/scripts/web-library-bridge.ts` | WebのlocalStorageと拡張機能の通信 |
| `tools/ts/personal-library.ts` | Side PanelのDOM描画と操作 |
| `tests/*.test.ts` | 純粋処理・Chrome APIモック・配布bundleの通信障害テスト |

ブラウザ依存処理を純粋なデータ処理から分離します。同期ブリッジのテストは実際の配布bundleを使うため、最終検証は `npm run build` の後に `npm test` を実行します。

`node tests/e2e/sidepanel-mac.mjs` は、逆トンネル先のMac Chrome HeadlessでSide Panel画面を確認します。Playwrightを別環境に配置している場合は `JRO_PLAYWRIGHT_MODULE` にそのモジュールの絶対パスを指定できます。このテストはChrome APIを模擬しており、実際にインストールした拡張機能の連携テストではありません。

## Zeny 表示形式

Zeny 表示形式は Side Panel の radio button で選択します。

- `short`: `G Zeny`、`M Zeny`、`K Zeny` に省略表示する
- `full`: カンマ区切りの全桁表示にする

`short` 表示では、Zeny 値に focus した間だけ全桁表示へ切り替え、focus が外れると省略表示へ戻します。

## ビルド

Node.js は repo ローカルで `24.16.0` を使用します。

- `.node-version`
- `mise.toml`

依存関係の再現には `npm ci` を使います。

```sh
mise exec -- npm ci
```

production build は次のコマンドです。

```sh
mise exec -- npm run build
```

build 出力先は `dist/` です。production build の生成物は Git 管理し、ソース変更時は再ビルドした `dist/` も同じコミットに含めます。開発用 build の生成物はコミット前に production build で置き換えます。

このブランチを取得すると、ローカルでビルドせずに Chrome の拡張機能管理画面でデベロッパーモードを有効にし、「パッケージ化されていない拡張機能を読み込む」から `dist/` を選択できます。

webpack は次の入力を entry として扱います。

- `content_scripts/scripts/*.ts`
- `tools/ts/*.ts`
- `background/ts/*.ts`
- `tools/js/*.js`

webpack の copy 対象は次の通りです。

- `public/` -> `dist/`
- `tools/*.html` -> `dist/tools/*.html`
- `node_modules/@fortawesome/fontawesome-free/webfonts` -> `dist/tools/webfonts`

Tailwind CSS は `tools/css/app.css` から生成します。

- 開発時: `tools/css/style.css`
- production build: `dist/tools/css/style.css`

## リリース

バージョンは `<4桁の年>.<月>.<その月の更新回数>` とします。新形式は `2026.9.1` から開始します。月と回数はゼロ埋めしません。

バージョンは JSON に固定値として保存します。現在日時からの自動算出は行わず、月を跨いでも、起動・ビルドしても変更しません。明示的に更新する際に、同じ月なら回数を1増やし、別の月ならその月の1回目を指定します。

リリース処理は `standard-version` を使い、更新先の完全なバージョンを必ず指定します。例えば `2026.9.1` から `2026.9.2` への更新は次のとおりです。

```sh
mise exec -- npm run bump:dryrun -- 2026.9.2
mise exec -- npm run bump -- 2026.9.2
```

`.versionrc.cjs` で `package.json`、`package-lock.json`（ルートパッケージ情報を含む）、`public/manifest.json`、`dist/manifest.json` の version を同時に更新します。`bump:dryrun` は指定した値への変更を確認するだけで、ファイル・コミット・タグを変更しません。実際の `bump` は従来どおり更新履歴・リリースコミット・タグを作成します。

バージョンを省略するとエラーになります。`patch` / `minor` / `major` は指定せず、必ず `2026.9.2` のような完全な値を渡してください。旧 `bump:minor` / `bump:major` と各 dryrun コマンドは廃止します。

## 検証

通常の変更後は次の確認を行います。

```sh
mise exec -- npm ci
mise exec -- npm run build
mise exec -- npm test
mise exec -- npm audit --audit-level=low
```

release 設定に影響する変更では次も確認します。

```sh
mise exec -- npm run bump:dryrun -- 2026.9.2
```
