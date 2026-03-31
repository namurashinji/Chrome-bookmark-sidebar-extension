const { isValidURL, removeAtIndex, moveItem, appendItem } = require('../utils');

// ─── isValidURL ─────────────────────────────────────────────────────────────

describe('isValidURL', () => {
  test('https:// は有効', () => {
    expect(isValidURL('https://example.com')).toBe(true);
  });

  test('http:// は有効', () => {
    expect(isValidURL('http://example.com')).toBe(true);
  });

  test('パス・クエリ・ハッシュを含む URL は有効', () => {
    expect(isValidURL('https://example.com/path?q=1#anchor')).toBe(true);
  });

  test('javascript: は無効', () => {
    expect(isValidURL('javascript:alert(1)')).toBe(false);
  });

  test('data: は無効', () => {
    expect(isValidURL('data:text/html,<h1>xss</h1>')).toBe(false);
  });

  test('file: は無効', () => {
    expect(isValidURL('file:///etc/passwd')).toBe(false);
  });

  test('chrome: は無効', () => {
    expect(isValidURL('chrome://settings')).toBe(false);
  });

  test('chrome-extension: は無効', () => {
    expect(isValidURL('chrome-extension://abc123/popup.html')).toBe(false);
  });

  test('空文字は無効', () => {
    expect(isValidURL('')).toBe(false);
  });

  test('URL 形式でない文字列は無効', () => {
    expect(isValidURL('not-a-url')).toBe(false);
  });

  test('スペースのみは無効', () => {
    expect(isValidURL('   ')).toBe(false);
  });
});

// ─── removeAtIndex ───────────────────────────────────────────────────────────

describe('removeAtIndex', () => {
  test('中間要素を削除できる', () => {
    expect(removeAtIndex(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
  });

  test('先頭要素を削除できる', () => {
    expect(removeAtIndex(['a', 'b', 'c'], 0)).toEqual(['b', 'c']);
  });

  test('末尾要素を削除できる', () => {
    expect(removeAtIndex(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
  });

  test('1要素の配列を空にできる', () => {
    expect(removeAtIndex(['a'], 0)).toEqual([]);
  });

  test('元の配列を変更しない（不変性）', () => {
    const original = ['a', 'b', 'c'];
    removeAtIndex(original, 1);
    expect(original).toEqual(['a', 'b', 'c']);
  });

  test('オブジェクト要素を含む配列でも動作する', () => {
    const bookmarks = [
      { url: 'https://a.com', icon: 'data:a' },
      { url: 'https://b.com', icon: 'data:b' },
      { url: 'https://c.com', icon: 'data:c' },
    ];
    const result = removeAtIndex(bookmarks, 1);
    expect(result).toEqual([
      { url: 'https://a.com', icon: 'data:a' },
      { url: 'https://c.com', icon: 'data:c' },
    ]);
  });

  test('負のインデックスは元配列のコピーを返す', () => {
    expect(removeAtIndex(['a', 'b', 'c'], -1)).toEqual(['a', 'b', 'c']);
  });

  test('範囲外インデックスは元配列のコピーを返す', () => {
    expect(removeAtIndex(['a', 'b', 'c'], 99)).toEqual(['a', 'b', 'c']);
  });
});

// ─── moveItem ────────────────────────────────────────────────────────────────

describe('moveItem', () => {
  test('前から後ろへ移動できる', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  test('後ろから前へ移動できる', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  test('隣同士を入れ替えられる', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  test('同じインデックスを指定すると元の順序を返す', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });

  test('先頭から末尾へ移動できる', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  test('末尾から先頭へ移動できる', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  test('元の配列を変更しない（不変性）', () => {
    const original = ['a', 'b', 'c'];
    moveItem(original, 0, 2);
    expect(original).toEqual(['a', 'b', 'c']);
  });

  test('オブジェクト要素を含む配列でも動作する', () => {
    const bookmarks = [
      { url: 'https://a.com' },
      { url: 'https://b.com' },
      { url: 'https://c.com' },
    ];
    const result = moveItem(bookmarks, 0, 2);
    expect(result[0].url).toBe('https://b.com');
    expect(result[1].url).toBe('https://c.com');
    expect(result[2].url).toBe('https://a.com');
  });
});

// ─── appendItem ──────────────────────────────────────────────────────────────

describe('appendItem', () => {
  test('配列の末尾に文字列を追加できる', () => {
    expect(appendItem(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });

  test('空配列に追加できる', () => {
    expect(appendItem([], 'a')).toEqual(['a']);
  });

  test('ブックマークオブジェクトを追加できる', () => {
    const existing = [{ url: 'https://a.com', icon: 'data:a' }];
    const newItem  = { url: 'https://b.com', icon: 'data:b' };
    expect(appendItem(existing, newItem)).toEqual([
      { url: 'https://a.com', icon: 'data:a' },
      { url: 'https://b.com', icon: 'data:b' },
    ]);
  });

  test('元の配列を変更しない（不変性）', () => {
    const original = ['a', 'b'];
    appendItem(original, 'c');
    expect(original).toEqual(['a', 'b']);
  });

  test('追加後の配列の長さが +1 になる', () => {
    const original = [1, 2, 3];
    expect(appendItem(original, 4)).toHaveLength(4);
  });
});
