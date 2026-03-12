// background.js の純粋なロジック部分をテスト
// Chrome API に依存しない部分のみを抽出して検証する

// ─── isAllowedURL（background.js から抽出）──────────────────────────────────

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

function isAllowedURL(url) {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

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

// ─── タブのオリジン一致ロジック ───────────────────────────────────────────────

// background.js が使っているオリジン比較ロジックを関数として抽出してテスト
function getOriginPrefix(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol + '//' + parsed.host;
  } catch {
    return null;
  }
}

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

// ─── 最近アクセスしたタブを選択するロジック ──────────────────────────────────

// background.js の reduce による lastAccessed 比較を単体テスト
function chooseMostRecentTab(tabs) {
  return tabs.reduce((best, t) =>
    (t.lastAccessed || 0) > (best.lastAccessed || 0) ? t : best
  );
}

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
