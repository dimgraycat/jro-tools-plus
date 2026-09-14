import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMembershipIndex, createMembershipLoader } from '../tools/lib/package-memberships.js';

const fixture = { groups: [
    { key: 'costama', packages: [{ key: 'costama', label: '2026GourmetII', url: 'https://ragnarokonline.gungho.jp/cms/news/costama-gourmet2', item_ids: ['501', '501', 'invalid'], revivals: [{ label: '復刻コスたま2026 Season3', period: '2026年8月25日～2026年9月22日', url: 'javascript:alert(1)' }] }] },
    { key: 'ragcan', packages: [
        { key: 'september', label: '2026Sep', url: 'javascript:alert(1)', item_ids: ['501'] },
        { key: 'august', label: '2026Aug', url: 'https://ragnarokonline.gungho.jp.evil.example/', item_ids: ['501'] },
    ] },
    { key: 'campaign', packages: [{ key: 'excluded', item_ids: ['501'] }] },
] };

test('maps all costume and ragcan appearances by ID in published order, deduplicating IDs', () => {
    const index = buildMembershipIndex(fixture);
    assert.equal(index.size, 1);
    const entries = index.get('501')!;
    assert.deepEqual(entries.map(({ group, label }) => [group, label]), [
        ['costama', '2026 GourmetII'], ['ragcan', '2026年09月'], ['ragcan', '2026年08月'],
    ]);
    assert.equal(entries[0].url, 'https://ragnarokonline.gungho.jp/cms/news/costama-gourmet2');
    assert.deepEqual(entries[0].revivals, [{ label: '復刻コスたま2026 Season3', period: '2026年8月25日～2026年9月22日', url: '' }]);
    assert.deepEqual(entries[1].revivals, []);
    assert.equal(entries[1].url, '');
    assert.equal(entries[2].url, '');
    assert.equal(index.get('502'), undefined);
    assert.throws(() => buildMembershipIndex({}));
    assert.throws(() => buildMembershipIndex({ groups: [{ key: 'costama' }] }));
});

test('caches successful catalog loads, retries failure, and respects cancellation', async () => {
    let calls = 0;
    const controller = new AbortController();
    const load = createMembershipLoader(async (url, options) => {
        calls++;
        assert.ok(String(url).endsWith('/package-index.json'));
        assert.equal(options?.credentials, 'omit');
        assert.equal(options?.signal, controller.signal);
        if (calls === 1) return new Response('', { status: 503 });
        return new Response(JSON.stringify(fixture));
    });
    await assert.rejects(load('501', controller.signal));
    assert.equal((await load('501', controller.signal)).length, 3);
    assert.deepEqual(await load('502', controller.signal), []);
    assert.equal(calls, 2);
    controller.abort();
    await assert.rejects(load('501', controller.signal));
});
