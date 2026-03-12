# HANDOVER.md — 引き継ぎ資料

## プロジェクト概要

Chrome拡張機能「Custom Bookmark Sidebar」の開発引き継ぎ資料。
すべての HTTP/HTTPS ページの左端にブックマークサイドバーを表示する拡張機能。

## 現在の状態（2026年3月時点）

- **バージョン**: 1.0
- **動作確認**: Chrome（Manifest V3）
- **テスト**: Jest によるユニットテストあり（`utils.js`, `background.js` の純粋関数部分）

## アーキテクチャ

### コンポーネント構成

```
┌─────────────────────────────────────────────┐
│ ブラウザページ（全HTTP/HTTPSページ）            │
│                                             │
│  ┌────────────┐        ┌────────────────┐  │
│  │ sidebar.js  │──msg──▶│ background.js  │  │
│  │（UI・制御）  │        │（タブ制御SW）  │  │
│  └────────────┘        └────────────────┘  │
│         │                                  │
│         ▼                                  │
│  ┌────────────┐                            │
│  │ utils.js   │                            │
│  │（純粋関数） │                            │
│  └────────────┘                            │
└─────────────────────────────────────────────┘
         │
         ▼
  chrome.storage.local
  ┌───────────────────────────┐
  │ bookmarks: [{icon, url}]  │  ← アイコンはBase64 Data URL
  │ sidebarVisible: boolean   │
  └───────────────────────────┘
```

### 各ファイルの責務

| ファイル | 役割 | 特記事項 |
|---|---|---|
| `manifest.json` | 拡張機能の設定 | MV3。パーミッション: storage, tabs |
| `background.js` | Service Worker | URLを受け取り、同一オリジンのタブを再利用または新規作成 |
| `sidebar.js` | コンテンツスクリプト | IIFE でグローバル汚染を防止。DOM生成・イベント管理・Storage操作 |
| `utils.js` | ユーティリティ | Chrome API 依存なし。Node.js（Jest）でそのまま動く純粋関数 |
| `style.css` | スタイル | `z-index: 2147483647`（最前面）。サイドバー・アイコン・追加パネル |

## 既知の制限事項・注意点

### iframe ページについて
`sidebar.js` の冒頭で `window !== window.top` チェックを行い、iframe 内では実行しない設計。
クロスオリジン iframe では `window.top` へのアクセス自体が例外を投げるため、`try/catch` で囲んでいる。
この処理を削除すると、iframe を多用するページでサイドバーが重複して表示される。

### Storage 容量について
アイコンを Base64 Data URL として `chrome.storage.local` に保存する。
`chrome.storage.local` の上限は 5MB。
12件 × 300KB = 最大 3.6MB まで使用する可能性がある。
容量超過時はエラーをユーザーに通知する実装済み。

### Service Worker の休眠について
MV3 の Service Worker は非活動時に停止する。
`openURL` 関数内で `chrome.runtime.sendMessage` が失敗した場合、`window.open` にフォールバックする実装済み。

### SPA（シングルページアプリ）対応について
`init()` 関数の冒頭で `document.getElementById(SIDEBAR_ID)` の存在チェックを行い、重複実行を防止している。
ただし、SPA が DOM を完全に再構築する場合（React の root 置き換えなど）はサイドバーが消える可能性がある。未対応。

### キーボードショートカットの競合
`document.addEventListener('keydown', ..., true)` の `capture: true` により、ページ側リスナーより先に実行される。
一部の Web アプリ（Google Docs, Notion 等）でショートカットが競合する可能性がある。

## 今後の改善候補（優先度順）

1. **ショートカットキーのカスタマイズ機能**
   現在は `Ctrl+Shift+A〜G` 固定。設定画面から変更できるとよい。

2. **SPA 対応の強化**
   `MutationObserver` でルート要素の変化を監視し、サイドバーが消えた場合に再挿入する仕組み。

3. **ブックマーク数の上限引き上げ**
   現在12件。スクロール対応は実装済みのため、Storage 容量の許す範囲で増加可能。

4. **カテゴリ・グループ機能**
   ブックマークをグループ分けして折りたたみ表示。

5. **テスト拡充**
   `sidebar.js` は DOM 依存が強く Jest で直接テストできない。jsdom 環境でのテスト追加 or Playwright による E2E テストの導入。

6. **TypeScript 化**
   現在は純粋 JavaScript。Chrome Extension の直接読み込み形式のままなら、ビルドステップ（Vite 等）を導入すれば TypeScript 化可能。

## 開発環境セットアップ

```bash
# 依存パッケージのインストール（テスト実行のため）
npm install

# テスト実行
npm test

# Chrome への読み込み
# chrome://extensions/ → デベロッパーモード → パッケージ化されていない拡張機能を読み込む
```

## コード変更後の確認手順

1. `npm test` でユニットテストが全通過することを確認
2. `chrome://extensions/` の「更新」ボタンで拡張機能を再読み込み
3. 通常ページでサイドバーが表示されることを確認
4. iframe を含むページ（YouTube 等）で重複表示されないことを確認
5. SPA（Gmail、Google Maps 等）でサイドバーが正常動作することを確認

## データ構造

```javascript
// chrome.storage.local に保存される内容

// ブックマーク一覧
bookmarks: [
  {
    icon: "data:image/png;base64,...",  // Base64 Data URL（最大300KB）
    url: "https://example.com"          // http/https のみ許可
  },
  // ... 最大12件
]

// サイドバーの表示状態
sidebarVisible: true  // boolean、デフォルト: true
```
