# jRo Tools Plus 仕様

## 概要

jRo Tools Plus は jRO 公式系サイト向けの Chrome Extension です。

主な役割は次の 2 つです。

- `https://rotool.gungho.jp/*` 上で、モンスター・マップ検索結果のドロップ率表示を補助する
- 拡張機能の Side Panel から、キャラクター情報ページを起点に所持 Zeny 情報を収集・保存・表示する

## Chrome Extension 設定

Manifest は `public/manifest.json` で管理します。

- Manifest version: `3`
- 拡張機能名: `jRo Tools Plus`
- Side Panel: `tools/sidepanel.html`
- Background service worker: `background/service-worker.js`
- Content script 対象:
  - `https://rotool.gungho.jp/*`
- Content script 実行タイミング: `document_end`
- Content script 出力:
  - `content_scripts/loader.js`
  - `css/jro_tools_plus.min.css`

要求権限は次の通りです。

- `sidePanel`: 拡張機能アイコンから Side Panel を開閉する
- `storage`: Side Panel 設定・Zeny 収集結果・前回取得日時を `chrome.storage.local` に保存する
- `unlimitedStorage`: Zeny 収集結果の保存容量制限を緩和する
- `scripting`: Side Panel から対象タブへ scraper を注入・実行する

Host permissions は次の通りです。

- `https://rowebtool.gungho.jp/*`: Side Panel を先に開いた後でキャラクター情報ページへ切り替えた場合でも、対象タブの URL 判定と scraper 注入を実行する

`web_accessible_resources` では次のリソースを jRO 公式系ドメインから参照可能にします。

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

Side Panel のヘッダーにはページ切り替えメニューを表示します。

- `所持Zeny`: 所持 Zeny 収集画面

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

リリース処理は `standard-version` を使います。

```sh
mise exec -- npm run bump:dryrun
mise exec -- npm run bump
```

設定ファイルは `.versionrc.cjs` です。`package.json`、`package-lock.json`、`public/manifest.json` の version を更新対象にします。

## 検証

通常の変更後は次の確認を行います。

```sh
mise exec -- npm ci
mise exec -- npm test
mise exec -- npm audit --audit-level=low
mise exec -- npm run build
```

release 設定に影響する変更では次も確認します。

```sh
mise exec -- npm run bump:dryrun
```
