# PLAN.md — Chrome Bookmark Sidebar Extension

## プロジェクトのゴール

すべての HTTP/HTTPS ページの左端に常時表示される、シンプルで高速なカスタムブックマークサイドバーを Chrome 拡張機能として実装する。

- フレームワーク不使用（純粋 JavaScript）
- Manifest V3 準拠
- キーボードショートカットで即座にブックマークを起動できる

## 採用技術スタック

| 技術 | バージョン | 採用理由 |
|---|---|---|
| JavaScript | ES2022+ | Chrome Extension の直接読み込み形式のため TypeScript 不使用 |
| Manifest V3 | - | Chrome の現行標準（MV2 は廃止予定） |
| chrome.storage.local | - | ユーザーデータ（ブックマーク・表示状態）の永続化 |
| Jest | 最新 | 純粋関数（`utils.js` / `background.js`）のユニットテスト |

## 開発フェーズと進捗

| Phase | 内容 | 状態 | 完了日 |
|---|---|---|---|
| Phase 1 | 初期実装（manifest / sidebar / background / utils / style / tests 一式） | ✅ 完了 | 2026-03-31 |
| Phase 2 | セキュリティ・品質レビュー修正（XSS リスク排除・ID 衝突防止・ミューテーション排除ほか） | ✅ 完了 | 2026-03-31 |
| Phase 3 | キーボードショートカット修正（manifest commands 移行） | ✅ 完了 | 2026-04-01 |

各 Phase の具体的な変更内容は `HANDOVER.md` の「変更履歴」を参照。

## 主要な意思決定と理由

### 決定 1: キーボードショートカットを manifest commands 方式に移行（2026-04-01）

**問題**: `Ctrl+Shift+A/S/D/F/G` は Chrome がブラウザレベルで先取り処理するため、`capture: true` の content script keydown リスナーでも捕捉できなかった。

**決定**: ブックマーク起動ショートカット（A/S/D/F/G）を `manifest.json` の `commands` として定義し、`background.js` の `chrome.commands.onCommand` で処理する。

**理由**: 拡張機能コマンドは Chrome 組み込みショートカットより優先度が高く、確実に動作する。background（Service Worker）が `chrome.tabs` API に直接アクセスできるため、content script 経由のメッセージングも不要になりシンプル化できた。

**トレードオフ**: Chrome の `suggested_key` 上限（4 コマンド）のため、5 番目のブックマーク（`Ctrl+Shift+G`）はユーザーが `chrome://extensions/shortcuts` で手動設定する必要がある。

**変更しなかったもの**: トグル（`` Ctrl+Shift+` ``）・不透明度変更は backtick など `commands` で使えないキーのため、引き続き content script keydown リスナーで処理する。

### 決定 2: `innerHTML` を使わない DOM 生成（2026-03-31）

**問題**: `innerHTML` によるテンプレートリテラルは、将来的に動的な値を埋め込む際の XSS リスクがある。

**決定**: `document.createElement` + `appendChild` に統一。

### 決定 3: ID に `bks-` プレフィックス（2026-03-31）

**問題**: `add-btn`、`url-input` など汎用的な ID はページ側の要素と衝突する可能性がある。

**決定**: 拡張機能固有の `bks-` プレフィックスを付与して名前空間を分離。

## 今後の改善候補

1. **ショートカットキーのカスタマイズ機能**
   現在は `Ctrl+Shift+A〜G` 固定。設定画面から変更できるとよい。

2. **`Ctrl+Shift+G` の自動設定案内**
   現在は手動設定が必要。オプションページで案内する UX を追加する。

3. **SPA 対応の強化**
   `MutationObserver` でルート要素の変化を監視し、サイドバーが消えた場合に再挿入する仕組み。

4. **ブックマーク数の上限引き上げ**
   現在 12 件。スクロール対応は実装済みのため、Storage 容量（最大 3.6MB）の許す範囲で増加可能。

5. **カテゴリ・グループ機能**
   ブックマークをグループ分けして折りたたみ表示。

6. **テスト拡充 / E2E テストの導入**
   `sidebar.js` は DOM 依存が強く Jest で直接テストできない。jsdom 環境でのテスト追加 or Playwright による E2E テストの導入。

7. **TypeScript 化**
   現在は純粋 JavaScript。Vite 等のビルドステップを導入すれば TypeScript 化可能。
