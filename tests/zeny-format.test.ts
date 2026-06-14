import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type CharacterDetail,
  formatActualZeny,
  formatCharacterDetailsToHtml,
  formatShortZeny,
  formatZenyForDisplay,
  groupCharacterDetailsByWorld,
  isZenyDisplayPreference,
  parseZenyAmount,
} from '../tools/ts/jro-tools-settings.js';

describe('Zeny display preference', () => {
  it('accepts only the supported display modes', () => {
    assert.equal(isZenyDisplayPreference('full'), true);
    assert.equal(isZenyDisplayPreference('short'), true);
    assert.equal(isZenyDisplayPreference('compact'), false);
    assert.equal(isZenyDisplayPreference(undefined), false);
  });
});

describe('Zeny parsing and formatting', () => {
  it('parses stored Zeny strings without changing existing fallback behavior', () => {
    assert.equal(parseZenyAmount('1,234,567 Zeny'), 1234567);
    assert.equal(parseZenyAmount('900 Zeny'), 900);
    assert.equal(parseZenyAmount('取得失敗'), null);
    assert.equal(parseZenyAmount(undefined), 0);
  });

  it('formats full and short Zeny labels', () => {
    assert.equal(formatActualZeny(1234567), '1,234,567 Zeny');
    assert.equal(formatShortZeny(999), '999 Zeny');
    assert.equal(formatShortZeny(1000), '1K Zeny');
    assert.equal(formatShortZeny(1000000), '1M Zeny');
    assert.equal(formatShortZeny(1000000000), '1G Zeny');
  });

  it('renders short display as focusable values with the actual amount stored', () => {
    assert.equal(formatZenyForDisplay(1234567, 'full'), '1,234,567 Zeny');
    assert.equal(
      formatZenyForDisplay(1234567, 'short'),
      '<span class="zeny-value" tabindex="0" data-actual-zeny="1234567">1M Zeny</span>',
    );
  });
});

describe('Zeny world summaries', () => {
  const details: CharacterDetail[] = [
    { value: 'world-a', text: 'World A', href: 'https://example.test/a', characterName: 'Alpha', zeny: '1,000 Zeny' },
    { value: 'world-a', text: 'World A', href: 'https://example.test/b', characterName: 'Beta', zeny: '2,500 Zeny' },
    { value: 'world-b', text: 'World B', href: 'https://example.test/c', characterName: 'Gamma', zeny: '取得失敗' },
  ];

  it('groups characters by world and sums only parseable Zeny values', () => {
    const grouped = groupCharacterDetailsByWorld(details);

    assert.equal(grouped['world-a'].worldText, 'World A');
    assert.equal(grouped['world-a'].characters.length, 2);
    assert.equal(grouped['world-a'].totalZeny, 3500);
    assert.equal(grouped['world-b'].characters.length, 1);
    assert.equal(grouped['world-b'].totalZeny, 0);
  });

  it('renders stored crawl results in full display mode', () => {
    const html = formatCharacterDetailsToHtml(details, 'full');

    assert.match(html, /World A \(合計: 3,500 Zeny\)/);
    assert.match(html, /Alpha \(1,000 Zeny\)/);
    assert.match(html, /Beta \(2,500 Zeny\)/);
    assert.match(html, /Gamma \(取得失敗\)/);
  });

  it('renders stored crawl results in short display mode', () => {
    const html = formatCharacterDetailsToHtml(details, 'short');

    assert.match(html, /data-actual-zeny="3500">3K Zeny/);
    assert.match(html, /data-actual-zeny="1000">1K Zeny/);
    assert.match(html, /data-actual-zeny="2500">2K Zeny/);
    assert.match(html, /Gamma \(取得失敗\)/);
  });

  it('escapes scraped text before injecting it into result HTML', () => {
    const html = formatCharacterDetailsToHtml([
      {
        value: 'world-x',
        text: '<World>',
        href: 'https://example.test/x',
        characterName: '<script>alert(1)</script>',
        zeny: '<bad>',
      },
    ], 'full');

    assert.match(html, /&lt;World&gt;/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;bad&gt;/);
  });
});
