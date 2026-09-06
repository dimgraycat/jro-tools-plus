import test from 'node:test';
import assert from 'node:assert/strict';
import { LibraryEntry } from '../tools/lib/personal-library.js';
import { parseVersionHistory, selectLibraryEntries } from '../tools/lib/library-view.js';

const entries: LibraryEntry[] = [
    { type: 'item', id: '501', name: '赤ポーション Ａ', viewedAt: 30, setIds: ['default', 'wanted'] },
    { type: 'monster', id: '1002', name: 'ポリン', viewedAt: 20, setIds: ['default'] },
    { type: 'item', id: '502', name: '青ポーション', viewedAt: 10, setIds: ['default'] },
];

test('all/items/monsters filter preserves the source ordering', () => {
    assert.deepEqual(selectLibraryEntries(entries, { type: 'all', query: '', setId: '' }), entries);
    assert.deepEqual(selectLibraryEntries(entries, { type: 'item', query: '', setId: '' }).map((entry) => entry.id), ['501', '502']);
    assert.deepEqual(selectLibraryEntries(entries, { type: 'monster', query: '', setId: '' }).map((entry) => entry.id), ['1002']);
});

test('set selection respects item and monster namespaces with identical IDs', () => {
    assert.deepEqual(selectLibraryEntries(entries, { type: 'all', query: '', setId: 'default', setType: 'monster' })
        .map((entry) => entry.id), ['1002']);
    assert.deepEqual(selectLibraryEntries(entries, { type: 'item', query: '', setId: 'wanted', setType: 'item' })
        .map((entry) => entry.id), ['501']);
});

test('name search normalizes width/case, requires every word, and combines with set selection', () => {
    assert.deepEqual(selectLibraryEntries(entries, { type: 'item', query: 'ポーション a', setId: 'wanted', setType: 'item' })
        .map((entry) => entry.id), ['501']);
    assert.deepEqual(selectLibraryEntries(entries, { type: 'all', query: '青', setId: 'wanted', setType: 'item' }), []);
});

test('separate favorite and history filters do not mutate one another or stored entries', () => {
    const before = JSON.stringify(entries);
    selectLibraryEntries(entries, { type: 'monster', query: 'ポリン', setId: '' });
    assert.equal(selectLibraryEntries(entries, { type: 'all', query: '', setId: '' }).length, 3);
    assert.equal(JSON.stringify(entries), before);
});

test('version history uses recorded versions and dates and copies the provided data', () => {
    const value = [{ version: '2026.9.1', date: '2026-09-06', changes: ['お気に入りを追加', '<b>literal text</b>'] }];
    const result = parseVersionHistory(value);
    assert.deepEqual(result, value);
    assert.notEqual(result[0].changes, value[0].changes);
});

test('malformed version history is rejected instead of partially rendering corrupt data', () => {
    for (const value of [null, {}, [null], [{ version: '2026.9.1', date: '2026-09-06', changes: [7] }],
        [{ version: '2026.9.1', date: 'tomorrow', changes: [] }]]) {
        assert.throws(() => parseVersionHistory(value), /更新履歴の形式/);
    }
});
