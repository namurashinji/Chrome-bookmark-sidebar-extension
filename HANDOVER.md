# HANDOVER.md — 引き継ぎ資料

> このドキュメントは **現在の状態と変更履歴** を集約する。
> 仕様・アーキテクチャは `CLAUDE.md`、開発計画・意思決定は `PLAN.md`、ユーザー向け情報は `README.md` を参照。

新しいセッションで本プロジェクトに着手するときは、まず `CLAUDE.md` の仕様と規約を読み、次にこの HANDOVER で現状を把握すること。

---

## 現在の状態

| 項目 | 内容 |
|---|---|
| バージョン | 2.0（サイドパネル型） |
| 動作確認 | Chrome 141 以上（Manifest V3）。開発機は Chrome 155 |
| テスト | Jest ユニットテスト 71 件 PASS（`utils.js` / `background.js` の純粋関数部分） |
| 実機確認 | 2026-10-13 完了: 確認手順 1〜10 すべて問題なし（名村さん確認。パネルの最小幅は「問題なし」で、数値は未計測） |
| ショートカット（名村さんの環境） | 開閉 ⌃⇧A、ブックマーク1〜5 ⌃⇧Z/X/C/V/B（⌃⇧G は別アプリが使用中のため）。manifest の Mac 用初期キーもこれに合わせた（4・5番目は手動設定） |
| 残作業 | なし（改善候補は `PLAN.md`） |

---

## 開発環境セットアップ

```bash
# 依存パッケージのインストール（テスト実行のため）
npm install

# テスト実行
npm test

# Chrome への読み込み
# chrome://extensions/ → デベロッパーモード → パッケージ化されていない拡張機能を読み込む
```

---

## コード変更後の確認手順

1. `npm test` でユニットテストが全通過することを確認
2. `chrome://extensions/` の「更新」ボタンで拡張機能を再読み込み。Service Worker のエラー表示が無いこと。**ショートカットの初期キーを変えたときは、`chrome://extensions/shortcuts` で旧割り当てを消してから入れ直す**（Chrome はコマンド名ごとに古い割り当てを保持し、初期キーより優先する。実際の割り当ては `~/Library/Application Support/Google/Chrome/Default/Preferences` の `extensions.commands` で読める）
3. `chrome://extensions/shortcuts` で、開閉が ⌃⇧A、ブックマーク1〜3が ⌃⇧Z/X/C になっていること（⌘ になっていたら設定し直す）
4. ツールバーアイコンとショートカット（Control+Shift+A）の両方で、サイドパネルが開閉すること
5. 新しいタブ画面・Google Docs・Google スプレッドシートで、サイドパネルを閉じたまま Control+Shift+Z/X/C でブックマークが開くこと
6. 同じサイトのタブが開いているときは、新しいタブを作らずにそのタブへ移動すること
7. 追加（ドロップ・ファイル選択・Enter キー）、右クリック削除（確認ダイアログ）、ドラッグ並べ替えができること
8. ウィンドウを2つ開き、それぞれでパネルの開閉が独立して動くこと
9. パネルを開いたまま1分以上待ってから Control+Shift+A を押し、1回で閉じること（Service Worker の停止対策の確認）
10. パネルをできるだけ狭くして、アイコンが格子状に並ぶこと（最小幅を記録する）

---

## 変更履歴

### 2026-10-13: パネル内のドラッグ並べ替えが動かなかった問題を修正

名村さんの実機で、パネル内のドラッグ並べ替えができなかった。

| 対象ファイル | 変更内容 |
|---|---|
| `sidepanel.js` | ブラウザ標準のドラッグ&ドロップをやめ、pointer イベントで自前で並べ替える方式に変更。離した位置にいちばん近いアイコンへ移動する |
| `utils.js` | `findNearestIndex`（いちばん近いアイコンの番号）を追加 |
| `sidepanel.css` | 画像のドラッグとテキスト選択を止める指定を追加 |
| `tests/utils.test.js` | `findNearestIndex` のテストを追加（5件） |

**原因の絞り込み**: 旧方式でも、ドラッグのイベントをページ内から発生させると並べ替えは正しく動いた。そのため、原因は「アイコンの真上に正確に落とさないと無視される判定」か「サイドパネル内での標準ドラッグ&ドロップの挙動」のどちらかで、どちらとは確定していない。新方式はどちらにも依存しない。

**検証**: Chrome API を模した再現用の画面で、すき間へのドラッグ・普通のクリック・一覧の外で離す・ドラッグ後のクリックの4場面を確認した。自動操作ツールのマウス操作はページに届いたり届かなかったりして使えなかったため、pointer イベントをページ内から発生させて確かめた。実際のサイドパネルでも、名村さんが並べ替えとクリックの両方を確認した。

### 2026-10-13: サイドパネル型に作り直し（v2.0）

ページに注入していたサイドバーを、Chrome のサイドパネル（`chrome.sidePanel`）に移した。

| 対象ファイル | 変更内容 |
|---|---|
| `manifest.json` | `sidePanel` 権限と `side_panel` を追加、`content_scripts` を削除。`toggle-side-panel` コマンドを追加し、ショートカットを A=開閉 / S・D・F=ブックマーク1〜3 / 4・5番目=手動設定に再割り当て。Mac 用に `MacCtrl` を併記 |
| `background.js` | タブを開く処理（2か所に重複）を `openBookmarkURL` に一本化。サイドパネル開閉と、ポートによる開いているウィンドウの把握を追加。`findReusableTab` / `parsePanelPortName` / `updatePanelCount` を純粋関数として切り出し。パネルへ結果（ok）を返す |
| `sidepanel.html` / `sidepanel.js` / `sidepanel.css` | 新規。格子状のアイコン一覧・追加フォーム・右クリック削除（`<dialog>` で確認）・並べ替え。設定済みのショートカットをアイコンの説明に表示 |
| `tests/background.test.js` | `findReusableTab` / `parsePanelPortName` / `updatePanelCount` のテストを追加（15件） |

**削除したファイル**: 旧実装の `sidebar.js` / `style.css`（名村さんが `git rm` で削除。履歴から取り戻せる）。

**廃止した機能**: 不透明度の切り替え（Ctrl+Shift+＋/−）、`` Ctrl+Shift+` `` の開閉、表示状態の記憶（`sidebarVisible`）、iframe ガード・SPA 対応。いずれもページ注入型でのみ必要だったもの。

**ショートカットが効かなかった原因**: manifest の `Ctrl` は Mac では Command キーに解釈される。そのため、Control+Shift+A/S/D/F を押しても反応しなかった。⌘+Shift+A は Chrome のタブ検索に取られていた。`"mac": "MacCtrl+..."` を併記して解消した（2026-04-01 の記録の「根本原因」は、この点を見落としていた）。

### 2026-04-01: キーボードショートカットを manifest commands 方式に移行

Chrome 組み込みショートカットとの競合により `Ctrl+Shift+A/S/D/F/G` が動作しなかった問題を修正。

| 対象ファイル | 変更内容 |
|---|---|
| `manifest.json` | `commands` セクションを追加。`open-bookmark-1〜4` に `suggested_key` を設定。`open-bookmark-5` は Chrome の4コマンド上限のため `suggested_key` なし（ユーザーが手動設定） |
| `background.js` | `chrome.commands.onCommand` ハンドラを追加。ブックマーク開閉ロジックは既存の `getOriginPrefix` / `chooseMostRecentTab` を再利用 |

### 2026-03-31: コードレビューに基づくセキュリティ・品質修正

| 対象ファイル | 変更内容 |
|---|---|
| `utils.js` | `moveItem`: `splice` → `slice` + スプレッド構文に変更（内部ミューテーション排除） |
| `utils.js` | `removeAtIndex`: 負数・範囲外インデックスのガード追加 |
| `utils.js` | `ALLOWED_PROTOCOLS` に意図的重複の説明コメント追加 |
| `background.js` | `getOriginPrefix`, `chooseMostRecentTab` を独立関数として抽出 |
| `background.js` | `chrome.runtime.onMessage.addListener` を `typeof chrome` ガードで囲み、Node.js 環境でも `require` 可能に |
| `background.js` | `module.exports` を追加（テスト環境でのエクスポート対応） |
| `sidebar.js` | DOM 生成を `innerHTML` → `createElement` + `appendChild` に統一（XSS 将来リスク排除） |
| `sidebar.js` | `setupAddPanel`（93 行）を `initPanelState` + `setupAddPanel` に分割（各 50 行以内） |
| `sidebar.js` / `style.css` | 汎用 ID 名に `bks-` プレフィックスを付与（ページとの ID 衝突リスク排除） |
| `tests/background.test.js` | `isAllowedURL` 等の再実装を削除し `require('../background')` に統一 |
| `tests/utils.test.js` | `removeAtIndex` の境界値テストを追加 |

### 2026-03-31: Phase 1 初期実装完了

`manifest.json` / `sidebar.js` / `background.js` / `utils.js` / `style.css` / テスト一式を実装（詳細は `PLAN.md` の Phase 1 を参照）。
