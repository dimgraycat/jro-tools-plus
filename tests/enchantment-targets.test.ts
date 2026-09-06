import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTargetIndex, targetsForItem, createTargetLoader } from '../tools/lib/enchantment-targets.js';
const payload = { items: [
    { item_id: '15424', sets: [{ slots: [{ candidates: [{ item_id: '4879', name: '大鷲の眼光' }, { name: '大鷲の眼光' }] }] }] },
    { item_id: '1100', sets: [{ slots: [{ candidates: [{ name: '大鷲の眼光' }] }] }] },
    { item_id: '999', sets: [{ slots: [{ candidates: [{ item_id: '1', name: '別効果' }] }] }] },
] };
const names = { '15424': '天蝎宮のメイル[1]', '1100': '装備B' };
const effect = { id: '4879', name: '大鷲の眼光' };

test('reverse lookup unions exact ID/name and deduplicates equipment across slots', () => {
    const index = buildTargetIndex(payload, names);
    const targets = targetsForItem(index, effect);
    assert.deepEqual(targets.map((item) => item.id).sort(), ['1100', '15424']);
    assert.equal(targets.find((item) => item.id === '15424')?.name, names['15424']);
    assert.deepEqual(targetsForItem(index, { id: '15424', name: names['15424'] }), []);
    assert.deepEqual(targetsForItem(index, { id: '77', name: '大鷲' }), []);
    assert.equal(targetsForItem(index, { id: '4879', name: '別名' }).length, 1);
});

test('target data validates payload and excludes malformed target IDs', () => {
    assert.throws(() => buildTargetIndex({}, names));
    assert.throws(() => buildTargetIndex(payload, null));
    const index = buildTargetIndex({ items: [{ ...payload.items[0], item_id: '../evil' }] }, names);
    assert.deepEqual(targetsForItem(index, effect), []);
});

test('loader retries failures, caches success and omits credentials', async () => {
    let fail = true;
    let calls = 0;
    const loader = createTargetLoader(async (url, options) => {
        ++calls;
        assert.equal(options?.credentials, 'omit');
        if (fail) return new Response('', { status: 503 });
        return new Response(JSON.stringify(String(url).endsWith('name-map.json') ? names : payload));
    });
    const signal = new AbortController().signal;
    await assert.rejects(loader(effect, signal));
    fail = false;
    assert.equal((await loader(effect, signal)).length, 2);
    const afterSuccess = calls;
    assert.equal((await loader(effect, signal)).length, 2);
    assert.equal(calls, afterSuccess);
});
