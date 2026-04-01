# PLAN.md — Chrome Bookmark Sidebar Extension

## プロジェクトのゴール

すべての HTTP/HTTPS ページの左端に常時表示される、シンプルで高速なカスタムブックマークサイドバーを Chrome 拡張機能として実装する。

- フレームワーク不使用（純粋 JavaScript）
- Manifest V3 準拠
- キーボードショートカットで即座にブックマークを起動できる

## 採用技術スタック

| 技術 | バージョン | 採用理由 |
|---|---|---|
| JavaScript | ES2022+ | Chrome Extension の直接読み込みのため TypeScript 不使用 |
| Manifest V3 | - | Chrome の現行標準（MV2 は廃止予定） |
| chrome.storage.local | - | ユーザーデータ（ブックマーク・表示状態）の永続化 |
| Jest | 最新 | 純粋関数（utils.js / background.js）のユニットテスト |

## 開発フェーズと進捗

### Phase 1: 初期実装（2026-03-31）✅

- [x] manifest.json（MV3）
- [x] sidebar.js（UI全体・IIFE・ドラッグ&ドロップ・キーボードショートカット）
- [x] background.js（Service Worker・タブ制御）
- [x] utils.js（純粋関数・isValidURL / removeAtIndex / moveItem / appendItem）
- [x] style.css（サイドバー・追加パネル・コンテキストメニュー）
- [x] tests/（utils.test.js / background.test.js）

### Phase 2: コードレビュー修正（2026-03-31）✅

セキュリティ・品質レビューに基づく修正。

- [x] `sidebar.js`: `innerHTML` → `createElement` + `appendChild`（XSS リスク排除）
- [x] `sidebar.js` / `style.css`: 汎用 ID に `bks-` プレフィックス付与（ID衝突防止）
- [x] `sidebar.js`: `setupAddPanel` を `initPanelState` + `setupAddPanel` に分割
- [x] `utils.js`: `moveItem` のミューテーション排除（`splice` → `slice` + スプレッド）
- [x] `utils.js`: `removeAtIndex` に境界値ガード追加
- [x] `background.js`: `getOriginPrefix` / `chooseMostRecentTab` を独立関数に抽出
- [x] `background.js`: `typeof chrome` ガードで Node.js 環境でも `require` 可能に

### Phase 3: キーボードショートカット修正（2026-04-01）✅

- [x] 原因特定：`Ctrl+Shift+A/S/D` は Chrome 組み込みショートカット（Search Tabs等）と競合し、content script の `keydown` リスナーに届かない
- [x] `manifest.json` に `commands` セクション追加（open-bookmark-1〜5）
- [x] `background.js` に `chrome.commands.onCommand` ハンドラ追加
- [x] Chrome の4コマンド上限対応：5番目（`Ctrl+Shift+G`）は `suggested_key` なし

## 主要な意思決定と理由

### 決定1: キーボードショートカットを manifest commands に移行（2026-04-01）

**問題**: `Ctrl+Shift+A/S/D/F/G` は Chrome がブラウザレベルで先取り処理するため、`capture: true` の content script keydown リスナーでも捕捉できなかった。

**決定**: ブックマーク起動ショートカット（A/S/D/F/G）を `manifest.json` の `commands` として定義し、`background.js` の `chrome.commands.onCommand` で処理するよう変更。

**理由**: 拡張機能コマンドは Chrome 組み込みショートカットより優先度が高く、確実に動作する。background（Service Worker）が `chrome.tabs` API に直接アクセスできるため、content script 経由のメッセージングも不要になりシンプル化できた。

**トレードオフ**: Chrome の `suggested_key` 上限（4コマンド）のため、5番目のブックマーク（`Ctrl+Shift+G`）はユーザーが `chrome://extensions/shortcuts` で手動設定する必要がある。

**変更しなかったもの**: トグル（`` Ctrl+Shift+` ``）・不透明度変更は backtick など `commands` で使えないキーのため、引き続き content script keydown リスナーで処理。

### 決定2: innerHTML を使わない DOM 生成（2026-03-31）

**問題**: `innerHTML` によるテンプレートリテラルは、将来的に動的な値を埋め込む際の XSS リスクがある。

**決定**: `document.createElement` + `appendChild` に統一。

### 決定3: ID に `bks-` プレフィックス（2026-03-31）

**問題**: `add-btn`、`url-input` など汎用的な ID はページ側の要素と衝突する可能性がある。

**決定**: 拡張機能固有の `bks-` プレフィックスを付与して名前空間を分離。

## 今後の改善候補

1. **Ctrl+Shift+G の自動設定**: 現在は手動設定が必要。オプションページで案内する UX を追加する
2. **SPA 対応の強化**: `MutationObserver` でルート要素の変化を監視し、サイドバーが消えた場合に再挿入
3. **ブックマーク数の上限引き上げ**: 現在12件。Storage 容量の許す範囲で増加可能
4. **E2E テストの導入**: `sidebar.js` は DOM 依存が強く Jest で直接テストできないため、Playwright による E2E テストを追加
5. **TypeScript 化**: Vite 等のビルドステップを導入すれば TypeScript 化可能
