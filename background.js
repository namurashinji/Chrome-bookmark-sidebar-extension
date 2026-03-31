// background.js

// ALLOWED_PROTOCOLS は utils.js にも同一定義がある。
// Chrome Extension のスコープ分離により共有できないため意図的な重複。
// 変更時は utils.js も合わせて更新すること。
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

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

// Chrome Extension の実行環境（Service Worker）でのみメッセージリスナーを登録する。
// Node.js（テスト環境）ではスキップされる。
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action !== 'open_url' || !message.url) return;

    const targetUrl = message.url;

    // 不正プロトコル（javascript:, file: 等）は処理しない
    if (!isAllowedURL(targetUrl)) return;

    const targetPrefix = getOriginPrefix(targetUrl);
    if (!targetPrefix) return;

    // プロトコル＋ホスト名（ポート含む）をキーに同一オリジンのタブを検索
    chrome.tabs.query({}, (tabs) => {
      const matchedTabs = tabs.filter(tab => getOriginPrefix(tab.url) === targetPrefix);

      if (matchedTabs.length > 0) {
        // 最後にアクセスしたタブを選択
        const chosen = chooseMostRecentTab(matchedTabs);
        chrome.windows.update(chosen.windowId, { focused: true }, () => {
          chrome.tabs.update(chosen.id, { active: true });
        });
      } else {
        // 既存タブがなければ新規タブで開く
        chrome.tabs.create({ url: targetUrl, active: true });
      }
    });
  });
}

// Node.js（テスト環境）向けに純粋ロジックのみエクスポートする。
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isAllowedURL, getOriginPrefix, chooseMostRecentTab };
}
