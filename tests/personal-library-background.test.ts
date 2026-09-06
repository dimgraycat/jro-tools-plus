import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';

import { LIBRARY_KEY, type PersonalLibrary, normalizeLibrary, setFavorite } from '../tools/lib/personal-library.js';

type Message = Record<string, unknown>;
type Response = { ok: boolean; state?: PersonalLibrary; error?: string };
type Listener = (message: Message, sender: chrome.runtime.MessageSender, respond: (value: Response) => void) => boolean | void;

const extensionId = 'test-jro-tools-plus';
const extensionUrl = `chrome-extension://${extensionId}/`;
const panelSender: chrome.runtime.MessageSender = { id: extensionId, url: `${extensionUrl}tools/panel.html` };
const webSender: chrome.runtime.MessageSender = {
  id: extensionId, url: 'https://asgrcat.github.io/jro-search/items/', frameId: 0,
};
let listener: Listener;
let store: Record<string, unknown> = {};
let storageReads = 0;
let storageWrites = 0;
let fetchCalls = 0;
let tabCalls = 0;
const originalFetch = globalThis.fetch;
const originalChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome');

Object.defineProperty(globalThis, 'chrome', { configurable: true, value: {
  runtime: {
    id: extensionId,
    getURL: (path: string) => `${extensionUrl}${path}`,
    onMessage: { addListener: (registered: Listener) => { listener = registered; } },
  },
  storage: { local: {
    get: async (key: string) => {
      storageReads++;
      const captured = structuredClone({ [key]: store[key] });
      // Yield after reading: unqueued concurrent requests would both observe the old state.
      await new Promise(resolve => setTimeout(resolve, 1));
      return captured;
    },
    set: async (value: Record<string, unknown>) => {
      storageWrites++;
      Object.assign(store, structuredClone(value));
    },
  } },
  tabs: { query: async () => { tabCalls++; throw new Error('No Web tabs available'); } },
} });

globalThis.fetch = async () => { fetchCalls++; throw new Error('Offline'); };
await import('../background/lib/personal-library.js');

const send = (message: Message, sender = panelSender): Promise<Response> => new Promise((resolve, reject) => {
  const accepted = listener(message, sender, resolve);
  if (accepted !== true) reject(new Error('Message rejected'));
});
const favorite = (id: string): Message => ({
  type: 'library.favorite', entry: { type: 'item', id, name: `Item ${id}` }, favorite: true,
});

beforeEach(() => {
  store = {};
  storageReads = storageWrites = fetchCalls = tabCalls = 0;
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalChrome) Object.defineProperty(globalThis, 'chrome', originalChrome);
  else Reflect.deleteProperty(globalThis, 'chrome');
});

describe('personal library background requests', () => {
  it('opens a local library with no Web tab or remote fetch', async () => {
    const saved = setFavorite(normalizeLibrary({ syncId: 'session-1' }), { type: 'item', id: '501', name: '赤ポーション', viewedAt: 1 }, true, 2);
    store[LIBRARY_KEY] = saved;
    const response = await send({ type: 'library.get' });
    assert.equal(response.ok, true);
    assert.deepEqual(response.state, saved);
    assert.equal(storageReads, 1);
    assert.equal(storageWrites, 0);
    assert.equal(fetchCalls, 0);
    assert.equal(tabCalls, 0);
  });

  it('serializes concurrent favorite additions so neither update is lost', async () => {
    const responses = await Promise.all([send(favorite('501')), send(favorite('502')), send(favorite('503'))]);
    assert.ok(responses.every(response => response.ok));
    const saved = normalizeLibrary(store[LIBRARY_KEY]);
    assert.deepEqual(saved.favorites.map(entry => entry.id).sort(), ['501', '502', '503']);
    assert.equal(saved.revision, 3);
    assert.equal(storageWrites, 3);
    assert.equal(fetchCalls, 0);
  });

  it('rejects unrelated origins, embedded official pages, and non-extension panel senders', () => {
    const cases: Array<[Message, chrome.runtime.MessageSender]> = [
      [{ type: 'library.get' }, { id: extensionId, url: 'https://example.test/' }],
      [favorite('501'), { id: 'another-extension', url: panelSender.url }],
      [{ type: 'library.web-sync' }, { ...webSender, frameId: 1 }],
      [{ type: 'library.web-sync' }, { ...webSender, url: 'https://asgrcat.github.io.example.test/jro-search/items/' }],
      [{ type: 'library.visit', entry: { type: 'item', id: '501', name: '赤ポーション' } },
        { id: extensionId, url: 'https://rotool.gungho.jp/item/501/', frameId: 1 }],
    ];
    for (const [message, sender] of cases) {
      let responded = false;
      assert.equal(listener(message, sender, () => { responded = true; }), undefined);
      assert.equal(responded, false);
    }
    assert.equal(storageReads, 0);
    assert.equal(storageWrites, 0);
  });

  it('requires official visit messages to originate from this extension', () => {
    const accepted = listener({ type: 'library.visit', entry: { type: 'item', id: '501', name: '赤ポーション' } },
      { id: 'another-extension', url: 'https://rotool.gungho.jp/item/501/', frameId: 0 }, () => {});
    assert.equal(accepted, undefined);
    assert.equal(storageReads, 0);
  });

  it('rejects a visit for another item and processes later valid requests', async () => {
    const sender = { id: extensionId, url: 'https://rotool.gungho.jp/item/501/', frameId: 0 };
    const rejected = await send({ type: 'library.visit', entry: { type: 'item', id: '502', name: '青ポーション' } }, sender);
    assert.equal(rejected.ok, false);
    assert.equal(storageWrites, 0);
    const accepted = await send({ type: 'library.visit', entry: { type: 'item', id: '501', name: '赤ポーション' } }, sender);
    assert.equal(accepted.ok, true);
    assert.deepEqual(accepted.state?.history.map(entry => entry.id), ['501']);
    assert.equal(storageWrites, 1);
  });

  it('records trailing numeric item URLs without duplicating canonical history', async () => {
    const entry = { type: 'item', id: '26165', name: '装備' };
    for (const path of ['/item/26165/', '/item/26165/0/']) {
      const response = await send({ type: 'library.visit', entry },
        { id: extensionId, url: 'https://rotool.gungho.jp' + path, frameId: 0 });
      assert.equal(response.ok, true);
      assert.deepEqual(response.state?.history.map(value => value.id), ['26165']);
    }
    // Same-millisecond revisits may be identical and skip the second write.
    assert.ok(storageWrites >= 1 && storageWrites <= 2);
  });

  it('returns a recoverable error for malformed updates without blocking the request queue', async () => {
    const invalid = await send({ ...favorite('501'), favorite: 'yes' });
    assert.equal(invalid.ok, false);
    assert.equal(storageWrites, 0);
    const valid = await send(favorite('502'));
    assert.equal(valid.ok, true);
    assert.deepEqual(valid.state?.favorites.map(entry => entry.id), ['502']);
  });

  it('keeps existing favorites and accepts initial Web data when name fetch fails', async () => {
    store[LIBRARY_KEY] = setFavorite(normalizeLibrary({}), { type: 'item', id: '501', name: '赤ポーション', viewedAt: 1 }, true, 2);
    const response = await send({
      type: 'library.web-sync',
      current: { sets: [{ id: 'default', name: 'お気に入り', ids: ['502'] }], history: ['502'], activeSetId: 'default' },
      previous: null,
    }, webSender);
    assert.equal(response.ok, true);
    assert.deepEqual(response.state?.favorites.map(entry => entry.id).sort(), ['501', '502']);
    assert.equal(response.state?.favorites.find(entry => entry.id === '501')?.name, '赤ポーション');
    assert.deepEqual(response.state?.history.map(entry => entry.id), ['502']);
    assert.equal(fetchCalls, 1);
    assert.equal(tabCalls, 0);
    const readback = await send({ type: 'library.get' });
    assert.deepEqual(readback.state, response.state);
    assert.equal(fetchCalls, 1);
  });

  it('records a revisit of the existing Web history head even when its ID array is unchanged', async () => {
    store[LIBRARY_KEY] = normalizeLibrary({ syncId: 'session-1', history: [
      { type: 'item', id: '501', name: '赤ポーション', viewedAt: 100 },
      { type: 'monster', id: '1002', name: 'ポリン', viewedAt: 200 },
    ] });
    const current = { sets: [{ id: 'default', name: 'お気に入り', ids: [] }], history: ['501'], activeSetId: 'default' };
    const response = await send({ type: 'library.web-sync', current, previous: current, syncId: 'session-1', visitedId: '501' }, webSender);
    assert.equal(response.ok, true);
    assert.deepEqual(response.state?.history.map(entry => entry.id), ['501', '1002']);
    assert.ok(response.state!.history[0].viewedAt > 200);
    assert.equal(response.state?.history[0].name, '赤ポーション');
    assert.equal(storageWrites, 1);
  });

  it('does not record a claimed revisit that is absent from the current Web history', async () => {
    store[LIBRARY_KEY] = normalizeLibrary({ syncId: 'session-1', history: [{ type: 'item', id: '501', name: '赤ポーション', viewedAt: 100 }] });
    const current = { sets: [{ id: 'default', name: 'お気に入り', ids: [] }], history: ['501'], activeSetId: 'default' };
    const response = await send({ type: 'library.web-sync', current, previous: current, syncId: 'session-1', visitedId: '502' }, webSender);
    assert.equal(response.ok, true);
    assert.deepEqual(response.state?.history.map(entry => entry.id), ['501']);
    assert.equal(response.state?.history[0].viewedAt, 100);
    assert.equal(storageWrites, 0);
  });

  it('imports existing Web records after extension storage was cleared despite an old Web baseline', async () => {
    const current = { sets: [{ id: 'default', name: 'お気に入り', ids: ['501'] }], history: ['501'], activeSetId: 'default' };
    const response = await send({ type: 'library.web-sync', current, previous: current, syncId: 'old-session' }, webSender);
    assert.equal(response.ok, true);
    assert.deepEqual(response.state?.favorites.map(entry => entry.id), ['501']);
    assert.deepEqual(response.state?.history.map(entry => entry.id), ['501']);
    assert.equal(storageWrites, 1);
  });

  it('imports old Web records after a fresh extension visit recreated storage with a new sync identity', async () => {
    const visit = await send({ type: 'library.visit', entry: { type: 'item', id: '502', name: '青ポーション' } },
      { id: extensionId, url: 'https://rotool.gungho.jp/item/502/', frameId: 0 });
    assert.equal(visit.ok, true);
    assert.ok(visit.state?.syncId);
    const current = { sets: [{ id: 'default', name: 'お気に入り', ids: ['501'] }], history: ['501'], activeSetId: 'default' };
    const response = await send({ type: 'library.web-sync', current, previous: current, syncId: 'old-session' }, webSender);
    assert.equal(response.ok, true);
    assert.equal(response.state?.syncId, visit.state?.syncId);
    assert.deepEqual(response.state?.favorites.map(entry => entry.id), ['501']);
    assert.deepEqual(response.state?.history.map(entry => entry.id).sort(), ['501', '502']);
  });

  it('does not resurrect deleted records when Web baseline belongs to the current extension identity', async () => {
    store[LIBRARY_KEY] = normalizeLibrary({ syncId: 'session-1' });
    const current = { sets: [{ id: 'default', name: 'お気に入り', ids: ['501'] }], history: ['501'], activeSetId: 'default' };
    const response = await send({ type: 'library.web-sync', current, previous: current, syncId: 'session-1' }, webSender);
    assert.equal(response.ok, true);
    assert.deepEqual(response.state?.favorites, []);
    assert.deepEqual(response.state?.history, []);
    assert.equal(storageWrites, 0);
  });
});
