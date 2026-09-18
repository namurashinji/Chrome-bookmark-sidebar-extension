# CLAUDE.md — Chrome Bookmark Sidebar Extension

> Chrome 拡張機能「Custom Bookmark Sidebar」の **仕様と規律** を集約する。
> 現在の状態・変更履歴は `HANDOVER.md`、開発計画・意思決定は `PLAN.md`、ユーザー向け情報は `README.md` を参照。

---

## システム構成

```
┌─────────────────────────────────────────────┐
│ ブラウザページ（全 HTTP/HTTPS ページ）      │
│                                             │
│  ┌────────────┐        ┌────────────────┐  │
│  │ sidebar.js │──msg──▶│ background.js  │  │
│  │（UI・制御）│        │（タブ制御 SW） │  │
│  └────────────┘        └────────────────┘  │
│         │                                  │
│         ▼                                  │
│  ┌────────────┐                            │
│  │ utils.js   │                            │
│  │（純粋関数）│                            │
│  └────────────┘                            │
└─────────────────────────────────────────────┘
         │
         ▼
  chrome.storage.local
  ┌───────────────────────────┐
  │ bookmarks: [{icon, url}]  │  ← アイコンは Base64 Data URL
  │ sidebarVisible: boolean   │
  └───────────────────────────┘
```

---

## ファイル構成と責務

| ファイル | 役割 | 特記事項 |
|---|---|---|
| `manifest.json` | 拡張機能メタ情報 | MV3。パーミッション: `storage`, `tabs` |
| `background.js` | Service Worker | URL を受け取り、同一オリジンのタブを再利用または新規作成 |
| `sidebar.js` | コンテンツスクリプト | IIFE でグローバル汚染防止。DOM 生成・イベント管理・Storage 操作 |
| `utils.js` | ユーティリティ | Chrome API 非依存の純粋関数（`isValidURL` / `removeAtIndex` / `moveItem` / `appendItem`）。Node.js（Jest）でそのまま動く |
| `style.css` | スタイル | `z-index: 2147483647`（最前面）。サイドバー・アイコン・追加パネル |
| `tests/utils.test.js` | ユニットテスト | `utils.js` の純粋関数 |
| `tests/background.test.js` | ユニットテスト | `background.js` の `isAllowedURL` |

---

## データ構造（chrome.storage.local）

```javascript
// ブックマーク一覧
bookmarks: [
  {
    icon: "data:image/png;base64,...",  // Base64 Data URL（最大 300KB）
    url:  "https://example.com"          // http/https のみ許可
  },
  // ... 最大12件
]

// サイドバーの表示状態
sidebarVisible: true   // boolean、デフォルト: true
```

---

## Chrome 拡張特有の制約

### Manifest V3
- background は `service_worker` のみ（persistent background page 不可）
- Service Worker は非活動時に停止する。`chrome.runtime.sendMessage` が失敗した場合、`sidebar.js` 内で `window.open` にフォールバックする実装済み

### Content Script のスコープ
- `sidebar.js` は全ページに注入される。グローバル汚染を避けるため **IIFE で包む**
- `utils.js` は Chrome API を含まない純粋関数として実装し、Jest でテスト可能にする

### iframe ガード（削除禁止）
`sidebar.js` 冒頭で `window !== window.top` を判定し、iframe 内では実行しない。クロスオリジン iframe では `window.top` アクセスが例外を投げるため、必ず `try/catch` で囲むこと。削除すると iframe を多用するページ（YouTube 等）でサイドバーが重複表示される。

### Storage 制約
- `chrome.storage.local` は **最大 5MB**
- アイコンを Base64 Data URL で保存するため、12件 × 300KB = 最大 3.6MB になりうる
- 容量超過時は必ずユーザーに通知する

### セキュリティ
- `background.js` の `isAllowedURL`、`utils.js` の `isValidURL` の両方で **http/https のみ許可**（`javascript:` / `file:` 等をブロック）
- アイコン画像は Data URL 化して保存するため、外部サーバーへのリクエストは発生しない

### SPA 対応
`init()` 冒頭で `document.getElementById(SIDEBAR_ID)` の存在チェックを行い重複挿入を防止。ただし React の root 置き換えなど DOM 完全再構築には未対応（改善候補は `PLAN.md`）。

---

## コーディング規約（本プロジェクト固有）

- **JavaScript のみ**（TypeScript 不使用 — Chrome Extension の直接読み込み形式のため）
- **関数ベース**（class 不使用）
- **イミュータブル操作**: `utils.js` の配列操作は必ず新しい配列を返し、元配列を変更しない
- コメントは日本語
- `const` / `let` を使用、`var` 禁止

---

## キーボードショートカット仕様

| ショートカット | 動作 | 実装方式 |
|---|---|---|
| `` Ctrl+Shift+` `` | サイドバー表示/非表示トグル | content script keydown |
| `Ctrl+Shift+A` | ブックマーク 1 番目を開く | manifest commands |
| `Ctrl+Shift+S` | ブックマーク 2 番目を開く | manifest commands |
| `Ctrl+Shift+D` | ブックマーク 3 番目を開く | manifest commands |
| `Ctrl+Shift+F` | ブックマーク 4 番目を開く | manifest commands |
| `Ctrl+Shift+G` | ブックマーク 5 番目を開く | manifest commands（**要手動設定**） |
| `Ctrl+Shift++` | 不透明度 100% | content script keydown |
| `Ctrl+Shift+-` | 不透明度 75% | content script keydown |

### 実装方式の使い分け

- **manifest commands**（`manifest.json` の `commands` セクション）: `Ctrl+Shift+A/S/D/F` など Chrome 組み込みショートカット（Search Tabs 等）と重複するキーに使用。拡張機能コマンドは Chrome 組み込みより優先され、`background.js` の `chrome.commands.onCommand` で処理される
- **content script keydown**: backtick（`` ` ``）は `manifest.json` の `commands` で使えないキーのため、`capture: true` の DOM リスナーで処理。一部の Web アプリ（Google Docs, Notion 等）と競合する可能性あり

### Chrome の4コマンド制限

`manifest.json` の `commands` に `suggested_key` を設定できるのは **最大4つ**。5番目の `Ctrl+Shift+G` は `suggested_key` なしで定義しており、ユーザーが `chrome://extensions/shortcuts` で手動設定する必要がある。

---

## タブ制御仕様（background.js）

URL を開く際、**同一オリジン（プロトコル+ホスト名）のタブが既存の場合は最後にアクセスしたタブをフォーカス** する。存在しない場合のみ新規タブを作成。

Service Worker 休眠中は `sidebar.js` 内で `window.open` にフォールバック。

---

## テスト

```bash
npm test              # 全テスト実行
npm run test:watch    # ウォッチモード
npm run test:coverage # カバレッジ確認
```

- テストは `tests/` 配下に配置
- 対象: `utils.js`（純粋関数）、`background.js`（`isAllowedURL` 関数）
- `sidebar.js` は DOM 依存が強く Jest では直接テスト困難 → 手動確認が主
