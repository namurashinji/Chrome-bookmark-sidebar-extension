# PLAN.md — Chrome Bookmark Sidebar Extension

## プロジェクトのゴール

ブラウザ「Sidekick」（2025年8月終了）の左端アプリドックを、Chrome のサイドパネルで模したカスタムブックマークを Chrome 拡張機能として実装する。

- フレームワーク不使用（純粋 JavaScript）
- Manifest V3 準拠（Chrome 141 以上）
- キーボードショートカットで即座にブックマークを起動できる。ページ側のショートカットに妨げられず、サイドパネルを開いていなくても動く

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
| Phase 4 | サイドパネル型に作り直し・Mac のショートカット修正（MacCtrl） | 🔄 実装済み・実機確認待ち | — |

各 Phase の具体的な変更内容は `HANDOVER.md` の「変更履歴」を参照。

## 主要な意思決定と理由

### 決定 4: サイドパネル型に作り直す（2026-10-13）

**問題**: ページに注入するサイドバーは、ページ側の JavaScript（Google Docs など）にキー入力を先取りされ、新しいタブ画面など `chrome://` のページには出せない。

**調査**: Sidekick に近い既存の拡張機能（SidePin、Page Sidebar、Bookmark Sidebar Workspace など）を調べ、名村さんが Page Sidebar を試した。期待と違ったため、自作を続けることにした。

**決定**: `chrome.sidePanel` に移す。ショートカットはすべて `commands` に寄せる。

**トレードオフ**:
- サイドパネルは Sidekick のような幅 50px の帯にはできない。アイコンを格子状に折り返して幅を活かす
- 左右の位置は Chrome の設定でユーザーが決める（拡張機能から指定できない）
- 初期キーを設定できるのは4つまで。開閉に1枠使うため、初期キー付きのブックマークは3件になる（4・5番目は手動設定）
- 不透明度の切り替えは、ページに重ならなくなったので廃止（名村さん承認済み）

**開閉の実装**: `_execute_action`（アイコンクリック相当のコマンド）でパネルが開閉できるかは、公式ドキュメントで確認できなかった。そのため、確認できた `sidePanel.open()` / `close()` を使い、開いているウィンドウはパネルからのポート接続で把握する方式にした。

### 決定 5: Mac 用に MacCtrl を併記する（2026-10-13）

**問題**: Control+Shift+A/S/D/F が Google Docs・スプレッドシート・新しいタブ画面で効かなかった。

**原因**: manifest の `Ctrl` は Mac では Command キーに解釈される。拡張機能は ⌘+Shift+A 等で登録されており、Control キーには何も割り当たっていなかった。決定 1 の「根本原因」の分析は、この点を見落としていた。

**決定**: `suggested_key` に `"mac": "MacCtrl+Shift+..."` を併記する。

**追記（同日）**: 名村さんの環境では `Control+Shift+G` を別アプリが使っているため、ブックマークは Z/X/C/V/B に手動で割り当てた。Mac の初期キーもこれに合わせ、Z/X/C（4・5番目は V/B を推奨）にした。Windows は `Ctrl+Shift+C`（開発者ツール）・`Ctrl+Shift+V`（書式なし貼り付け）が Chrome 側で優先されて効かないため、S/D/F のままにした。

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

1. **手動設定ショートカットの案内**
   4・5番目は `chrome://extensions/shortcuts` での手動設定が必要。パネル内から設定画面を開く案内を出すとよい。

2. **Sidekick 風の右クリック履歴**
   Sidekick はアイコンの右クリックで、そのサイトの最近の閲覧履歴を出していた（`history` 権限が必要）。

3. （旧「SPA 対応の強化」はサイドパネル化で不要になった）

4. **ブックマーク数の上限引き上げ**
   現在 12 件。スクロール対応は実装済みのため、Storage 容量（最大 3.6MB）の許す範囲で増加可能。

5. **カテゴリ・グループ機能**
   ブックマークをグループ分けして折りたたみ表示。

6. **テスト拡充 / E2E テストの導入**
   `sidebar.js` は DOM 依存が強く Jest で直接テストできない。jsdom 環境でのテスト追加 or Playwright による E2E テストの導入。

7. **TypeScript 化**
   現在は純粋 JavaScript。Vite 等のビルドステップを導入すれば TypeScript 化可能。
