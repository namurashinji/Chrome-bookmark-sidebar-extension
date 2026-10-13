# CLAUDE.md — Chrome Bookmark Sidebar Extension

> Chrome 拡張機能「Custom Bookmark Sidebar」の **仕様と規律** を集約する。
> 現在の状態・変更履歴は `HANDOVER.md`、開発計画・意思決定は `PLAN.md`、ユーザー向け情報は `README.md` を参照。

---

## システム構成（2026-10-13 にサイドパネル型へ移行）

```
┌──────────────────────────── Chrome ウィンドウ ────────────────────────────┐
│                                                                            │
│  ┌───────────────┐  open_url（メッセージ）  ┌──────────────────────────┐  │
│  │ sidepanel.html│────────────────────────▶│ background.js（SW）       │  │
│  │ sidepanel.js  │  ポート 'sidepanel:<id>' │ ・タブ再利用 or 新規作成  │  │
│  │（UI・Storage）│────────────────────────▶│ ・commands（ショートカット）│  │
│  └───────┬───────┘  （開いている間だけ接続）│ ・サイドパネル開閉        │  │
│          │                                  └──────────────────────────┘  │
│          ▼                                                                 │
│  ┌───────────────┐                                                         │
│  │ utils.js      │  ← 純粋関数（Jest でそのまま動く）                     │
│  └───────────────┘                                                         │
└────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
  chrome.storage.local
  ┌───────────────────────────┐
  │ bookmarks: [{icon, url}]  │  ← アイコンは Base64 Data URL
  └───────────────────────────┘
```

Web ページへのスクリプト注入（content script）はしない。

---

## ファイル構成と責務

| ファイル | 役割 | 特記事項 |
|---|---|---|
| `manifest.json` | 拡張機能メタ情報 | MV3、`minimum_chrome_version: 141`。パーミッション: `storage`, `tabs`, `sidePanel` |
| `background.js` | Service Worker | タブを開く処理（`openBookmarkURL` に一本化）、ショートカット（`onCommand`）、サイドパネル開閉 |
| `sidepanel.html` / `sidepanel.js` / `sidepanel.css` | サイドパネルの UI | アイコン一覧（格子状）・追加フォーム・右クリック削除・並べ替え |
| `utils.js` | ユーティリティ | Chrome API 非依存の純粋関数（`isValidURL` / `removeAtIndex` / `moveItem` / `appendItem` / `findNearestIndex`）。`sidepanel.html` から通常の `<script>` で先に読み込む |
| `tests/utils.test.js` | ユニットテスト | `utils.js` の純粋関数 |
| `tests/background.test.js` | ユニットテスト | `background.js` の純粋関数（URL 検証・タブ選択・ポート名の解釈） |

---

## データ構造（chrome.storage.local）

```javascript
// ブックマーク一覧（サイドパネル型への移行前と同じキー・同じ形。既存データはそのまま使える）
bookmarks: [
  {
    icon: "data:image/png;base64,...",  // Base64 Data URL（最大 300KB）
    url:  "https://example.com"          // http/https のみ許可
  },
  // ... 最大12件
]
```

旧版の `sidebarVisible` は使わない（ストレージに残っていても無害）。

---

## Chrome 拡張特有の制約

### サイドパネル（chrome.sidePanel）
- `sidePanel.open()` は **ユーザー操作の直後にしか呼べない**（キーボードショートカットは操作に含まれる）。`onCommand` の中で `await` を挟まず同期的に呼ぶこと。`await` を挟むと操作の扱いが切れて失敗する
- `sidePanel.close()` は Chrome 141 以上
- ツールバーアイコンのクリックでの開閉は `setPanelBehavior({ openPanelOnActionClick: true })`
- パネルの左右位置はユーザーが Chrome の設定で決める。拡張機能からは指定できない
- パネルの最小幅は公式ドキュメントに記載がない。Sidekick のような幅 50px の帯にはできない前提で、アイコンは格子状に折り返す

### 開閉トグルの状態管理
- 開いているウィンドウは、パネルからの `runtime.connect` ポート（名前 `sidepanel:<windowId>`）で background が把握する。パネルを閉じるとポートが切れる。パネルの再読み込みで新旧のポートが重なっても取り違えないよう、ウィンドウごとに本数で数える（`updatePanelCount`）
- Service Worker は約30秒操作が無いと停止し、状態が消える。パネルは開いている間 20 秒ごとにポートで ping を送り、停止を防ぐ。それでも切断されたら 500ms 後につなぎ直す
- `onCommand` の時点で状態を同期的に読めることが前提（ストレージから読むと `await` が要り、`open()` が失敗する）

### 並べ替え（sidepanel.js）
- ブラウザ標準のドラッグ&ドロップ（`draggable` / `dragstart` / `drop`）は使わない。サイドパネルで並べ替えができなかったため、pointer イベント（押す・動かす・離す）を自前で追う（2026-10-13）
- 離した位置にいちばん近いアイコンへ移動する（`utils.js` の `findNearestIndex`）。一覧の外で離したら取りやめ
- 5px 未満の動きはクリック扱い。ポインターの固定（`setPointerCapture`）は動き始めてから行う。押した時点で固定すると click の対象が一覧全体にすり替わり、アイコンのクリックでサイトが開かなくなる

### Manifest V3
- background は `service_worker` のみ。リスナーはトップレベルで同期的に登録する

### Storage 制約
- `chrome.storage.local` は **最大 5MB**
- アイコンを Base64 Data URL で保存するため、12件 × 300KB = 最大 3.6MB になりうる
- 容量超過時は必ずユーザーに通知する

### セキュリティ
- `background.js` の `isAllowedURL`、`utils.js` の `isValidURL` の両方で **http/https のみ許可**（`javascript:` / `file:` 等をブロック）
- アイコン画像は Data URL 化して保存するため、外部サーバーへのリクエストは発生しない
- サイドパネルは拡張機能のページなので、`alert` / `confirm` は使わず `<dialog>` とパネル内のメッセージ欄で知らせる

---

## コーディング規約（本プロジェクト固有）

- **JavaScript のみ**（TypeScript 不使用 — Chrome Extension の直接読み込み形式のため）
- **関数ベース**（class 不使用）
- **イミュータブル操作**: `utils.js` の配列操作は必ず新しい配列を返し、元配列を変更しない
- コメントは日本語
- `const` / `let` を使用、`var` 禁止

---

## キーボードショートカット仕様

すべて `manifest.json` の `commands` で定義し、`background.js` の `chrome.commands.onCommand` で処理する。ブラウザ側で処理されるので、Google Docs などページ側のショートカットに妨げられない。サイドパネルが閉じていてもブックマークは開ける。

| コマンド | 初期キー Mac（`MacCtrl`） | 初期キー Windows / Linux | 動作 |
|---|---|---|---|
| `toggle-side-panel` | `Control+Shift+A` | `Ctrl+Shift+A` | サイドパネルを開閉 |
| `open-bookmark-1` | `Control+Shift+Z` | `Ctrl+Shift+S` | ブックマーク 1 番目を開く |
| `open-bookmark-2` | `Control+Shift+X` | `Ctrl+Shift+D` | ブックマーク 2 番目を開く |
| `open-bookmark-3` | `Control+Shift+C` | `Ctrl+Shift+F` | ブックマーク 3 番目を開く |
| `open-bookmark-4` | なし（**要手動設定**、推奨 `Control+Shift+V`） | なし（要手動設定） | ブックマーク 4 番目を開く |
| `open-bookmark-5` | なし（**要手動設定**、推奨 `Control+Shift+B`） | なし（要手動設定） | ブックマーク 5 番目を開く |

Mac と Windows でキーを分けている理由（2026-10-13）: Mac の初期キーは名村さんの実際の割り当てに合わせた（`Control+Shift+G` は別アプリが使用中）。Windows で Z/X/C/V にすると、`Ctrl+Shift+C`（開発者ツール）・`Ctrl+Shift+V`（書式なし貼り付け）が Chrome 側で優先されて効かないため、S/D/F のままにした。

### Mac では `MacCtrl` を明示する（2026-10-13 教訓）
manifest の `Ctrl` は **Mac では Command キー** に解釈される。Control キーにしたいときは `"mac": "MacCtrl+Shift+A"` を併記する。これを書かなかったため、Control+Shift+A を押しても反応せず、⌘+Shift+A は Chrome のタブ検索に取られていた。

### Chrome の4コマンド制限
`suggested_key`（初期キー）を設定できるのは **最大4つ**。残りはユーザーが `chrome://extensions/shortcuts` で設定する。`suggested_key` の変更は、インストール済みの環境には反映されないことがある（そのときは同画面で設定し直す）。

### 使えないキー
`commands` では backtick（`` ` ``）や `Ctrl+Alt` の組み合わせは使えない。

---

## タブ制御仕様（background.js）

URL を開く際、**同一オリジン（プロトコル+ホスト名）のタブが既存の場合は最後にアクセスしたタブをフォーカス** する。存在しない場合のみ新規タブを作成。サイドパネルからのクリックもショートカットも、同じ関数 `openBookmarkURL` を通る。

---

## テスト

```bash
npm test              # 全テスト実行
npm run test:watch    # ウォッチモード
npm run test:coverage # カバレッジ確認
```

- テストは `tests/` 配下に配置
- 対象: `utils.js`（純粋関数）、`background.js`（純粋関数部分）
- `sidepanel.js` と Chrome API を使う部分は Jest で直接テストしにくい → 実機での手動確認が主（手順は `HANDOVER.md`）
- 拡張機能を読み込んだ自動 E2E は組んでいない（Chrome 正式版は起動オプション `--load-extension` を廃止したとされる。未検証。導入するなら Chrome for Testing か Playwright の拡張機能読み込みを調べる）
