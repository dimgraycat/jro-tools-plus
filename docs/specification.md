# jRo Tools Plus 仕様

## 概要

jRo Tools Plus は jRO 公式系サイト向けの Chrome Extension です。

主な役割は次の 2 つです。

- `https://rotool.gungho.jp/*` 上で、モンスター・マップ検索結果のドロップ率表示を補助する
- 拡張機能 popup から、キャラクター情報ページを起点に所持 Zeny 情報を収集・保存・表示する

## Chrome Extension 設定

Manifest は `public/manifest.json` で管理します。

- Manifest version: `3`
- 拡張機能名: `jRo Tools Plus`
- Popup: `tools/index.html`
- Content script 対象: `https://rotool.gungho.jp/*`
- Content script 実行タイミング: `document_end`
- Content script 出力:
  - `content_scripts/loader.js`
  - `css/jro_tools_plus.min.css`

要求権限は次の通りです。

- `storage`: popup 設定・Zeny 収集結果・前回取得日時を `chrome.storage.local` に保存する
- `unlimitedStorage`: Zeny 収集結果の保存容量制限を緩和する
- `activeTab`: popup から現在のタブ URL を確認する
- `scripting`: popup から対象タブへ scraper を注入・実行する

`web_accessible_resources` では次のリソースを jRO 公式系ドメインから参照可能にします。

- `css/jro_tools_plus.min.css`
- `tools/js/zeny-characterpage-scraper.js`

対象ドメインは次の通りです。

- `https://rotool.gungho.jp/*`
- `https://rowebtool.gungho.jp/*`
- `https://ragnarokonline.gungho.jp/*`

## Content Script

入口は `content_scripts/scripts/loader.ts` です。

`loader.ts` は SCSS を import し、webpack によって CSS と JS に分離されます。現在のサイト別設定では、`rotool.gungho.jp` の `/monster/*` と `/map/*` を対象にしています。

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

## Popup 画面

Popup の HTML は `tools/index.html` です。

現在の実用画面は `所持Zeny` です。`オプション` 画面の markup と永続化処理はありますが、ナビゲーション上はコメントアウトされています。

Popup の TypeScript は `tools/ts/jro-tools-settings.ts` です。主な責務は次の通りです。

- hash に応じたメニュー・ページ表示切り替え
- popup 内の toggle 状態の保存・復元
- Zeny 表示形式の保存・復元
- Zeny 収集ボタンの有効・無効状態管理
- 収集済み Zeny データの表示
- 対象タブへの scraper 注入と実行

## 所持 Zeny 収集

所持 Zeny 収集は popup の `取得開始` ボタンから実行します。

実行対象 URL は次の形式です。

```text
https://rowebtool.gungho.jp/character/{world}/{characterId}
```

実装上の判定正規表現は次の通りです。

```text
^https:\/\/rowebtool\.gungho\.jp\/character\/\w+\/\d+$
```

対象外ページで popup を開いた場合、収集ボタンは disabled になり、`取得対象外のページです` を表示します。

### 収集フロー

1. popup が現在の active tab を取得する
2. 対象 URL であれば `tools/js/zeny-characterpage-scraper.js` を対象タブへ注入する
3. 対象ページ上の `worldchange` form から world option 一覧を取得する
4. 各 world について `https://rowebtool.gungho.jp/character/{world}/0` を fetch する
5. キャラクター詳細ページへのリンク一覧を抽出する
6. 各キャラクター詳細ページを fetch する
7. キャラクター名と Zeny を抽出する
8. world ごとに合計 Zeny を集計して popup に表示する
9. 収集結果と前回取得日時を `chrome.storage.local` に保存する

各 fetch 前には 1500ms の待機を入れています。収集完了後は 5 分間のクールダウンを設けます。

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
| `toggle-feature-a` | オプション画面の toggle 状態 |
| `toggle-feature-b` | オプション画面の toggle 状態 |
| `toggle-feature-c` | オプション画面の toggle 状態 |

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

Zeny 表示形式は popup の radio button で選択します。

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

build 出力先は `dist/` です。webpack は次の入力を entry として扱います。

- `content_scripts/scripts/*.ts`
- `tools/ts/*.ts`
- `tools/js/*.js`

webpack の copy 対象は次の通りです。

- `public/` -> `dist/`
- `tools/index.html` -> `dist/tools/index.html`
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
mise exec -- npm audit --audit-level=low
mise exec -- npm run build
```

release 設定に影響する変更では次も確認します。

```sh
mise exec -- npm run bump:dryrun
```
