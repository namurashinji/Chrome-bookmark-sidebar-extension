// background.js の純粋なロジック部分をテスト
const {
  isAllowedURL,
  getOriginPrefix,
  chooseMostRecentTab,
  findReusableTab,
  parsePanelPortName,
  updatePanelCount,
  PANEL_PORT_PREFIX,
} = require('../background');

// ─── isAllowedURL ────────────────────────────────────────────────────────────

describe('isAllowedURL（background.js）', () => {
  test('https:// は許可', () => {
    expect(isAllowedURL('https://google.com')).toBe(true);
  });

  test('http:// は許可', () => {
    expect(isAllowedURL('http://localhost:3000')).toBe(true);
  });

  test('javascript: は拒否', () => {
    expect(isAllowedURL('javascript:void(0)')).toBe(false);
  });

  test('chrome-extension: は拒否', () => {
    expect(isAllowedURL('chrome-extension://abc123/popup.html')).toBe(false);
  });

  test('file: は拒否', () => {
    expect(isAllowedURL('file:///etc/passwd')).toBe(false);
  });

  test('data: は拒否', () => {
    expect(isAllowedURL('data:text/html,<h1>xss</h1>')).toBe(false);
  });

  test('空文字は拒否', () => {
    expect(isAllowedURL('')).toBe(false);
  });

  test('URL 形式でない文字列は拒否', () => {
    expect(isAllowedURL('not valid')).toBe(false);
  });
});

// ─── getOriginPrefix ─────────────────────────────────────────────────────────

describe('タブのオリジン一致ロジック', () => {
  test('同じオリジンのURLはマッチする', () => {
    expect(getOriginPrefix('https://example.com/page1'))
      .toBe(getOriginPrefix('https://example.com/page2'));
  });

  test('パスが異なっても同じオリジンならマッチする', () => {
    expect(getOriginPrefix('https://example.com/a?q=1'))
      .toBe(getOriginPrefix('https://example.com/b#hash'));
  });

  test('異なるドメインはマッチしない', () => {
    expect(getOriginPrefix('https://example.com'))
      .not.toBe(getOriginPrefix('https://other.com'));
  });

  test('ポートが異なる場合はマッチしない', () => {
    expect(getOriginPrefix('http://localhost:3000'))
      .not.toBe(getOriginPrefix('http://localhost:4000'));
  });

  test('http と https は別オリジンとして扱う', () => {
    expect(getOriginPrefix('http://example.com'))
      .not.toBe(getOriginPrefix('https://example.com'));
  });

  test('無効な URL は null を返す', () => {
    expect(getOriginPrefix('not-a-url')).toBeNull();
  });

  test('空文字は null を返す', () => {
    expect(getOriginPrefix('')).toBeNull();
  });
});

// ─── chooseMostRecentTab ──────────────────────────────────────────────────────

describe('最近アクセスしたタブの選択', () => {
  test('lastAccessed が最大のタブを返す', () => {
    const tabs = [
      { id: 1, lastAccessed: 100 },
      { id: 2, lastAccessed: 300 },
      { id: 3, lastAccessed: 200 },
    ];
    expect(chooseMostRecentTab(tabs).id).toBe(2);
  });

  test('lastAccessed が未定義の場合も動作する', () => {
    const tabs = [
      { id: 1 },
      { id: 2, lastAccessed: 500 },
    ];
    expect(chooseMostRecentTab(tabs).id).toBe(2);
  });

  test('全て lastAccessed 未定義の場合は最初のタブを返す', () => {
    const tabs = [
      { id: 1 },
      { id: 2 },
    ];
    expect(chooseMostRecentTab(tabs).id).toBe(1);
  });

  test('タブが1件のみの場合はそのまま返す', () => {
    const tabs = [{ id: 99, lastAccessed: 1000 }];
    expect(chooseMostRecentTab(tabs).id).toBe(99);
  });
});

// ─── findReusableTab ─────────────────────────────────────────────────────────

describe('再利用するタブの選択', () => {
  const tabs = [
    { id: 1, url: 'https://example.com/a', lastAccessed: 100 },
    { id: 2, url: 'https://example.com/b', lastAccessed: 300 },
    { id: 3, url: 'https://other.com/', lastAccessed: 999 },
    { id: 4, url: 'chrome://newtab/', lastAccessed: 1000 },
  ];

  test('同一オリジンのうち最後にアクセスしたタブを返す', () => {
    expect(findReusableTab(tabs, 'https://example.com/c').id).toBe(2);
  });

  test('同一オリジンのタブが無ければ null', () => {
    expect(findReusableTab(tabs, 'https://none.example/')).toBeNull();
  });

  test('URL を持たないタブが混ざっていても動作する', () => {
    expect(findReusableTab([{ id: 5 }, ...tabs], 'https://other.com/x').id).toBe(3);
  });

  test('無効な URL は null', () => {
    expect(findReusableTab(tabs, 'not-a-url')).toBeNull();
  });

  test('タブが0件なら null', () => {
    expect(findReusableTab([], 'https://example.com/')).toBeNull();
  });
});

// ─── parsePanelPortName ──────────────────────────────────────────────────────

describe('サイドパネルのポート名の解釈', () => {
  test('接頭辞＋ウィンドウ ID から ID を取り出す', () => {
    expect(parsePanelPortName(`${PANEL_PORT_PREFIX}123`)).toBe(123);
  });

  test('接頭辞が違う名前は null', () => {
    expect(parsePanelPortName('other:123')).toBeNull();
  });

  test('ID が数値でなければ null', () => {
    expect(parsePanelPortName(`${PANEL_PORT_PREFIX}abc`)).toBeNull();
  });

  test('ID が空なら null', () => {
    expect(parsePanelPortName(PANEL_PORT_PREFIX)).toBeNull();
  });

  test('文字列でなければ null', () => {
    expect(parsePanelPortName(undefined)).toBeNull();
  });
});

// ─── updatePanelCount ────────────────────────────────────────────────────────

describe('ウィンドウごとの接続中パネル数', () => {
  test('接続で 1 になり、切断で取り除かれる', () => {
    const opened = updatePanelCount(new Map(), 7, +1);
    expect(opened.get(7)).toBe(1);
    expect(updatePanelCount(opened, 7, -1).has(7)).toBe(false);
  });

  test('2本つながっているとき、1本切れても開いたまま扱う', () => {
    const two = updatePanelCount(updatePanelCount(new Map(), 7, +1), 7, +1);
    expect(updatePanelCount(two, 7, -1).get(7)).toBe(1);
  });

  test('未接続のウィンドウの切断で負の値を残さない', () => {
    expect(updatePanelCount(new Map(), 7, -1).has(7)).toBe(false);
  });

  test('他のウィンドウの数に影響しない', () => {
    const counts = new Map([[1, 1], [2, 1]]);
    const next = updatePanelCount(counts, 1, -1);
    expect(next.get(2)).toBe(1);
    expect(next.has(1)).toBe(false);
  });

  test('元の Map を変更しない', () => {
    const counts = new Map([[1, 1]]);
    updatePanelCount(counts, 1, +1);
    expect(counts.get(1)).toBe(1);
  });
});
