import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detailUrl, loadAssistItem, parseAssistItem, validItemId } from '../tools/lib/search-assist.js';

const fixture = { items: [{ item_id: '15424', name: '天蝎宮のメイル[1]', enchantments: { sets: [{
    name: 'ラビリンスエンチャント', npc_name: '迷宮調査研究員', selection_method: 'random',
    fee: [{ item_name: '迷宮調査貢献の証', amount: 10 }], success_rate: '100%',
    failure_effect: '装備消滅', required_enchanted_slots: '第4スロット',
    slots: [{ slot_label: '第3スロット', required_refine: '精錬値9以上', required_enchantment: '前提効果',
        candidates: [{ name: '大鷲の眼光', item_id: '4879' }, { name: '未解決効果', item_id: 'javascript:alert(1)' }] }],
}] } }] };

test('detail shard uses the same modulo64 mapping as JRO Search', () => {
    assert.equal(detailUrl('15424'), 'https://asgrcat.github.io/jro-search/data/search/item-details/00.json');
    assert.ok(detailUrl('501').endsWith('/53.json'));
    for (const id of ['../00', '0', '-1', '1e2', '1.5', '9007199254740993']) {
        assert.equal(validItemId(id), false);
        assert.throws(() => detailUrl(id));
    }
});

test('parses enchantment costs, conditions, slots and safe candidate IDs', () => {
    const item = parseAssistItem(fixture, '15424')!;
    assert.equal(item.name, '天蝎宮のメイル[1]');
    assert.ok(item.sets[0].conditions.includes('必要素材: 迷宮調査貢献の証 10個'));
    assert.ok(item.sets[0].conditions.includes('装備消滅'));
    assert.ok(item.sets[0].conditions.includes('ランダムエンチャント'));
    assert.deepEqual(item.sets[0].slots[0].conditions, ['精錬条件: 精錬値9以上', '前提: 前提効果']);
    assert.deepEqual(item.sets[0].slots[0].candidates, [
        { name: '大鷲の眼光', id: '4879' }, { name: '未解決効果', id: '' },
    ]);
});

test('distinguishes missing items, no enchantments and invalid responses', () => {
    assert.equal(parseAssistItem(fixture, '501'), null);
    assert.deepEqual(parseAssistItem({ items: [{ item_id: '501', name: '赤ポーション' }] }, '501')?.sets, []);
    assert.throws(() => parseAssistItem({}, '501'));
    assert.throws(() => parseAssistItem({ items: [{ item_id: '501', enchantments: { sets: {} } }] }, '501'));
});

test('loads without credentials and propagates HTTP, JSON and cancellation failures for retry', async () => {
    const controller = new AbortController();
    const fetcher: typeof fetch = async (url, options) => {
        assert.equal(url, detailUrl('15424'));
        assert.equal(options?.credentials, 'omit');
        assert.equal(options?.signal, controller.signal);
        return new Response(JSON.stringify(fixture));
    };
    assert.equal((await loadAssistItem('15424', controller.signal, fetcher))?.id, '15424');
    await assert.rejects(loadAssistItem('15424', controller.signal, async () => new Response('', { status: 503 })));
    await assert.rejects(loadAssistItem('15424', controller.signal, async () => new Response('not json')));
    await assert.rejects(loadAssistItem('15424', controller.signal, async () => { throw new Error('aborted'); }));
    // Failed calls are not cached: the next attempt can succeed.
    assert.ok(await loadAssistItem('15424', controller.signal, fetcher));
});
