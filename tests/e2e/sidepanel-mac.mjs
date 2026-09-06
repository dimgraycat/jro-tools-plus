// Focused UI check with mocked Chrome extension APIs, NOT an installed-extension integration test.
// Run after npm run build:
//   node tests/e2e/sidepanel-mac.mjs
// Set JRO_PLAYWRIGHT_MODULE to an existing playwright module path when it is not installed in an ancestor.
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const { chromium } = await import(process.env.JRO_PLAYWRIGHT_MODULE || 'playwright');
const endpoint = process.env.PLAYWRIGHT_CDP_ENDPOINT || 'http://127.0.0.1:9222';
const metadata = await (await fetch(`${endpoint.replace(/\/$/, '')}/json/version`, { signal: AbortSignal.timeout(5000) })).json();
assert.match(metadata['User-Agent'], /Macintosh/);
assert.match(metadata['User-Agent'], /HeadlessChrome/);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = resolve(root, 'dist');
const manifest = JSON.parse(await readFile(resolve(dist, 'manifest.json'), 'utf8'));
const screenshotDir = await mkdtemp(resolve(tmpdir(), 'jro-tools-plus-panel-'));
const origin = 'https://jro.home.asagiri.world';
const browser = await chromium.connectOverCDP(endpoint);
const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 360, height: 850 } });
const page = await context.newPage();
page.setDefaultTimeout(5000);
const pageErrors = [];
const failedRequests = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`));

try {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
        '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.png': 'image/png' };
    await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        const file = resolve(dist, `.${decodeURIComponent(url.pathname)}`);
        if (!file.startsWith(`${dist}${sep}`)) return route.fulfill({ status: 403 });
        try { await route.fulfill({ status: 200, contentType: types[extname(file)] || 'application/octet-stream', body: await readFile(file) }); }
        catch { await route.fulfill({ status: 404, body: 'Not found' }); }
    });
    await context.addInitScript(({ origin, version }) => {
        const key = 'jro-tools-plus.personalLibrary';
        const item = { type: 'item', id: '501', name: '赤ポーション', viewedAt: 1788652800000, addedAt: 1, setIds: ['default', 'wanted'] };
        const monster = { type: 'monster', id: '1002', name: 'ポリン', viewedAt: 1788652860000, addedAt: 2, setIds: ['default'] };
        const other = { type: 'item', id: '502', name: '青ポーション', viewedAt: 1788652920000 };
        let state = { version: 1, revision: 1, sets: [
            { type: 'item', id: 'default', name: 'お気に入り' }, { type: 'monster', id: 'default', name: 'お気に入り' },
            { type: 'item', id: 'wanted', name: '欲しい装備' },
        ], favorites: [item, monster], history: [other, monster, item] };
        const listeners = [];
        const event = () => ({ addListener() {} });
        const clone = (value) => structuredClone(value);
        window.__libraryActions = [];
        window.__publishLibrary = (next) => {
            state = clone(next);
            listeners.forEach((listener) => listener({ [key]: { newValue: clone(state) } }, 'local'));
        };
        window.__getLibrary = () => clone(state);
        const api = {
            runtime: {
                id: 'mock-extension', getManifest: () => ({ version }), getURL: (path) => `${origin}/${path}`,
                sendMessage: async (message) => {
                    if (message.type === 'library.favorite') {
                        window.__libraryActions.push(clone(message));
                        const match = (entry) => entry.type === message.entry.type && entry.id === message.entry.id;
                        const previous = state.favorites.find(match);
                        const memberships = previous?.setIds || [];
                        const setIds = message.favorite ? [...new Set([...memberships, message.setId || 'default'])]
                            : message.setId ? memberships.filter((id) => id !== message.setId) : [];
                        state = { ...state, revision: state.revision + 1, favorites: state.favorites.filter((entry) => !match(entry)) };
                        if (setIds.length) state.favorites.push({ ...message.entry, setIds, addedAt: previous?.addedAt || Date.now() });
                        window.__publishLibrary(state);
                    }
                    return { ok: true, state: clone(state) };
                },
            },
            tabs: {
                query: async () => [{ id: 1, active: true, url: 'https://rotool.gungho.jp/item/502/', title: '青ポーション' }],
                sendMessage: async () => clone(other), onActivated: event(), onUpdated: event(), onRemoved: event(),
            },
            windows: { onFocusChanged: event(), WINDOW_ID_NONE: -1 },
            storage: {
                onChanged: { addListener: (listener) => listeners.push(listener) },
                local: {
                    get: (_keys, callback) => { const value = { [key]: clone(state) }; callback?.(value); return Promise.resolve(value); },
                    set: (_value, callback) => { callback?.(); return Promise.resolve(); },
                },
            },
        };
        Object.defineProperty(window, 'chrome', { value: api, configurable: true });
    }, { origin, version: manifest.version });
    await page.goto(`${origin}/tools/sidepanel.html`, { waitUntil: 'networkidle' });
    const tab = async (name) => {
        await page.locator(`nav a[href="#${name}"]`).click();
        await page.waitForFunction((id) => !document.getElementById(id).classList.contains('hidden'), name);
        const visible = await page.locator('main:visible').evaluateAll((nodes) => nodes.map((node) => node.id));
        assert.deepEqual(visible, [name]);
    };
    const count = async (name, expected) => {
        await page.waitForFunction(({ name, expected }) => document.getElementById(`${name}-count`).textContent === `${expected}件`, { name, expected });
        assert.equal(await page.locator(`#${name}-list > li`).count(), expected);
    };
    const filter = async (name, type, expected) => {
        await page.locator(`[data-library="${name}"][data-filter="${type}"]`).click();
        await count(name, expected);
    };
    await tab('money');
    assert.equal(await page.locator('#zeny-crawl-button').isDisabled(), true);
    await tab('favorites');
    await count('favorites', 2);
    await filter('favorites', 'item', 1);
    await filter('favorites', 'monster', 1);
    await filter('favorites', 'all', 2);
    await page.selectOption('#favorites-set', 'monster:default');
    await count('favorites', 1);
    assert.equal(await page.locator('#favorites-list .library-name').textContent(), 'ポリン');
    await page.selectOption('#favorites-set', 'item:wanted');
    await count('favorites', 1);
    await page.locator('#favorites-list button').click();
    await count('favorites', 0);
    assert.equal(await page.locator('#favorites-empty').isVisible(), true);
    let action = await page.evaluate(() => window.__libraryActions.at(-1));
    assert.equal(action.setId, 'wanted');
    assert.equal(action.favorite, false);
    await page.selectOption('#favorites-set', '');
    await count('favorites', 2); // Membership remains in the default set.
    await page.locator('[data-current-entry] select').selectOption('wanted');
    await page.locator('[data-current-entry] button').click();
    await count('favorites', 3);
    action = await page.evaluate(() => window.__libraryActions.at(-1));
    assert.equal(action.setId, 'wanted');
    assert.equal(action.entry.id, '502');
    assert.equal(action.favorite, true);
    await page.locator('#favorites-query').fill('青');
    await count('favorites', 1);
    await page.screenshot({ path: resolve(screenshotDir, 'favorites.png'), fullPage: true });
    await page.locator('#favorites-query').fill('');
    await tab('history');
    await count('history', 3);
    await filter('history', 'item', 2);
    await filter('history', 'monster', 1);
    await filter('history', 'all', 3);
    await page.locator('#history-query').fill('ポリン');
    await count('history', 1);
    await page.locator('#history-query').fill('');
    await page.locator('#history-list button').first().click();
    action = await page.evaluate(() => window.__libraryActions.at(-1));
    assert.equal(action.favorite, false);
    await page.screenshot({ path: resolve(screenshotDir, 'history.png'), fullPage: true });
    await tab('updates');
    assert.match(await page.locator('#extension-version').textContent(), new RegExp(manifest.version.replaceAll('.', '\\.')));
    assert.ok(await page.locator('.extension-update').count() > 0);
    await page.screenshot({ path: resolve(screenshotDir, 'updates.png'), fullPage: true });
    for (const width of [320, 360, 418]) {
        await page.setViewportSize({ width, height: 850 });
        for (const name of ['money', 'favorites', 'history', 'updates']) {
            await tab(name);
            const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }));
            assert.ok(dimensions.scroll <= dimensions.width, `${name} overflows at ${width}px: ${JSON.stringify(dimensions)}`);
            const tabs = await page.locator('.panel-tabs a').evaluateAll((links) => links.map((link) => {
                const rect = link.getBoundingClientRect();
                return { top: rect.top, left: rect.left, right: rect.right,
                    contentsFit: [...link.children].every((child) => {
                        const bounds = child.getBoundingClientRect();
                        return bounds.left >= rect.left && bounds.right <= rect.right;
                    }) };
            }));
            assert.equal(tabs.length, 4);
            assert.equal(new Set(tabs.map((entry) => entry.top)).size, 1, `tabs wrap at ${width}px`);
            assert.ok(tabs.every((entry) => entry.contentsFit && entry.left >= 0 && entry.right <= width), `tab text overflows at ${width}px`);
        }
        await page.locator('header').screenshot({ path: resolve(screenshotDir, `tabs-${width}.png`) });
    }
    await tab('favorites');
    await page.evaluate(() => {
        const next = window.__getLibrary();
        next.revision++;
        next.favorites = [];
        window.__publishLibrary(next);
    });
    await count('favorites', 0);
    assert.equal(await page.locator('#library-error').isVisible(), false);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(failedRequests, []);
    console.log(JSON.stringify({ result: 'passed', mode: 'Mac Chrome Headless / mocked extension APIs', screenshots: screenshotDir,
        checks: ['four tabs', 'both type filters', 'set namespaces', 'favorite actions', 'name search', 'storage event', 'static updates', 'single-row tabs at 320/360/418px', 'page errors'] }));
} catch (error) {
    await page.screenshot({ path: resolve(screenshotDir, 'failure.png'), fullPage: true }).catch(() => {});
    console.error(`Failure screenshot: ${screenshotDir}/failure.png`);
    throw error;
} finally {
    await context.close();
    await browser.close();
}
