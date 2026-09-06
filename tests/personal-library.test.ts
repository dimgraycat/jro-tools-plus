import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type LibraryEntry,
  entryFromUrl,
  entryKey,
  filterEntries,
  HISTORY_LIMIT,
  normalizeLibrary,
  officialUrl,
  recordVisit,
  setFavorite,
} from '../tools/lib/personal-library.js';

const item = (id = '501', viewedAt = 100, name = '赤ポーション'): LibraryEntry => ({
  type: 'item', id, name, viewedAt,
});
const monster = (id = '1002', viewedAt = 200, name = 'ポリン'): LibraryEntry => ({
  type: 'monster', id, name, viewedAt,
});

describe('official library URLs', () => {
  it('recognizes item and monster details and canonicalizes their URLs', () => {
    const entry = entryFromUrl('https://rotool.gungho.jp/item/501?from=search#detail', ' 赤ポーション ', 123);
    assert.deepEqual(entry, item('501', 123));
    assert.equal(officialUrl(entry!), 'https://rotool.gungho.jp/item/501/');

    const monsterEntry = entryFromUrl('https://rotool.gungho.jp/monster/Ab_12/', 'ポリン', 456);
    assert.deepEqual(monsterEntry, monster('Ab_12', 456));
    assert.equal(officialUrl(monsterEntry!), 'https://rotool.gungho.jp/monster/Ab_12/');
  });

  it('rejects unrelated origins, non-detail paths, and invalid IDs', () => {
    for (const url of [
      '', '/item/501/', 'not a URL',
      'http://rotool.gungho.jp/item/501/',
      'https://rotool.gungho.jp.example.test/item/501/',
      'https://rotool.gungho.jp:444/item/501/',
      'https://rowebtool.gungho.jp/item/501/',
      'https://rotool.gungho.jp/item/',
      'https://rotool.gungho.jp/item/501/extra/',
      'https://rotool.gungho.jp/item/501/0/extra/',
      'https://rotool.gungho.jp/item/501/-1/',
      'https://rotool.gungho.jp/monster/1002/0/',
      'https://rotool.gungho.jp/item/abc/',
      'https://rotool.gungho.jp/item/5%30%31/',
      'https://rotool.gungho.jp/monster/a%2Fb/',
      'https://rotool.gungho.jp/map/1002/',
    ]) assert.equal(entryFromUrl(url), null, url);
  });

  it('recognizes official item URLs with a numeric trailing segment as the same item', () => {
    for (const suffix of ['/0/', '/0', '/1/', '/10/?from=search#detail']) {
      const entry = entryFromUrl('https://rotool.gungho.jp/item/26165' + suffix, '装備', 123)!;
      assert.deepEqual(entry, item('26165', 123, '装備'));
      assert.equal(officialUrl(entry), 'https://rotool.gungho.jp/item/26165/');
    }
  });

  it('uses the ID for unnamed entries and limits stored names', () => {
    assert.equal(entryFromUrl('https://rotool.gungho.jp/item/501/', ' \n ', 0)?.name, '501');
    assert.equal(entryFromUrl('https://rotool.gungho.jp/item/501/', 'あ'.repeat(250), 0)?.name.length, 200);
  });
});

describe('personal library history', () => {
  it('keeps item and monster IDs independent', () => {
    const sameIdItem = item('1002');
    const sameIdMonster = monster('1002');
    assert.notEqual(entryKey(sameIdItem), entryKey(sameIdMonster));
    let state = recordVisit(normalizeLibrary({}), sameIdItem);
    state = recordVisit(state, sameIdMonster);
    state = setFavorite(state, sameIdItem, true, 10);
    state = setFavorite(state, sameIdMonster, true, 20);
    state = setFavorite(state, sameIdItem, false);
    assert.deepEqual(state.history.map(entryKey), ['monster:1002', 'item:1002']);
    assert.deepEqual(state.favorites.map(entryKey), ['monster:1002']);
  });

  it('moves repeat visits to the latest position without duplicates', () => {
    let state = recordVisit(normalizeLibrary({}), item('501', 100));
    state = recordVisit(state, monster('1002', 200));
    state = recordVisit(state, item('501', 300, '赤ポーション（更新）'));
    assert.deepEqual(state.history.map(entryKey), ['item:501', 'monster:1002']);
    assert.equal(state.history[0].viewedAt, 300);
    assert.equal(state.history[0].name, '赤ポーション（更新）');
  });

  it('sorts imported history by visit time and preserves the newest duplicate', () => {
    const state = normalizeLibrary({ history: [item('501', 100), monster('1002', 200), item('501', 300)] });
    assert.deepEqual(state.history.map(entryKey), ['item:501', 'monster:1002']);
    assert.deepEqual(state.history.map(entry => entry.viewedAt), [300, 200]);
  });

  it('retains the latest 50 entries of each type independently', () => {
    const history = Array.from({ length: 55 }, (_, index) => [
      item(String(index), index), monster(String(index), index + 100),
    ]).flat();
    const state = normalizeLibrary({ history });
    assert.equal(HISTORY_LIMIT, 50);
    assert.equal(state.history.length, 100);
    for (const type of ['item', 'monster'] as const) {
      const entries = state.history.filter(entry => entry.type === type);
      assert.equal(entries.length, 50);
      assert.deepEqual(entries.map(entry => entry.id), Array.from({ length: 50 }, (_, index) => String(54 - index)));
    }
    assert.ok(state.history.every((entry, index, entries) => index === 0 || entries[index - 1].viewedAt >= entry.viewedAt));
  });
});

describe('personal library favorites', () => {
  it('orders additions newest-first and makes repeated additions and removals idempotent', () => {
    let state = setFavorite(normalizeLibrary({}), item('501'), true, 10);
    state = setFavorite(state, monster('1002'), true, 20);
    const beforeRepeat = structuredClone(state);
    state = setFavorite(state, item('501'), true, 30);
    assert.deepEqual(state, beforeRepeat);
    assert.deepEqual(state.favorites.map(entryKey), ['monster:1002', 'item:501']);
    assert.equal(state.history.length, 0);

    state = setFavorite(state, item('501'), false);
    assert.deepEqual(state.favorites.map(entryKey), ['monster:1002']);
    assert.deepEqual(setFavorite(state, item('501'), false), state);
  });

  it('updates a favorite name and visit time without changing its addition time or order', () => {
    let state = setFavorite(normalizeLibrary({}), item('501', 100), true, 10);
    state = setFavorite(state, monster('1002'), true, 20);
    state = recordVisit(state, item('501', 500, '更新後の名前'));
    assert.deepEqual(state.favorites.map(entryKey), ['monster:1002', 'item:501']);
    assert.equal(state.favorites[1].name, '更新後の名前');
    assert.equal(state.favorites[1].viewedAt, 500);
    assert.equal(state.favorites[1].addedAt, 10);
  });
});

describe('personal library filters', () => {
  const entries = [item('501', 1, 'ＪＲＯ 赤ポーション'), monster('1002', 2, 'ポリン'), item('502', 3, '青ポーション')];

  it('selects all, items, and monsters without changing their order', () => {
    assert.deepEqual(filterEntries(entries, 'all', ''), entries);
    assert.deepEqual(filterEntries(entries, 'item', '  '), [entries[0], entries[2]]);
    assert.deepEqual(filterEntries(entries, 'monster', ''), [entries[1]]);
  });

  it('normalizes Unicode width and case and requires every query term', () => {
    assert.deepEqual(filterEntries(entries, 'all', ' jro　赤 '), [entries[0]]);
    assert.deepEqual(filterEntries(entries, 'monster', 'ﾎﾟﾘﾝ'), [entries[1]]);
    assert.deepEqual(filterEntries(entries, 'all', '赤 青'), []);
    assert.deepEqual(filterEntries(entries, 'monster', 'ポーション'), []);
  });
});

describe('personal library storage boundaries', () => {
  it('recovers empty state from missing or malformed containers', () => {
    const empty = normalizeLibrary({});
    for (const value of [undefined, null, false, 0, '', [], { favorites: {}, history: 'bad' }]) {
      assert.deepEqual(normalizeLibrary(value), empty);
    }
  });

  it('discards invalid entries and normalizes invalid names and timestamps', () => {
    const invalid = [
      null, false, 1, 'bad', {}, { type: 'map', id: '501' },
      { type: 'item', id: 501 }, { type: 'item', id: 'a' },
      { type: 'monster', id: 'a/b' }, { type: 'monster', id: '../' },
    ];
    const state = normalizeLibrary({
      history: [...invalid, { type: 'item', id: '501', name: 42, viewedAt: Infinity }],
      favorites: [...invalid, { type: 'monster', id: '1002', name: '  ポリン  ', viewedAt: NaN, addedAt: Infinity }],
    });
    assert.deepEqual(state.history, [item('501', 0, '501')]);
    assert.deepEqual(state.favorites, [{ ...monster('1002', 0), setIds: ['default'] }]);
  });

  it('does not mutate stored input or previous states during normalization and updates', () => {
    const raw = { favorites: [{ ...item(), addedAt: 10 }], history: [item(), monster()] };
    const originalRaw = structuredClone(raw);
    const state = normalizeLibrary(raw);
    const originalState = structuredClone(state);
    recordVisit(state, item('501', 999, '更新'));
    setFavorite(state, monster(), true, 20);
    setFavorite(state, item(), false);
    filterEntries(state.history, 'item', '赤');
    assert.deepEqual(raw, originalRaw);
    assert.deepEqual(state, originalState);
    assert.notEqual(state.favorites[0], raw.favorites[0]);
    assert.notEqual(state.history.find(entry => entry.type === 'item'), raw.history[0]);
  });
});
