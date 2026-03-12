// background.js

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'open_url' || !message.url) return;

  const targetUrl = message.url;

  // 不正プロトコル（javascript:, file: 等）は処理しない
  if (!isAllowedURL(targetUrl)) return;

  let target;
  try {
    target = new URL(targetUrl);
  } catch {
    return;
  }

  // プロトコル＋ホスト名（ポート含む）をキーに同一オリジンのタブを検索
  const targetPrefix = target.protocol + '//' + target.host;

  chrome.tabs.query({}, (tabs) => {
    const matchedTabs = tabs.filter(tab => {
      try {
        const tabUrl = new URL(tab.url);
        return (tabUrl.protocol + '//' + tabUrl.host) === targetPrefix;
      } catch {
        return false;
      }
    });

    if (matchedTabs.length > 0) {
      // 最後にアクセスしたタブを選択
      const chosen = matchedTabs.reduce((best, t) =>
        (t.lastAccessed || 0) > (best.lastAccessed || 0) ? t : best
      );
      chrome.windows.update(chosen.windowId, { focused: true }, () => {
        chrome.tabs.update(chosen.id, { active: true });
      });
    } else {
      // 既存タブがなければ新規タブで開く
      chrome.tabs.create({ url: targetUrl, active: true });
    }
  });
});
