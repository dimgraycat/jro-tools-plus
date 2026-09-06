import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type LibraryEntry, normalizeLibrary, recordVisit, setFavorite } from '../tools/lib/personal-library.js';
import {
  type WebSnapshot,
  exportWebSnapshot,
  mergeWebSnapshot,
  normalizeSnapshot,
  webKeys,
  webType,
  searchUrl,
} from '../tools/lib/web-sync.js';

const item = (id: string, viewedAt = 100): LibraryEntry => ({ type: 'item', id, name: `Item ${id}`, viewedAt });
const snapshot = (ids: string[] = [], history: string[] = []): WebSnapshot => ({
  sets: [{ id: 'default', name: 'お気に入り', ids }], history, activeSetId: 'default',
});

describe('Web synchronization routing and validation', () => {
  it('builds type-specific JRO Search detail links without injecting extra query parameters', () => {
    assert.equal(searchUrl({ type: 'item', id: '501' }), 'https://asgrcat.github.io/jro-search/items/?id=501');
    assert.equal(searchUrl({ type: 'monster', id: 'PORING' }), 'https://asgrcat.github.io/jro-search/monsters/?id=PORING');
    const id = '501&scope=favorite#other';
    const url = new URL(searchUrl({ type: 'item', id }));
    assert.equal(url.searchParams.get('id'), id);
    assert.equal(url.searchParams.has('scope'), false);
    assert.equal(url.hash, '');
  });
  it('recognizes only production item and monster search pages', () => {
    assert.equal(webType('https://asgrcat.github.io/jro-search/items/?q=赤#detail'), 'item');
    assert.equal(webType('https://asgrcat.github.io/jro-search/monsters/index.html'), 'monster');
    for (const url of [
      '', '/jro-search/items/', 'http://asgrcat.github.io/jro-search/items/',
      'https://asgrcat.github.io.example.test/jro-search/items/',
      'https://asgrcat.github.io/other/items/', 'https://asgrcat.github.io/jro-search/items/nested/',
      'https://rotool.gungho.jp/item/501/',
    ]) assert.equal(webType(url), null, url);
  });

  it('uses the existing distinct item and monster storage keys', () => {
    assert.deepEqual(webKeys('item'), {
      sets: 'jro-search.items.favoriteSets', legacy: 'jro-search.items.favoriteItems',
      history: 'jro-search.items.recentItems', baseline: 'jro-search.items.toolsPlusSyncBaseline',
      instance: 'jro-search.items.toolsPlusSyncInstance',
    });
    assert.deepEqual(webKeys('monster'), {
      sets: 'jro-search.monsters.favoriteSets', legacy: 'jro-search.monsters.favorites',
      history: 'jro-search.monsters.history', baseline: 'jro-search.monsters.toolsPlusSyncBaseline',
      instance: 'jro-search.monsters.toolsPlusSyncInstance',
    });
  });

  it('normalizes malformed snapshots, ensures the default set, and validates active selection', () => {
    for (const value of [null, undefined, {}, { sets: 'bad', history: {} }]) {
      assert.deepEqual(normalizeSnapshot(value, 'item'), snapshot());
    }
    assert.deepEqual(normalizeSnapshot({
      sets: [null, {}, { id: 'wanted', name: '欲しい装備', ids: ['501', '501', 501, 'invalid'] },
        { id: 'wanted', name: '重複', ids: ['502'] }],
      history: ['501', '501', '502', null], activeSetId: 'missing',
    }, 'item'), {
      sets: [snapshot().sets[0], { id: 'wanted', name: '欲しい装備', ids: ['501'] }],
      history: ['501', '502'], activeSetId: 'default',
    });
  });

  it('rejects IDs with URL syntax instead of accepting them as detail links', () => {
    const state = normalizeSnapshot({ sets: [{ id: 'default', ids: ['501', '501/?x=1', '501/#x', '501/'] }] }, 'item');
    assert.deepEqual(state.sets[0].ids, ['501']);
  });

  it('limits history to 50 valid unique IDs while preserving Web ordering', () => {
    const ids = Array.from({ length: 60 }, (_, index) => String(index));
    assert.deepEqual(normalizeSnapshot(snapshot([], ids), 'item').history, ids.slice(0, 50));
    assert.deepEqual(normalizeSnapshot(snapshot(['Ab_12', 'bad-id']), 'monster').sets[0].ids, ['Ab_12']);
  });
});

describe('favorite synchronization', () => {
  it('unions both stores on first connection and resolves display names', () => {
    const original = setFavorite(normalizeLibrary({}), item('501'), true, 10);
    const merged = mergeWebSnapshot(original, 'item', snapshot(['502']), null, { '502': '青ポーション' }, 1000);
    assert.deepEqual(exportWebSnapshot(merged, 'item').sets[0].ids, ['502', '501']);
    assert.equal(merged.favorites.find(entry => entry.id === '502')?.name, '青ポーション');
    assert.deepEqual(exportWebSnapshot(original, 'item').sets[0].ids, ['501']);
  });

  it('applies additions and deletions relative to the acknowledged baseline', () => {
    let original = setFavorite(normalizeLibrary({}), item('501'), true, 10);
    original = setFavorite(original, item('503'), true, 20);
    const merged = mergeWebSnapshot(original, 'item', snapshot(['502']), snapshot(['501']), {}, 1000);
    assert.deepEqual(exportWebSnapshot(merged, 'item').sets[0].ids, ['502', '503']);
  });

  it('does not resurrect extension deletions when a stale Web tab reports unchanged state', () => {
    const baseline = snapshot(['501']);
    const empty = normalizeLibrary({});
    const merged = mergeWebSnapshot(empty, 'item', baseline, baseline, {}, 1000);
    assert.deepEqual(merged, empty);
  });

  it('preserves memberships in multiple sets and same-ID monster favorites', () => {
    let state = normalizeLibrary({ sets: [{ type: 'item', id: 'wanted', name: '欲しい装備' }] });
    state = setFavorite(state, item('501'), true, 10, 'default');
    state = setFavorite(state, item('501'), true, 10, 'wanted');
    state = setFavorite(state, { ...item('501'), type: 'monster' }, true, 20);
    const previous = exportWebSnapshot(state, 'item');
    const current = structuredClone(previous);
    current.sets[0].ids = [];
    const merged = mergeWebSnapshot(state, 'item', current, previous);
    assert.deepEqual(merged.favorites.find(entry => entry.type === 'item')?.setIds, ['wanted']);
    assert.deepEqual(exportWebSnapshot(merged, 'monster').sets[0].ids, ['501']);
  });

  it('renames and deletes sets without losing other memberships', () => {
    const baseline: WebSnapshot = {
      sets: [snapshot(['501']).sets[0], { id: 'wanted', name: '旧名', ids: ['501', '502'] }],
      history: [], activeSetId: 'wanted',
    };
    const initial = mergeWebSnapshot(normalizeLibrary({}), 'item', baseline, null);
    const renamed = structuredClone(baseline);
    renamed.sets[1].name = '新名';
    const state = mergeWebSnapshot(initial, 'item', renamed, baseline);
    assert.equal(state.sets.find(set => set.type === 'item' && set.id === 'wanted')?.name, '新名');
    const removed = mergeWebSnapshot(state, 'item', snapshot(['501']), renamed);
    assert.deepEqual(exportWebSnapshot(removed, 'item', 'wanted'), snapshot(['501']));
  });

  it('exports only the selected entity type and keeps a valid active set', () => {
    const source: WebSnapshot = {
      sets: [snapshot(['501']).sets[0], { id: 'wanted', name: '欲しい装備', ids: ['502'] }],
      history: ['502', '501'], activeSetId: 'wanted',
    };
    const state = mergeWebSnapshot(normalizeLibrary({}), 'item', source, null, {}, 1000);
    assert.deepEqual(exportWebSnapshot(state, 'item', 'wanted'), source);
    assert.deepEqual(exportWebSnapshot(state, 'monster'), snapshot());
  });
});

describe('history synchronization', () => {
  it('imports ordering, preserves existing timestamps, and promotes a new top visit', () => {
    const initial = recordVisit(normalizeLibrary({}), item('503', 10));
    const baseline = snapshot([], ['501', '502']);
    const state = mergeWebSnapshot(initial, 'item', baseline, null, {}, 1000);
    assert.deepEqual(exportWebSnapshot(state, 'item').history, ['501', '502', '503']);
    const current = snapshot([], ['502', '501']);
    const revisited = mergeWebSnapshot(state, 'item', current, baseline, {}, 2000);
    assert.deepEqual(exportWebSnapshot(revisited, 'item').history, ['502', '501', '503']);
    assert.equal(revisited.history.find(entry => entry.id === '501')?.viewedAt, 1000);
    assert.equal(revisited.history.find(entry => entry.id === '502')?.viewedAt, 2000);
  });

  it('propagates history removals without touching another entity type', () => {
    let state = recordVisit(normalizeLibrary({}), item('501'));
    state = recordVisit(state, { ...item('501'), type: 'monster' });
    const merged = mergeWebSnapshot(state, 'item', snapshot(), snapshot([], ['501']));
    assert.deepEqual(merged.history.map(entry => entry.type), ['monster']);
  });

  it('leaves unchanged stale history deleted and does not mutate inputs', () => {
    const baseline = snapshot(['501'], ['501']);
    const current = structuredClone(baseline);
    const state = normalizeLibrary({});
    const original = structuredClone(state);
    const merged = mergeWebSnapshot(state, 'item', current, baseline, {}, 5000);
    assert.deepEqual(merged.history, []);
    assert.deepEqual(state, original);
    assert.deepEqual(current, baseline);
  });
});
