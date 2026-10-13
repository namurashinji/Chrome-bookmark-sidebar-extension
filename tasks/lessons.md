# lessons.md — Chrome Bookmark Sidebar Extension

## 2026-10-13 - ポインターを押した時点で固定したら、アイコンのクリックでサイトが開かなくなった

**何が起きたか**: 並べ替えを pointer イベント方式に変えた最初の版で、`pointerdown` で `setPointerCapture` を呼んだ。そのため、ただのクリックでも click の対象が一覧全体になり、アイコンのクリックでサイトが開かなくなった。再現用の画面のイベント記録で気づいた。

**なぜ起きたか**: ポインターを固定すると、`pointerup` とそれに続く `click` の対象が、固定した要素にすり替わる。

**次回防ぐルール**:
- `setPointerCapture` はドラッグと判定した時点（しきい値を超えて動いた時点）で呼ぶ
- 操作方式を変えたら、新しい操作だけでなく既存の操作（クリック）が残っているかも同じ検証で確かめる

**CLAUDE.md への反映要否**: 反映済み（「並べ替え（sidepanel.js）」節）

## 2026-10-13 - Mac で manifest の Ctrl が Command になり、ショートカットが半年効いていなかった

**何が起きたか**: Control+Shift+A/S/D/F が Google Docs・スプレッドシート・新しいタブ画面で効かなかった。2026-04-01 に「Chrome 組み込みショートカットとの競合」と診断して commands 方式に移したが、Mac では直っていなかった。

**なぜ起きたか**: `commands` の `suggested_key` の `Ctrl` は、Mac では Command キーに解釈される。拡張機能は ⌘+Shift+A 等で登録されていた。⌘+Shift+A は Chrome のタブ検索に取られ、Control+Shift+A には何も割り当たっていなかった。前回は「どのキーを押しているか」と「`chrome://extensions/shortcuts` に何と表示されているか」を確かめずに原因を断定した。

**次回防ぐルール**:
- ショートカットの不具合は、まず `chrome://extensions/shortcuts` の表示と、実際に押している物理キーを突き合わせる
- Mac で Control キーを使うときは `"mac": "MacCtrl+..."` を必ず併記する
- `suggested_key` の変更はインストール済みの環境に反映されないことがある。確認の前に、同画面で設定し直す

**CLAUDE.md への反映要否**: 反映済み（「キーボードショートカット仕様」の「Mac では MacCtrl を明示する」）

## 2026-10-13 - キーの割り当てを変えたのに、手動設定した旧割り当てが残って新しい開閉キーが効かなかった

**何が起きたか**: 作り直しで Control+Shift+A を「ブックマーク1番目」から「サイドパネル開閉」に付け替えたが、実機では ⌃⇧A でブックマーク1番目が開いた。

**なぜ起きたか**: 直前の修正で、名村さんに ⌃⇧A を `open-bookmark-1` へ手動で入れてもらっていた。Chrome は手動の割り当てをコマンド名ごとに保持し（`~/Library/Application Support/Google/Chrome/Default/Preferences` の `extensions.commands`）、manifest の初期キーより優先する。⌃⇧A が埋まっているので、新しい `toggle-side-panel` は無割り当てになった。

**次回防ぐルール**:
- 既存コマンドのキーを付け替えるときは、`chrome://extensions/shortcuts` で旧割り当てを消してから入れ直す手順を、実機確認の最初に案内する
- 「効かない」と言われたら、まず上記 Preferences の `extensions.commands` を読み取り専用で確認する（推測より速く確実）

**CLAUDE.md への反映要否**: 反映済み（「Chrome の4コマンド制限」節の、初期キーの変更が反映されない件）。HANDOVER の確認手順にも記載
