// sidepanel.js - サイドパネルの UI（アイコン一覧・追加・削除・並べ替え）
// utils.js を先に読み込む前提（isValidURL / removeAtIndex / moveItem / appendItem / findNearestIndex）

const STORAGE_BOOKMARKS = 'bookmarks';
const MAX_BOOKMARKS     = 12;
const MAX_FILE_SIZE     = 300 * 1024; // 300KB
const PANEL_PORT_PREFIX = 'sidepanel:'; // background.js と同じ値
const RECONNECT_DELAY   = 500;          // ms
const KEEPALIVE_PERIOD  = 20 * 1000;    // ms。Service Worker の停止（約30秒の無操作）より短くする
const DRAG_THRESHOLD    = 5;            // px。これ未満の動きはクリックとして扱う

// ブックマークの並び順と manifest の commands の対応（ショートカットの表示に使う）
const BOOKMARK_COMMANDS = [
  'open-bookmark-1',
  'open-bookmark-2',
  'open-bookmark-3',
  'open-bookmark-4',
  'open-bookmark-5',
];

const $ = id => document.getElementById(id);
const el = {
  dock:          $('dock'),
  grid:          $('bookmark-grid'),
  addBtn:        $('add-btn'),
  addPanel:      $('add-panel'),
  dropZone:      $('drop-zone'),
  iconInput:     $('icon-input'),
  previewWrap:   $('icon-preview-wrap'),
  iconPreview:   $('icon-preview'),
  clearIconBtn:  $('clear-icon-btn'),
  urlInput:      $('url-input'),
  formMessage:   $('form-message'),
  cancelBtn:     $('cancel-btn'),
  saveBtn:       $('save-btn'),
  contextMenu:   $('context-menu'),
  deleteBtn:     $('delete-btn'),
  confirmDialog: $('confirm-dialog'),
  confirmText:   $('confirm-text'),
  status:        $('status'),
};

// 追加フォームで選んだアイコン（Data URL）
let selectedDataURL = null;
// 並べ替えのドラッグ中の状態（{ fromIdx, startX, startY, moved, icon }）。ドラッグしていなければ null
let drag = null;
// ドラッグを終えた直後の click を無視するための印
let suppressClick = false;

// ─── Storage ─────────────────────────────────────────────────────────────

async function loadBookmarks() {
  const { [STORAGE_BOOKMARKS]: bookmarks } = await chrome.storage.local.get({ [STORAGE_BOOKMARKS]: [] });
  return Array.isArray(bookmarks) ? bookmarks : [];
}

function saveBookmarks(bookmarks) {
  return chrome.storage.local.set({ [STORAGE_BOOKMARKS]: bookmarks });
}

// ─── 表示 ────────────────────────────────────────────────────────────────

function showStatus(message) {
  el.status.textContent = message;
}

// chrome://extensions/shortcuts で設定されたキーを、ブックマークの並び順で返す
async function loadShortcuts() {
  const commands = await chrome.commands.getAll();
  return BOOKMARK_COMMANDS.map(name => commands.find(c => c.name === name)?.shortcut || '');
}

function createBookmarkIcon(bookmark, idx, shortcut) {
  const img = document.createElement('img');
  img.src         = bookmark.icon;
  img.alt         = bookmark.url;
  img.title       = shortcut ? `${bookmark.url}（${shortcut}）` : bookmark.url;
  img.dataset.url = bookmark.url;
  img.dataset.idx = String(idx);
  img.className   = 'bookmark';
  img.draggable   = false; // 並べ替えは pointer イベントで自前で行う
  img.setAttribute('role', 'listitem');
  return img;
}

async function render() {
  try {
    const [bookmarks, shortcuts] = await Promise.all([loadBookmarks(), loadShortcuts()]);
    const icons = bookmarks.map((b, idx) => createBookmarkIcon(b, idx, shortcuts[idx]));
    el.grid.replaceChildren(...icons);
    el.addBtn.disabled = bookmarks.length >= MAX_BOOKMARKS;
    el.addBtn.title = el.addBtn.disabled ? `登録上限（${MAX_BOOKMARKS}個）に達しています` : 'ブックマークを追加';
  } catch (err) {
    console.error('ブックマークの読み込みに失敗:', err);
    showStatus('ブックマークの読み込みに失敗しました');
  }
}

// ─── URL を開く ──────────────────────────────────────────────────────────

// タブの再利用判定は background.js に一本化している
async function openURL(url) {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'open_url', url });
    if (!response?.ok) showStatus('ページを開けませんでした');
  } catch (err) {
    console.error('URL を開けません:', err);
    showStatus('ページを開けませんでした');
  }
}

// ─── 削除（右クリックメニュー＋確認ダイアログ）──────────────────────────

function hideContextMenu() {
  el.contextMenu.hidden = true;
}

function showContextMenu(e, idx) {
  el.contextMenu.dataset.idx = String(idx);
  el.contextMenu.hidden = false;
  // パネルの外にはみ出さないように位置を詰める
  const { offsetWidth: w, offsetHeight: h } = el.contextMenu;
  el.contextMenu.style.left = `${Math.max(0, Math.min(e.clientX, window.innerWidth - w - 4))}px`;
  el.contextMenu.style.top  = `${Math.max(0, Math.min(e.clientY, window.innerHeight - h - 4))}px`;
}

function confirmAction(message) {
  return new Promise(resolve => {
    el.confirmText.textContent = message;
    el.confirmDialog.returnValue = '';
    el.confirmDialog.addEventListener('close', () => resolve(el.confirmDialog.returnValue === 'ok'), { once: true });
    el.confirmDialog.showModal();
  });
}

async function handleDelete() {
  hideContextMenu();
  const idx = Number(el.contextMenu.dataset.idx);
  try {
    const bookmarks = await loadBookmarks();
    const url = bookmarks[idx]?.url;
    if (!url) return;
    if (!(await confirmAction(`「${url}」を削除してもよろしいですか？`))) return;
    // 確認中に別のウィンドウで変更された場合に備えて読み直す
    const latest = await loadBookmarks();
    if (latest[idx]?.url !== url) return showStatus('一覧が変更されたため削除を中止しました');
    await saveBookmarks(removeAtIndex(latest, idx));
  } catch (err) {
    console.error('削除に失敗:', err);
    showStatus('削除に失敗しました');
  }
}

// ─── 並べ替え（マウスの押す・動かす・離すを自前で追う）──────────────────
// ブラウザ標準のドラッグ&ドロップは使わない。アイコンの真上に正確に落とさないと動かず、
// サイドパネルでは並べ替えができなかったため（2026-10-13）

function getIconIdx(target) {
  if (!(target instanceof HTMLImageElement) || target.dataset.idx == null) return null;
  return Number(target.dataset.idx);
}

async function reorder(from, to) {
  if (from == null || to == null || from === to) return;
  try {
    const bookmarks = await loadBookmarks();
    if (from < 0 || from >= bookmarks.length || to < 0 || to >= bookmarks.length) return;
    await saveBookmarks(moveItem(bookmarks, from, to));
  } catch (err) {
    console.error('並べ替えの保存に失敗:', err);
    showStatus('並べ替えの保存に失敗しました');
  }
}

// 指の位置にいちばん近いアイコンの番号（アイコンのすき間に離しても決まるようにする）
function iconIdxAt(x, y) {
  const centers = [...el.grid.querySelectorAll('.bookmark')].map(icon => {
    const r = icon.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  return findNearestIndex(centers, x, y);
}

function isInsideGrid(x, y) {
  const r = el.grid.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function setDropTarget(idx) {
  el.grid.querySelectorAll('.bookmark').forEach(icon => {
    icon.classList.toggle('drop-target', idx != null && Number(icon.dataset.idx) === idx);
  });
}

function endDrag() {
  el.grid.querySelector('.dragging')?.classList.remove('dragging');
  setDropTarget(null);
  drag = null;
}

function setupReorderEvents() {
  el.grid.addEventListener('pointerdown', e => {
    // 前回のドラッグの後に click が来なかった場合でも、印を持ち越さない
    suppressClick = false;
    const idx = getIconIdx(e.target);
    if (e.button !== 0 || idx == null) return;
    drag = { fromIdx: idx, startX: e.clientX, startY: e.clientY, moved: false, icon: e.target };
  });

  el.grid.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD) return;
      drag.moved = true;
      drag.icon.classList.add('dragging');
      // 一覧の外に出ても追えるようにする。押した時点で固定すると click の対象が一覧全体に
      // すり替わり、アイコンのクリックでサイトが開かなくなるため、動き始めてから固定する
      try {
        el.grid.setPointerCapture(e.pointerId);
      } catch {
        // ボタンがすでに離されているなど。固定できなくても一覧の中の並べ替えはできる
      }
    }
    setDropTarget(isInsideGrid(e.clientX, e.clientY) ? iconIdxAt(e.clientX, e.clientY) : null);
  });

  el.grid.addEventListener('pointerup', e => {
    if (!drag) return;
    const { moved, fromIdx } = drag;
    // 一覧の外で離したら取りやめ
    const to = moved && isInsideGrid(e.clientX, e.clientY) ? iconIdxAt(e.clientX, e.clientY) : null;
    endDrag();
    if (!moved) return;
    // ドラッグの直後に発生する click でサイトが開かないようにする
    suppressClick = true;
    reorder(fromIdx, to);
  });

  el.grid.addEventListener('pointercancel', endDrag);
}

function setupGridEvents() {
  el.grid.addEventListener('click', e => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (getIconIdx(e.target) != null) openURL(e.target.dataset.url);
  });

  el.grid.addEventListener('contextmenu', e => {
    const idx = getIconIdx(e.target);
    if (idx == null) return;
    e.preventDefault();
    showContextMenu(e, idx);
  });

  setupReorderEvents();
}

// ─── 追加フォーム ────────────────────────────────────────────────────────

function setFormMessage(message) {
  el.formMessage.textContent = message;
}

function clearIcon() {
  selectedDataURL = null;
  el.iconInput.value = '';
  el.iconPreview.removeAttribute('src');
  el.previewWrap.hidden = true;
}

function showAddPanel() {
  hideContextMenu();
  showStatus('');
  el.dock.hidden = true;
  el.addPanel.hidden = false;
  el.urlInput.focus();
}

function hideAddPanel() {
  clearIcon();
  el.urlInput.value = '';
  setFormMessage('');
  el.addPanel.hidden = true;
  el.dock.hidden = false;
}

function toDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
    reader.readAsDataURL(file);
  });
}

async function applyFile(file) {
  if (!file) return;
  if (!['image/png', 'image/jpeg'].includes(file.type)) return setFormMessage('画像ファイル（PNG / JPEG）を選択してください');
  if (file.size > MAX_FILE_SIZE) return setFormMessage('画像は300KB以下にしてください');
  try {
    selectedDataURL = await toDataURL(file);
    el.iconPreview.src = selectedDataURL;
    el.previewWrap.hidden = false;
    setFormMessage('');
  } catch {
    setFormMessage('ファイルの読み込みに失敗しました');
  }
}

// 入力に問題があればメッセージを返す。問題なければ null
function validateNewBookmark(url, bookmarks) {
  if (!selectedDataURL) return 'アイコン画像を選択してください';
  if (!url) return 'URLを入力してください';
  if (!isValidURL(url)) return '有効なURL（http:// または https://）を入力してください';
  if (bookmarks.length >= MAX_BOOKMARKS) return `登録上限（${MAX_BOOKMARKS}個）に達しています`;
  if (bookmarks.some(b => b.url === url)) return '同じURLはすでに登録されています';
  return null;
}

async function handleSave() {
  const url = el.urlInput.value.trim();
  try {
    const bookmarks = await loadBookmarks();
    const error = validateNewBookmark(url, bookmarks);
    if (error) return setFormMessage(error);
    await saveBookmarks(appendItem(bookmarks, { icon: selectedDataURL, url }));
    hideAddPanel();
  } catch (err) {
    console.error('保存に失敗:', err);
    setFormMessage('保存に失敗しました。ストレージの空き容量が不足している可能性があります');
  }
}

function setupAddPanelEvents() {
  el.addBtn.addEventListener('click', showAddPanel);
  el.cancelBtn.addEventListener('click', hideAddPanel);
  el.saveBtn.addEventListener('click', handleSave);
  el.clearIconBtn.addEventListener('click', clearIcon);
  el.iconInput.addEventListener('change', () => applyFile(el.iconInput.files[0]));
  el.urlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) handleSave();
  });

  el.dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    el.dropZone.classList.add('dragover');
  });
  el.dropZone.addEventListener('dragleave', () => el.dropZone.classList.remove('dragover'));
  el.dropZone.addEventListener('drop', e => {
    e.preventDefault();
    el.dropZone.classList.remove('dragover');
    applyFile(e.dataTransfer.files[0]);
  });
}

// ─── background への接続（開閉ショートカット用）──────────────────────────

// 開いている間はポートを張り、background に「このウィンドウでパネルが開いている」と伝える。
// 定期的に ping を送って Service Worker の停止を防ぐ（停止すると開閉状態が消えるため）。
// それでも切断されたら、つなぎ直して状態を伝え直す
async function connectToBackground() {
  const { id: windowId } = await chrome.windows.getCurrent();
  let port = null;
  const connect = () => {
    try {
      port = chrome.runtime.connect({ name: `${PANEL_PORT_PREFIX}${windowId}` });
    } catch (err) {
      // 拡張機能の更新・再読み込みで接続できなくなった。このパネルは閉じて開き直すしかない
      console.error('background に接続できません:', err);
      port = null;
      return;
    }
    port.onDisconnect.addListener(() => {
      port = null;
      setTimeout(connect, RECONNECT_DELAY);
    });
  };
  connect();
  setInterval(() => {
    try {
      port?.postMessage({ type: 'ping' });
    } catch {
      // 切断直後で onDisconnect がまだ届いていない。つなぎ直しは onDisconnect 側で行う
    }
  }, KEEPALIVE_PERIOD);
}

// ─── 起動 ────────────────────────────────────────────────────────────────

function init() {
  setupGridEvents();
  setupAddPanelEvents();
  el.deleteBtn.addEventListener('click', handleDelete);
  document.addEventListener('click', e => {
    if (!el.contextMenu.contains(e.target)) hideContextMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideContextMenu();
  });
  window.addEventListener('blur', hideContextMenu);
  // 受け付けない場所にファイルを落としたとき、パネルがそのファイルに移動しないようにする
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => e.preventDefault());

  // 他のウィンドウのパネルで変更されても同期する
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_BOOKMARKS]) render();
  });

  render();
  connectToBackground().catch(err => console.error('background への接続に失敗:', err));
}

init();
