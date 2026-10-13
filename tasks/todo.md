# サイドパネル型への作り直し（2026-10-13 着手）

## 前提（調査で確定した仕様）
- 公式 sidePanel API: `open()` はユーザー操作（キーボードショートカットを含む）が必要。`close()` は Chrome 141+、`onOpened` 141+、`onClosed` 142+。手元の Chrome は 155
- `setPanelBehavior({ openPanelOnActionClick: true })` でツールバーアイコンのクリックが開閉トグルになる
- パネルの左右位置は Chrome の設定でユーザーが決める（拡張機能からは指定不可。`getLayout()` で読むだけ）
- パネルの最小幅は公式ドキュメントに記載なし → 実機で確認する
- サイドパネル内での `alert` / `confirm` の動作は未確認 → 使わず、パネル内の確認 UI にする

## 計画
- [x] 0. MacCtrl 修正（manifest の `"mac": "MacCtrl+Shift+A/S/D/F"`）を名村さんの実機で確認（作り直し後の manifest に取り込み済みなので、6 の実機確認で一緒に確かめ、作り直しと一緒にコミットする）
- [x] 1. `manifest.json`: `sidePanel` 権限と `side_panel.default_path` を追加、`content_scripts` を削除、トグル用 `toggle-side-panel`（Ctrl+Shift+A。ブックマークは S/D/F と手動2件）を追加。MacCtrl 指定はそのまま引き継ぐ
- [x] 2. `background.js`: 起動時に `setPanelBehavior` を設定。タブを開く処理（2か所に重複）を1関数にまとめる
- [x] 3. `sidepanel.html` / `sidepanel.js` / `sidepanel.css` を新規作成（アイコン一覧・追加フォーム・右クリック削除・並べ替え）
- [x] 4. テスト: 既存テストを通す。background のタブを開く関数のテストを追加
- [x] 5. 旧 `sidebar.js` / `style.css` の削除（名村さんが `git rm` で実施）
- [ ] 6. 実機確認（新しいタブ・Google Docs・スプレッドシートでのショートカット、追加・削除・並べ替え、パネル最小幅）
- [x] 7. CLAUDE.md / HANDOVER.md / README.md / PLAN.md を更新、code-reviewer でレビュー

## レビュー
- 実装・ユニットテスト（66件）・code-reviewer のレビューまで完了。レビューの MEDIUM 4件（SW 停止直後のトグル不発、ポートの本数管理、外部ドロップでの誤並べ替え、windowId 取得は実機確認へ）と LOW の一部を修正
- 見送った LOW: アイコン Data URL の形式検証、URL 重複判定の正規化、render の競合、キーボード操作対応（スコープ外として PLAN の改善候補に回せる）
- 実機確認済み: 開閉ショートカット、1分放置後の開閉、2ウィンドウでの独立した開閉、Control キーでの登録（Chrome の Preferences で確認）
- 未完了: 6 の残り（Google Docs 等でのブックマーク起動、タブ再利用、追加・削除・並べ替え、最小幅）
