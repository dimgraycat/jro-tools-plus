import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';

import { LIBRARY_KEY, normalizeLibrary } from '../tools/lib/personal-library.js';
import { type WebSnapshot, mergeWebSnapshot, webKeys } from '../tools/lib/web-sync.js';

// Exercise the distributable content script with browser APIs replaced, without a network or browser.
const bundle = readFileSync('dist/content_scripts/web-library-bridge.js', 'utf8');
const keys = webKeys('item');
const snapshot = (ids: string[]): WebSnapshot => ({
  sets: [{ id: 'default', name: 'お気に入り', ids }], history: [], activeSetId: 'default',
});
const response = (ids: string[]) => ({ ok: true, state: mergeWebSnapshot(normalizeLibrary({ syncId: 'session-1' }), 'item', snapshot(ids), null, {}, 100) });
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
type Request = { type: string; current: WebSnapshot; previous: WebSnapshot | null; syncId?: string | null; visitedId?: string };

function fixture(initial = ['501'], baseline: WebSnapshot | null = snapshot(initial)) {
  const storage = new Map<string, string>();
  const timers = new Map<number, () => void>();
  const intervals = new Map<number, () => void>();
  const requests: Request[] = [];
  const window = new EventTarget() as EventTarget & { top: EventTarget };
  window.top = window;
  let timerId = 0;
  let onStorageChanged: (changes: Record<string, unknown>, area: string) => void = () => {};
  let transport: (message: Request) => Promise<unknown> = async () => response(initial);
  let updatedEvents = 0;
  window.addEventListener('jro-search:personal-data-updated', () => { updatedEvents++; });
  const writeIds = (ids: string[]) => {
    storage.set(keys.sets, JSON.stringify({ version: 1, activeSetId: 'default',
      sets: [{ id: 'default', name: 'お気に入り', itemIds: ids }] }));
    storage.set(keys.legacy, JSON.stringify(ids));
  };
  writeIds(initial);
  storage.set(keys.history, '[]');
  if (baseline) storage.set(keys.baseline, JSON.stringify(baseline));
  if (baseline) storage.set(keys.instance, 'session-1');
  runInNewContext(bundle, {
    window, location: { href: 'https://asgrcat.github.io/jro-search/items/' }, URL, Event,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
    },
    chrome: {
      runtime: { sendMessage: (message: Request) => { requests.push(copy(message)); return transport(message); } },
      storage: { onChanged: { addListener: (listener: typeof onStorageChanged) => { onStorageChanged = listener; } } },
    },
    setTimeout: (callback: () => void) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id: number) => { timers.delete(id); },
    setInterval: (callback: () => void) => { intervals.set(++timerId, callback); return timerId; },
    clearInterval: (id: number) => { intervals.delete(id); },
  });
  const drainMicrotasks = async () => { for (let count = 0; count < 10; count++) await Promise.resolve(); };
  const tick = async () => {
    const pending = [...timers.values()];
    timers.clear();
    for (const callback of pending) callback();
    await drainMicrotasks();
  };
  return {
    storage, timers, intervals, requests, tick, drainMicrotasks, writeIds,
    get updatedEvents() { return updatedEvents; },
    get savedIds(): string[] { return JSON.parse(storage.get(keys.sets)!).sets[0].itemIds; },
    setTransport: (callback: typeof transport) => { transport = callback; },
    changed: () => window.dispatchEvent(new Event('jro-search:personal-data-changed')),
    visited: (id: string) => {
      const event = new Event('jro-search:personal-data-changed');
      Object.defineProperty(event, 'detail', { value: { kind: 'history', id } });
      window.dispatchEvent(event);
    },
    remoteChanged: () => onStorageChanged({ [LIBRARY_KEY]: { newValue: {} } }, 'local'),
    onUpdated: (callback: () => void) => window.addEventListener('jro-search:personal-data-updated', callback),
    resume: () => window.dispatchEvent(new Event('pageshow')),
    dispose: () => window.dispatchEvent(new Event('pagehide')),
  };
}

describe('Web library bridge transport', () => {
  it('does not throw or schedule work when Chrome extension APIs are entirely absent', () => {
    const window = new EventTarget() as EventTarget & { top: EventTarget };
    window.top = window;
    assert.doesNotThrow(() => runInNewContext(bundle, {
      window, location: { href: 'https://asgrcat.github.io/jro-search/items/' }, URL, Event,
      setTimeout: () => assert.fail('Should not schedule synchronization without extension APIs'),
      setInterval: () => assert.fail('Should not poll without extension APIs'),
      localStorage: { getItem: () => assert.fail('Should not inspect storage without extension APIs') },
    }));
  });

  it('preserves local data when extension transport rejects and retries on the next local event', async () => {
    const bridge = fixture();
    const before = new Map(bridge.storage);
    bridge.setTransport(async () => { throw new Error('Extension context invalidated'); });
    await bridge.tick();
    assert.equal(bridge.requests.length, 1);
    assert.deepEqual(bridge.storage, before);
    assert.equal(bridge.updatedEvents, 0);
    bridge.setTransport(async () => response(['501', '502']));
    bridge.changed();
    await bridge.tick();
    assert.equal(bridge.requests.length, 2);
    assert.deepEqual([...bridge.savedIds].sort(), ['501', '502']);
    assert.equal(bridge.storage.get(keys.instance), 'session-1');
    assert.equal(bridge.updatedEvents, 1);
    bridge.dispose();
  });

  it('handles a transport that throws synchronously or returns no response', async () => {
    const bridge = fixture();
    const before = new Map(bridge.storage);
    bridge.setTransport(() => { throw new Error('Receiving end does not exist'); });
    await bridge.tick();
    bridge.setTransport(async () => undefined);
    bridge.changed();
    await bridge.tick();
    assert.equal(bridge.requests.length, 2);
    assert.deepEqual(bridge.storage, before);
    bridge.dispose();
  });

  it('does not send malformed stored JSON as an intentional empty favorite list', async () => {
    const bridge = fixture();
    bridge.storage.set(keys.sets, '{broken');
    const before = new Map(bridge.storage);
    await bridge.tick();
    assert.equal(bridge.requests.length, 0);
    assert.deepEqual(bridge.storage, before);
    bridge.writeIds(['501']);
    bridge.changed();
    await bridge.tick();
    assert.equal(bridge.requests.length, 1);
    assert.deepEqual(bridge.requests[0].current.sets[0].ids, ['501']);
    bridge.dispose();
  });

  it('preserves syntactically valid JSON with malformed set or history structures', async () => {
    const cases: Array<[string, unknown]> = [
      [keys.sets, {}],
      [keys.sets, { sets: 'broken' }],
      [keys.sets, { sets: [null] }],
      [keys.sets, { sets: [{ id: 'default', name: 'お気に入り', itemIds: {} }] }],
      [keys.sets, { sets: [{ id: 'default', name: 'お気に入り', itemIds: [501] }] }],
      [keys.sets, { sets: [{ id: '', name: 'お気に入り', itemIds: [] }] }],
      [keys.history, {}],
      [keys.history, [501]],
      [keys.history, '501'],
    ];
    for (const [key, value] of cases) {
      const bridge = fixture();
      bridge.storage.set(key, JSON.stringify(value));
      const before = new Map(bridge.storage);
      await bridge.tick();
      assert.equal(bridge.requests.length, 0, `${key}: ${JSON.stringify(value)}`);
      assert.deepEqual(bridge.storage, before);
      bridge.dispose();
    }
  });

  it('does not turn a malformed legacy favorite list into deletions during migration', async () => {
    for (const value of [{}, [501], '501']) {
      const bridge = fixture();
      bridge.storage.delete(keys.sets);
      bridge.storage.set(keys.legacy, JSON.stringify(value));
      const before = new Map(bridge.storage);
      await bridge.tick();
      assert.equal(bridge.requests.length, 0);
      assert.deepEqual(bridge.storage, before);
      bridge.dispose();
    }
  });

  it('keeps Web edits made during an in-flight request and sends their delta afterward', async () => {
    const bridge = fixture();
    let finish: (value: unknown) => void = () => {};
    bridge.setTransport(() => new Promise(resolve => { finish = resolve; }));
    await bridge.tick();
    assert.equal(bridge.requests.length, 1);
    bridge.writeIds(['501', '502']);
    bridge.changed();
    await bridge.tick();
    assert.equal(bridge.requests.length, 1);
    finish(response(['501', '503']));
    await bridge.drainMicrotasks();
    assert.deepEqual(bridge.savedIds, ['501', '502']);
    assert.deepEqual(JSON.parse(bridge.storage.get(keys.baseline)!).sets[0].ids, ['501']);
    assert.equal(bridge.storage.get(keys.instance), 'session-1');
    bridge.setTransport(async () => response(['501', '502', '503']));
    await bridge.tick();
    assert.equal(bridge.requests.length, 2);
    assert.deepEqual(bridge.requests[1].current.sets[0].ids, ['501', '502']);
    assert.deepEqual(bridge.requests[1].previous?.sets[0].ids, ['501']);
    assert.equal(bridge.requests[1].syncId, 'session-1');
    assert.deepEqual([...bridge.savedIds].sort(), ['501', '502', '503']);
    bridge.dispose();
  });

  it('applies remote changes once without feeding page refresh events into an endless sync loop', async () => {
    const bridge = fixture();
    bridge.onUpdated(() => bridge.changed());
    bridge.setTransport(async () => response(['501', '502']));
    await bridge.tick();
    assert.equal(bridge.updatedEvents, 1);
    assert.equal(bridge.timers.size, 0);
    bridge.remoteChanged();
    await bridge.tick();
    assert.equal(bridge.requests.length, 2);
    assert.equal(bridge.updatedEvents, 1);
    assert.equal(bridge.timers.size, 0);
    await bridge.tick();
    assert.equal(bridge.requests.length, 2);
    bridge.dispose();
  });

  it('stops polling while cached and restores one poller and synchronization on pageshow', async () => {
    const bridge = fixture();
    await bridge.tick();
    assert.equal(bridge.intervals.size, 1);
    bridge.changed();
    assert.equal(bridge.timers.size, 1);
    bridge.dispose();
    assert.equal(bridge.intervals.size, 0);
    assert.equal(bridge.timers.size, 0);
    bridge.changed();
    await bridge.tick();
    assert.equal(bridge.requests.length, 1);
    bridge.resume();
    assert.equal(bridge.intervals.size, 1);
    await bridge.tick();
    assert.equal(bridge.requests.length, 2);
    bridge.resume();
    assert.equal(bridge.intervals.size, 1);
    assert.equal(bridge.timers.size, 0);
    bridge.dispose();
  });

  it('retains a same-head revisit across failed transport and clears it after acknowledgment', async () => {
    const bridge = fixture();
    await bridge.tick();
    bridge.storage.set(keys.history, '["501"]');
    bridge.storage.set(keys.baseline, JSON.stringify({ ...snapshot(['501']), history: ['501'] }));
    bridge.setTransport(async () => { throw new Error('Extension temporarily unavailable'); });
    bridge.visited('501');
    await bridge.tick();
    assert.equal(bridge.requests[1].visitedId, '501');
    bridge.setTransport(async () => ({ ok: true, state: mergeWebSnapshot(normalizeLibrary({ syncId: 'session-1' }),
      'item', { ...snapshot(['501']), history: ['501'] }, null, {}, 100) }));
    bridge.changed();
    await bridge.tick();
    assert.equal(bridge.requests[2].visitedId, '501');
    bridge.changed();
    await bridge.tick();
    assert.equal(bridge.requests[3].visitedId, undefined);
    bridge.dispose();
  });
});
