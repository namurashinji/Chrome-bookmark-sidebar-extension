// utils.js - 共通ユーティリティ（テスト可能な純粋関数）

// ALLOWED_PROTOCOLS は background.js にも同一定義がある。
// Chrome Extension のスコープ分離により共有できないため意図的な重複。
// 変更時は background.js も合わせて更新すること。
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * URLが有効かチェック（http / https のみ許可）
 * @param {string} url
 * @returns {boolean}
 */
function isValidURL(url) {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * 配列から指定インデックスの要素を除いた新しい配列を返す（元配列は変更しない）
 * @param {Array} arr
 * @param {number} idx
 * @returns {Array}
 */
function removeAtIndex(arr, idx) {
  if (idx < 0 || idx >= arr.length) return [...arr];
  return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
}

/**
 * 配列の要素を from の位置から to の位置に移動した新しい配列を返す（元配列は変更しない）
 * @param {Array} arr
 * @param {number} from
 * @param {number} to
 * @returns {Array}
 */
function moveItem(arr, from, to) {
  const without = [...arr.slice(0, from), ...arr.slice(from + 1)];
  return [...without.slice(0, to), arr[from], ...without.slice(to)];
}

/**
 * 配列の末尾に要素を追加した新しい配列を返す（元配列は変更しない）
 * @param {Array} arr
 * @param {*} item
 * @returns {Array}
 */
function appendItem(arr, item) {
  return [...arr, item];
}

// Node.js（テスト環境）向けエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isValidURL, removeAtIndex, moveItem, appendItem };
}
