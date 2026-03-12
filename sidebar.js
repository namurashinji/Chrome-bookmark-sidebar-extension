(() => {
  // iframeガード（クロスオリジンiframeでは window.top へのアクセスが例外を投げるため try/catch で囲む）
  try {
    if (window !== window.top) return;
  } catch {
    return;
  }

  // 定数
  const SIDEBAR_ID        = 'bookmark-sidebar';
  const BOOKMARK_LIST_ID  = 'bookmark-list';
  const CONTEXT_MENU_ID   = 'bookmark-context-menu';
  const ADD_PANEL_ID      = 'bookmark-add-panel';
  const STORAGE_BOOKMARKS = 'bookmarks';
  const STORAGE_VISIBLE   = 'sidebarVisible';
  const MAX_BOOKMARKS     = 12;
  const MAX_FILE_SIZE     = 300 * 1024; // 300KB

  // ─── 初期化 ─────────────────────────────────────────────────────────────

  function init() {
    // SPA等で複数回呼ばれても重複しないようにガード
    if (document.getElementById(SIDEBAR_ID)) return;

    const container   = createSidebar();
    const contextMenu = createContextMenu();
    const addPanel    = createAddPanel();

    document.body.appendChild(contextMenu);
    document.body.appendChild(addPanel);

    applyInitialVisibility(container);
    render(container);
    attachGlobalListeners(container, contextMenu, addPanel);
  }

  // ─── DOM生成 ─────────────────────────────────────────────────────────────

  function createSidebar() {
    const container = document.createElement('div');
    container.id = SIDEBAR_ID;
    container.innerHTML = `
      <div id="${BOOKMARK_LIST_ID}"></div>
      <button id="add-btn" title="ブックマークを追加">＋</button>
    `;
    document.body.appendChild(container);
    return container;
  }

  // 追加フォームはサイドバー横に展開する浮動パネルとして実装
  function createAddPanel() {
    const panel = document.createElement('div');
    panel.id = ADD_PANEL_ID;
    panel.innerHTML = `
      <div id="add-panel-header">ブックマークを追加</div>
      <div id="drop-zone">アイコン画像をここにドロップ</div>
      <label id="file-label">
        ファイルを選択
        <input type="file" id="icon-input" accept="image/png,image/jpeg" />
      </label>
      <div id="icon-preview-wrap" class="hidden">
        <img id="icon-preview" src="" alt="プレビュー" />
        <button id="clear-icon-btn" title="画像をクリア">✕</button>
      </div>
      <input type="url" id="url-input" placeholder="https://example.com" />
      <div id="add-panel-footer">
        <button id="cancel-btn">キャンセル</button>
        <button id="save-btn">保存</button>
      </div>
    `;
    return panel;
  }

  function createContextMenu() {
    const menu = document.createElement('div');
    menu.id = CONTEXT_MENU_ID;
    const ul = document.createElement('ul');
    const li = document.createElement('li');
    li.id = 'delete-bookmark';
    li.textContent = '削除';
    ul.appendChild(li);
    menu.appendChild(ul);
    return menu;
  }

  // ─── 表示状態管理 ────────────────────────────────────────────────────────

  async function applyInitialVisibility(container) {
    try {
      const { [STORAGE_VISIBLE]: visible = true } = await getStorage({ [STORAGE_VISIBLE]: true });
      if (!visible) container.classList.add('hidden');
    } catch {
      // 読み取り失敗時はデフォルト（表示）のまま
    }
  }

  async function toggleSidebar(container) {
    const hidden = container.classList.toggle('hidden');
    try {
      await setStorage({ [STORAGE_VISIBLE]: !hidden });
    } catch {
      // 保存失敗は次回起動時に初期値に戻るだけなので無視
    }
  }

  // ─── レンダリング ────────────────────────────────────────────────────────

  async function render(container) {
    const listEl = container.querySelector(`#${BOOKMARK_LIST_ID}`);
    try {
      const { [STORAGE_BOOKMARKS]: bookmarks = [] } = await getStorage({ [STORAGE_BOOKMARKS]: [] });
      listEl.innerHTML = '';
      bookmarks.forEach((b, idx) => {
        const img = document.createElement('img');
        img.src           = b.icon;
        img.alt           = b.url;
        img.title         = b.url;
        img.dataset.url   = b.url;
        img.dataset.idx   = String(idx);
        img.className     = 'bookmark';
        enableDrag(img);
        listEl.appendChild(img);
      });
    } catch {
      // 描画失敗時は現状維持
    }
  }

  // ─── イベント登録 ────────────────────────────────────────────────────────

  function attachGlobalListeners(container, menu, addPanel) {
    // Storage 変更をリアルタイムに反映
    chrome.storage.onChanged.addListener(({ [STORAGE_VISIBLE]: v }, area) => {
      if (area === 'local' && v) container.classList.toggle('hidden', !v.newValue);
    });

    // キーボードショートカット（capture: true でページ側リスナーより先に実行）
    document.addEventListener('keydown', e => handleKeydown(e, container), true);

    // アイコンクリックで URL を開く
    container.querySelector(`#${BOOKMARK_LIST_ID}`).addEventListener('click', e => {
      if (e.target.tagName === 'IMG') openURL(e.target.dataset.url);
    });

    // コンテキストメニュー
    document.addEventListener('contextmenu', e => handleContextMenu(e, menu));
    document.addEventListener('click', e => {
      if (!menu.contains(e.target)) menu.style.display = 'none';
    });
    menu.querySelector('#delete-bookmark').addEventListener('click', () => handleDelete(menu, container));

    // 追加パネル
    setupAddPanel(container, addPanel);
  }

  // ─── キーボードハンドラ ──────────────────────────────────────────────────

  // Ctrl+Shift が前提。各サブハンドラに処理を委譲する
  async function handleKeydown(e, container) {
    if (!e.ctrlKey || !e.shiftKey) return;
    if (handleToggle(e, container)) return;
    if (await handleLaunch(e)) return;
    handleOpacity(e, container);
  }

  // Ctrl+Shift+` → サイドバートグル
  function handleToggle(e, container) {
    if (e.code !== 'Backquote') return false;
    e.preventDefault();
    e.stopPropagation();
    toggleSidebar(container);
    return true;
  }

  // Ctrl+Shift+A/S/D/F/G → 登録順 0〜4 のブックマークを起動
  async function handleLaunch(e) {
    const map = { KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, KeyG: 4 };
    const idx = map[e.code];
    if (idx == null) return false;
    e.preventDefault();
    e.stopPropagation();
    try {
      const { [STORAGE_BOOKMARKS]: bookmarks = [] } = await getStorage({ [STORAGE_BOOKMARKS]: [] });
      const b = bookmarks[idx];
      if (b?.url) await openURL(b.url);
    } catch {
      // 起動失敗は無視
    }
    return true;
  }

  // Ctrl+Shift++ → 不透明度100%、Ctrl+Shift+- → 75%
  function handleOpacity(e, container) {
    if (e.code === 'Equal' || e.code === 'NumpadAdd') {
      e.preventDefault();
      e.stopPropagation();
      container.style.opacity = '1';
    } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
      e.preventDefault();
      e.stopPropagation();
      container.style.opacity = '0.75';
    }
  }

  // ─── コンテキストメニュー ────────────────────────────────────────────────

  function handleContextMenu(e, menu) {
    if (e.target.tagName === 'IMG' && e.target.dataset.idx != null) {
      e.preventDefault();
      menu.dataset.idx  = e.target.dataset.idx;
      menu.style.top    = `${e.pageY}px`;
      menu.style.left   = `${e.pageX}px`;
      menu.style.display = 'block';
    } else {
      menu.style.display = 'none';
    }
  }

  async function handleDelete(menu, container) {
    menu.style.display = 'none';
    const idx = Number(menu.dataset.idx);
    try {
      const { [STORAGE_BOOKMARKS]: bookmarks = [] } = await getStorage({ [STORAGE_BOOKMARKS]: [] });
      const url = bookmarks[idx]?.url;
      if (!url) return;
      if (!confirm(`「${url}」を削除してもよろしいですか？`)) return;
      const updated = removeAtIndex(bookmarks, idx);
      await setStorage({ [STORAGE_BOOKMARKS]: updated });
      await render(container);
    } catch {
      alert('削除に失敗しました');
    }
  }

  // ─── ドラッグ&ドロップ（並び替え）────────────────────────────────────────

  function enableDrag(img) {
    img.draggable = true;

    img.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', img.dataset.idx);
      e.dataTransfer.effectAllowed = 'move';
    });

    img.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    img.addEventListener('drop', async e => {
      e.preventDefault();

      // ドロップ先が IMG 以外（余白など）の場合は無視
      if (e.target.tagName !== 'IMG' || e.target.dataset.idx == null) return;

      const from = Number(e.dataTransfer.getData('text/plain'));
      const to   = Number(e.target.dataset.idx);

      // NaN や変化なしはスキップ
      if (Number.isNaN(from) || Number.isNaN(to) || from === to) return;

      try {
        const { [STORAGE_BOOKMARKS]: bookmarks = [] } = await getStorage({ [STORAGE_BOOKMARKS]: [] });

        // 範囲外インデックスはスキップ
        if (from < 0 || from >= bookmarks.length || to < 0 || to >= bookmarks.length) return;

        const updated = moveItem(bookmarks, from, to);
        await setStorage({ [STORAGE_BOOKMARKS]: updated });
        await render(document.getElementById(SIDEBAR_ID));
      } catch {
        alert('並び替えの保存に失敗しました');
      }
    });
  }

  // ─── 追加パネル ─────────────────────────────────────────────────────────

  function setupAddPanel(container, panel) {
    const addBtn       = container.querySelector('#add-btn');
    const dropZone     = panel.querySelector('#drop-zone');
    const iconInput    = panel.querySelector('#icon-input');
    const previewWrap  = panel.querySelector('#icon-preview-wrap');
    const iconPreview  = panel.querySelector('#icon-preview');
    const clearIconBtn = panel.querySelector('#clear-icon-btn');
    const urlInput     = panel.querySelector('#url-input');
    const cancelBtn    = panel.querySelector('#cancel-btn');
    const saveBtn      = panel.querySelector('#save-btn');

    let selectedDataURL = null;

    const showPanel = () => panel.classList.add('visible');

    const hidePanel = () => {
      panel.classList.remove('visible');
      selectedDataURL   = null;
      iconInput.value   = '';
      urlInput.value    = '';
      iconPreview.src   = '';
      previewWrap.classList.add('hidden');
    };

    // ファイルを受け取りプレビューに反映する
    const applyFile = async (file) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        alert('画像ファイル（PNG / JPEG）を選択してください');
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        alert('画像は300KB以下にしてください');
        return;
      }
      try {
        selectedDataURL = await toDataURL(file);
        iconPreview.src = selectedDataURL;
        previewWrap.classList.remove('hidden');
      } catch {
        alert('ファイルの読み込みに失敗しました');
      }
    };

    addBtn.addEventListener('click', showPanel);
    cancelBtn.addEventListener('click', hidePanel);

    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', async e => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      await applyFile(e.dataTransfer.files[0]);
    });

    iconInput.addEventListener('change', async () => await applyFile(iconInput.files[0]));

    clearIconBtn.addEventListener('click', () => {
      selectedDataURL = null;
      iconInput.value = '';
      iconPreview.src = '';
      previewWrap.classList.add('hidden');
    });

    saveBtn.addEventListener('click', async () => {
      const url = urlInput.value.trim();

      if (!selectedDataURL) return alert('アイコン画像を選択してください');
      if (!url)             return alert('URLを入力してください');
      if (!isValidURL(url)) return alert('有効なURL（http:// または https://）を入力してください');

      try {
        const { [STORAGE_BOOKMARKS]: bookmarks = [] } = await getStorage({ [STORAGE_BOOKMARKS]: [] });

        if (bookmarks.length >= MAX_BOOKMARKS) {
          return alert(`登録上限（${MAX_BOOKMARKS}個）に達しています`);
        }
        if (bookmarks.some(b => b.url === url)) {
          return alert('同じURLはすでに登録されています');
        }

        const updated = appendItem(bookmarks, { icon: selectedDataURL, url });
        await setStorage({ [STORAGE_BOOKMARKS]: updated });
        hidePanel();
        await render(container);
      } catch {
        alert('保存に失敗しました。ストレージの空き容量が不足している可能性があります');
      }
    });
  }

  // ─── URL 操作 ────────────────────────────────────────────────────────────

  // Service Worker が休眠中の場合は window.open にフォールバック
  async function openURL(url) {
    try {
      await chrome.runtime.sendMessage({ action: 'open_url', url });
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  // ─── ファイル読み込み ─────────────────────────────────────────────────────

  function toDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
      reader.readAsDataURL(file);
    });
  }

  // ─── Storage ユーティリティ ──────────────────────────────────────────────

  function getStorage(keys) {
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, result => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      });
    }
    return Promise.resolve(keys);
  }

  function setStorage(obj) {
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.set(obj, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });
    }
    return Promise.resolve();
  }

  // ─── 起動 ────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
