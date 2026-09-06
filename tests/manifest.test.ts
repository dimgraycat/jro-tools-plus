import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
const built = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));

test('distribution manifest retains the required Side Panel configuration', () => {
    assert.deepEqual(built, source);
    assert.equal(built.manifest_version, 3);
    assert.equal(built.minimum_chrome_version, '116');
    assert.ok(built.permissions.includes('sidePanel'));
    assert.equal(built.side_panel.default_path, 'tools/sidepanel.html');
    assert.equal(built.action.default_popup, undefined);
    assert.equal(built.background.type, 'module');
    for (const path of [built.side_panel.default_path, built.background.service_worker, 'tools/js/zeny-characterpage-scraper.js']) {
        assert.ok(existsSync(join('dist', path)), path);
    }
});

test('permissions stay restricted to the implemented APIs and three trusted sites', () => {
    assert.deepEqual([...built.permissions].sort(), ['scripting', 'sidePanel', 'storage', 'unlimitedStorage']);
    assert.deepEqual([...built.host_permissions].sort(), [
        'https://asgrcat.github.io/*', 'https://rotool.gungho.jp/*', 'https://rowebtool.gungho.jp/*',
    ]);
    assert.equal(built.web_accessible_resources, undefined);
    for (const entry of built.content_scripts) {
        for (const path of [...entry.js ?? [], ...entry.css ?? []]) {
            assert.ok(existsSync(join('dist', path)), path);
        }
    }
});
