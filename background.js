// background.js - Service Worker（タブ制御・ショートカット・サイドパネル開閉）

// ALLOWED_PROTOCOLS は utils.js にも同一定義がある。
// Chrome Extension のスコープ分離により共有できないため意図的な重複。
// 変更時は utils.js も合わせて更新すること。
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

// サイドパネルが接続してくるポート名の接頭辞（後ろにウィンドウ ID が付く）
const PANEL_PORT_PREFIX = 'sidepanel:';

// manifest.json の commands とブックマークの並び順の対応
const BOOKMARK_COMMAND_IDX = {
  'open-bookmark-1': 0,
  'open-bookmark-2': 1,
  'open-bookmark-3': 2,
  'open-bookmark-4': 3,
  'open-bookmark-5': 4,
};
const TOGGLE_COMMAND = 'toggle-side-panel';

/**
 * URLが許可されたプロトコル（http / https）かチェック
 * @param {string} url
 * @returns {boolean}
 */
function isAllowedURL(url) {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * URLからオリジンプレフィックス（プロトコル＋ホスト）を取得する
 * @param {string} url
 * @returns {string|null}
 */
function getOriginPrefix(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol + '//' + parsed.host;
  } catch {
    return null;
  }
}

/**
 * lastAccessed が最大のタブを選択する
 * @param {chrome.tabs.Tab[]} tabs
 * @returns {chrome.tabs.Tab}
 */
function chooseMostRecentTab(tabs) {
  return tabs.reduce((best, t) =>
    (t.lastAccessed || 0) > (best.lastAccessed || 0) ? t : best
  );
}

/**
 * 開こうとしている URL と同一オリジンのタブのうち、最後にアクセスしたものを返す
 * @param {chrome.tabs.Tab[]} tabs
 * @param {string} url
 * @returns {chrome.tabs.Tab|null} 該当なしは null
 */
function findReusableTab(tabs, url) {
  const targetPrefix = getOriginPrefix(url);
  if (!targetPrefix) return null;
  const matched = tabs.filter(tab => getOriginPrefix(tab.url) === targetPrefix);
  return matched.length > 0 ? chooseMostRecentTab(matched) : null;
}

/**
 * ポート名からウィンドウ ID を取り出す
 * @param {string} name
 * @returns {number|null} 対象外の名前・不正な値は null
 */
function parsePanelPortName(name) {
  if (typeof name !== 'string' || !name.startsWith(PANEL_PORT_PREFIX)) return null;
  const idText = name.slice(PANEL_PORT_PREFIX.length);
  // Number('') が 0 になるのを避けるため、数字だけの文字列に限る
  return /^\d+$/.test(idText) ? Number(idText) : null;
}

/**
 * ウィンドウごとの接続中パネル数に delta を足した新しい Map を返す（元の Map は変更しない）
 * パネルの再読み込みで新旧のポートが一時的に重なっても取り違えないよう、本数で数える
 * @param {Map<number, number>} counts
 * @param {number} windowId
 * @param {number} delta +1（接続）または -1（切断）
 * @returns {Map<number, number>} 0 以下になったウィンドウは取り除く
 */
function updatePanelCount(counts, windowId, delta) {
  const next = new Map(counts);
  const count = (counts.get(windowId) || 0) + delta;
  if (count > 0) next.set(windowId, count);
  else next.delete(windowId);
  return next;
}

// 同一オリジンのタブがあればフォーカスし、無ければ新規タブで開く
async function openBookmarkURL(url) {
  // 不正プロトコル（javascript:, file: 等）は処理しない
  if (!isAllowedURL(url)) return;
  const tabs = await chrome.tabs.query({});
  const target = findReusableTab(tabs, url);
  if (target) {
    await chrome.windows.update(target.windowId, { focused: true });
    await chrome.tabs.update(target.id, { active: true });
  } else {
    await chrome.tabs.create({ url, active: true });
  }
}

async function openBookmarkAt(idx) {
  const { bookmarks = [] } = await chrome.storage.local.get({ bookmarks: [] });
  const b = Array.isArray(bookmarks) ? bookmarks[idx] : undefined;
  if (b?.url) await openBookmarkURL(b.url);
}

// Chrome Extension の実行環境（Service Worker）でのみリスナーを登録する。
// Node.js（テスト環境）ではスキップされる。
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  // ウィンドウごとの接続中パネル数。パネルはポートで接続し、閉じると切断される。
  // パネルは開いている間 ping を送り続けるので Service Worker は停止しない。
  // それでも停止した場合は、パネル側がつなぎ直して復元する（sidepanel.js）
  let panelCounts = new Map();

  chrome.runtime.onConnect.addListener((port) => {
    const windowId = parsePanelPortName(port.name);
    if (windowId == null) return;
    panelCounts = updatePanelCount(panelCounts, windowId, +1);
    // パネルからの ping を受け取るだけ（受信のたびに Service Worker の停止が先送りされる）
    port.onMessage.addListener(() => {});
    port.onDisconnect.addListener(() => {
      panelCounts = updatePanelCount(panelCounts, windowId, -1);
    });
  });

  // 結果をパネルに返し、失敗をパネル側で表示できるようにする
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action !== 'open_url' || typeof message.url !== 'string') return;
    if (!isAllowedURL(message.url)) {
      sendResponse({ ok: false });
      return;
    }
    openBookmarkURL(message.url)
      .then(() => sendResponse({ ok: true }))
      .catch(err => {
        console.error('URL を開けません:', err);
        sendResponse({ ok: false });
      });
    return true; // 非同期で sendResponse する
  });

  // manifest.json の commands はブラウザ側で処理されるため、ページ側のショートカットに妨げられない
  chrome.commands.onCommand.addListener((command, tab) => {
    if (command === TOGGLE_COMMAND) {
      // sidePanel.open() はユーザー操作の直後にしか呼べないため、await を挟まず同期的に呼ぶ
      const windowId = tab?.windowId;
      if (windowId == null) {
        console.warn('対象のウィンドウが分からないため、サイドパネルを開閉できません');
        return;
      }
      const action = panelCounts.has(windowId)
        ? chrome.sidePanel.close({ windowId })
        : chrome.sidePanel.open({ windowId });
      action.catch(err => console.error('サイドパネルの開閉に失敗:', err));
      return;
    }

    const idx = BOOKMARK_COMMAND_IDX[command];
    if (idx == null) return;
    openBookmarkAt(idx).catch(err => console.error('ブックマークを開けません:', err));
  });

  // ツールバーアイコンのクリックでサイドパネルを開閉する（upsert なので起動のたびに設定してよい）。
  // 万一の例外でリスナー登録が飛ばないよう、登録の後に置く
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(err => console.error('setPanelBehavior に失敗:', err));
}

// Node.js（テスト環境）向けに純粋ロジックのみエクスポートする。
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isAllowedURL,
    getOriginPrefix,
    chooseMostRecentTab,
    findReusableTab,
    parsePanelPortName,
    updatePanelCount,
    PANEL_PORT_PREFIX,
  };
}
