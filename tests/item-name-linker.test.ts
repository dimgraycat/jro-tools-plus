import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildItemNameEntries,
  findItemNameMatches,
  getItemNameLinkTargetSelector,
  isItemNameLinkerEnabled,
} from '../content_scripts/lib/item-name-linker.js';

describe('Item name linker settings', () => {
  it('defaults to enabled unless explicitly disabled', () => {
    assert.equal(isItemNameLinkerEnabled(undefined), true);
    assert.equal(isItemNameLinkerEnabled(true), true);
    assert.equal(isItemNameLinkerEnabled(false), false);
  });
});

describe('Item name linker entries', () => {
  it('builds rotool item links from a name map', () => {
    const entries = buildItemNameEntries({
      '1001': 'エルニウム',
      '1002': 'オリデオコン',
    });

    assert.deepEqual(entries, [
      {
        itemId: '1002',
        name: 'オリデオコン',
        url: 'https://rotool.gungho.jp/item/1002/',
      },
      {
        itemId: '1001',
        name: 'エルニウム',
        url: 'https://rotool.gungho.jp/item/1001/',
      },
    ]);
  });

  it('ignores duplicate names, non-numeric IDs, and one-character names', () => {
    const entries = buildItemNameEntries({
      '1001': '花',
      '1002': 'エルニウム',
      '1003': 'エルニウム',
      abc: 'オリデオコン',
    });

    assert.deepEqual(entries, [
      {
        itemId: '1002',
        name: 'エルニウム',
        url: 'https://rotool.gungho.jp/item/1002/',
      },
    ]);
  });
});

describe('Item name linker matching', () => {
  it('matches item names with longer names taking priority', () => {
    const entries = buildItemNameEntries({
      '2001': 'エルニウム',
      '2002': '濃縮エルニウム',
      '2003': 'オリデオコン',
    });

    assert.deepEqual(findItemNameMatches('濃縮エルニウムとオリデオコンを入手', entries), [
      {
        itemId: '2002',
        name: '濃縮エルニウム',
        url: 'https://rotool.gungho.jp/item/2002/',
        start: 0,
        end: 7,
      },
      {
        itemId: '2003',
        name: 'オリデオコン',
        url: 'https://rotool.gungho.jp/item/2003/',
        start: 8,
        end: 14,
      },
    ]);
  });
});

describe('Item name linker target', () => {
  it('targets RagCan lineup lists without depending on the page URL', () => {
    assert.equal(
      getItemNameLinkTargetSelector(),
      '#block-gungho-content > article > div.article__content > div.lineup-list',
    );
  });
});
