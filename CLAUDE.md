# CLAUDE.md — Chrome Bookmark Sidebar Extension

## プロジェクト概要

すべての HTTP/HTTPS ページの左端に固定表示される50px幅のカスタムブックマークサイドバー（Chrome拡張機能）。
Manifest V3 準拠。フレームワーク不使用の純粋な JavaScript 実装。

## ファイル構成と役割

```
Chrome-bookmark-sidebar-extension/
├── manifest.json        # 拡張機能メタ情報・パーミッション定義（MV3）
├── background.js        # サービスワーカー：URLを受け取りタブ制御
├── sidebar.js           # コンテンツスクリプト：UI全体の生成・制御
├── utils.js             # 純粋関数のみ（isValidURL, removeAtIndex, moveItem, appendItem）
├── style.css            # サイドバー・アイコン・パネルのスタイル
├── tests/
│   ├── utils.test.js    # utils.js のユニットテスト
│   └── background.test.js # background.js のユニットテスト
└── package.json         # Jest 設定
```

## 重要な設計上の制約

### Chrome Extension 特有の制約
- **Manifest V3 必須**: background は service_worker のみ（persistent background page 不可）
- **Content Script のスコープ**: `sidebar.js` は全ページに注入される。グローバル汚染を避けるため IIFE で包むこと
- **IIFE 内の chrome API**: `utils.js` のユーティリティ関数は Chrome API を含まない純粋関数として実装し、テスト可能性を保つこと
- **iframe ガード**: クロスオリジン iframe では `window.top` アクセスが例外を投げるため、`sidebar.js` 冒頭の try/catch ガードを必ず維持する

### Storage 制約
- `chrome.storage.local` を使用（最大 5MB）
- アイコンを Base64 Data URL で保存するため、12件 × 300KB = 最大 3.6MB になりうる
- Storage 容量エラーは必ずユーザーに通知すること

### セキュリティ上の注意
- `background.js` で `javascript:`, `file:` 等の不正プロトコルを必ずブロックすること（`isAllowedURL` 関数）
- `utils.js` の `isValidURL` も同様に http/https のみ許可
- アイコン画像は Data URL 化して保存するため、外部サーバーへのリクエストは発生しない

## コーディング規約（このプロジェクト固有）

- **JavaScript のみ**（TypeScript 不使用 — Chrome Extension の直接読み込みのため）
- **関数ベース**（class 不使用）
- **イミュータブル操作**: `utils.js` の配列操作は必ず新しい配列を返し、元配列を変更しない
- コメントは日本語で記載
- `const` / `let` を使用、`var` 禁止

## テスト

```bash
npm test             # 全テスト実行
npm run test:watch   # ウォッチモード
npm run test:coverage # カバレッジ確認
```

- テストは `tests/` ディレクトリに配置
- テスト対象: `utils.js`（純粋関数）、`background.js`（`isAllowedURL` 関数）
- `sidebar.js` は DOM 依存が強く Jest では直接テスト困難 → 手動確認が主

## キーボードショートカット仕様（変更時は要注意）

| ショートカット | 動作 |
|---|---|
| `Ctrl+Shift+\`` | サイドバーの表示/非表示トグル |
| `Ctrl+Shift+A` | ブックマーク 1番目を開く |
| `Ctrl+Shift+S` | ブックマーク 2番目を開く |
| `Ctrl+Shift+D` | ブックマーク 3番目を開く |
| `Ctrl+Shift+F` | ブックマーク 4番目を開く |
| `Ctrl+Shift+G` | ブックマーク 5番目を開く |
| `Ctrl+Shift++` | 不透明度 100% |
| `Ctrl+Shift+-` | 不透明度 75% |

ショートカットはページ側リスナーより先に実行するため `capture: true` を使用している。変更時はページとの競合に注意。

## タブ制御の仕様（background.js）

URLを開く際、**同一オリジン（プロトコル＋ホスト名）のタブが既存の場合はそのタブをフォーカス**する（最後にアクセスしたタブを優先）。存在しない場合のみ新規タブを作成する。

Service Worker が休眠中の場合、`sidebar.js` 内で `window.open` にフォールバックする。

## インストール方法（開発時）

1. `chrome://extensions/` → デベロッパーモードON
2. 「パッケージ化されていない拡張機能を読み込む」→ このディレクトリを選択
3. コードを変更した場合は拡張機能ページの「更新」ボタンを押す
