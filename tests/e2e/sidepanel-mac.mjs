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
        // Destination tabs are placeholders: verify actual link navigation without loading external sites.
        if (['https://asgrcat.github.io', 'https://rotool.gungho.jp'].includes(url.origin)) {
            return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Destination</title>' });
        }
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
        assert.equal(await page.locator(`#${name}-list .library-content > :not(a.library-name)`).count(), 0,
            `${name} cards must not render a type, set name, or date row`);
        assert.equal(await page.locator(`#${name}-list .library-name`).count(), expected);
        const links = await page.locator(`#${name}-list .library-card`).evaluateAll((cards) => cards.map((card) => ({
            original: card.querySelector('.library-name').href,
            destinations: [...card.querySelectorAll('.library-open')].map((link) => ({
                kind: link.dataset.destination, href: link.href, target: link.target, rel: link.rel,
                label: link.getAttribute('aria-label'), tooltip: link.dataset.tooltip,
            })),
        })));
        for (const card of links) {
            const original = new URL(card.original);
            const [, type, id] = original.pathname.split('/');
            const expectedSearch = `https://asgrcat.github.io/jro-search/${type === 'item' ? 'items' : 'monsters'}/?id=${encodeURIComponent(id)}`;
            assert.deepEqual(card.destinations.map((link) => [link.kind, link.href]), [['search', expectedSearch]]);
            assert.ok(card.destinations.every((link) => link.target === '_blank' && link.rel.includes('noopener')
                && link.rel.includes('noreferrer') && link.tooltip === 'JRO Searchで開く' && link.label.includes(link.tooltip)));
        }
        const buttons = await page.locator(`#${name}-list .library-favorite`).evaluateAll((nodes) => nodes.map((node) => {
            const style = getComputedStyle(node);
            return { fontSize: style.fontSize, width: style.width, height: style.height,
                align: style.alignItems, justify: style.justifyItems,
                tooltip: node.dataset.tooltip, pressed: node.getAttribute('aria-pressed') };
        }));
        assert.ok(buttons.every((button) => button.fontSize === '24px' && button.width === '36px'
            && button.height === '36px' && button.align === 'center' && button.justify === 'center'),
        `${name} favorite icons must be enlarged and centered in the existing button`);
        assert.ok(buttons.every((button) => button.tooltip.startsWith(button.pressed === 'true'
            ? 'お気に入りから削除' : 'お気に入りに追加')), 'favorite tooltips must describe the current action');
    };
    const filter = async (name, type, expected) => {
        await page.locator(`[data-library="${name}"][data-filter="${type}"]`).click();
        await count(name, expected);
    };
    const checkDestinationTabs = async (name) => {
        const before = await page.evaluate(() => window.__getLibrary());
        for (const kind of ['search']) {
            const link = page.locator(`#${name}-list [data-destination="${kind}"]`).first();
            const expected = await link.getAttribute('href');
            const opened = page.waitForEvent('popup');
            await link.click();
            const popup = await opened;
            try {
                await popup.waitForURL(expected, { waitUntil: 'domcontentloaded', timeout: 10000 });
                assert.equal(popup.url(), expected);
            } finally { await popup.close(); }
        }
        assert.deepEqual(await page.evaluate(() => window.__getLibrary()), before, 'opening a destination must not toggle a favorite');
    };
    await tab('money');
    assert.equal(await page.locator('#zeny-crawl-button').isDisabled(), true);
    await tab('favorites');
    assert.equal(await page.locator('[data-destination="official"]').count(), 0);
    for (const selector of ['#favorites-list .library-open', '#favorites-list .library-favorite']) {
        const control = page.locator(selector).first();
        await control.hover();
        assert.equal(await control.evaluate((node) => getComputedStyle(node, '::after').visibility), 'visible');
        assert.equal(await control.evaluate((node) => getComputedStyle(node, '::after').content),
            JSON.stringify(await control.getAttribute('data-tooltip')));
        await page.screenshot({ path: resolve(screenshotDir, selector.includes('library-open') ? 'search-tooltip.png' : 'favorite-tooltip.png') });
        await page.mouse.move(0, 0);
        await page.keyboard.press('Tab');
        await control.focus();
        assert.equal(await control.evaluate((node) => getComputedStyle(node, '::after').visibility), 'visible');
        await control.evaluate((node) => node.blur());
    }
    assert.equal(await page.locator('[data-library][data-filter="all"]').count(), 0);
    assert.equal(await page.locator('[data-library="favorites"]').count(), 2);
    assert.equal(await page.locator('[data-library="history"]').count(), 2);
    await count('favorites', 1);
    assert.equal(await page.locator('[data-library="favorites"][data-filter="item"]').getAttribute('aria-pressed'), 'true');
    await filter('favorites', 'item', 1);
    await checkDestinationTabs('favorites');
    await filter('favorites', 'monster', 1);
    await checkDestinationTabs('favorites');
    await page.selectOption('#favorites-set', 'monster:default');
    await count('favorites', 1);
    assert.equal(await page.locator('#favorites-list .library-name').textContent(), 'ポリン');
    await filter('favorites', 'item', 1);
    await page.selectOption('#favorites-set', 'item:wanted');
    await count('favorites', 1);
    await page.locator('#favorites-list button').click();
    await count('favorites', 0);
    assert.equal(await page.locator('#favorites-empty').isVisible(), true);
    let action = await page.evaluate(() => window.__libraryActions.at(-1));
    assert.equal(action.setId, 'wanted');
    assert.equal(action.favorite, false);
    await page.selectOption('#favorites-set', '');
    await count('favorites', 1); // Membership remains in the item default set.
    await page.locator('[data-current-entry] select').selectOption('wanted');
    await page.locator('[data-current-entry] button').click();
    await count('favorites', 2);
    action = await page.evaluate(() => window.__libraryActions.at(-1));
    assert.equal(action.setId, 'wanted');
    assert.equal(action.entry.id, '502');
    assert.equal(action.favorite, true);
    await page.locator('#favorites-query').fill('青');
    await count('favorites', 1);
    await page.screenshot({ path: resolve(screenshotDir, 'favorites.png'), fullPage: true });
    await page.locator('#favorites-query').fill('');
    await tab('history');
    await count('history', 2);
    assert.equal(await page.locator('[data-library="history"][data-filter="item"]').getAttribute('aria-pressed'), 'true');
    await filter('history', 'item', 2);
    await checkDestinationTabs('history');
    await filter('history', 'monster', 1);
    await checkDestinationTabs('history');
    await page.locator('#history-query').fill('ポリン');
    await count('history', 1);
    await page.locator('#history-query').fill('');
    await filter('history', 'item', 2);
    await page.locator('#history-list button').first().click();
    action = await page.evaluate(() => window.__libraryActions.at(-1));
    assert.equal(action.favorite, false);
    await page.screenshot({ path: resolve(screenshotDir, 'history.png'), fullPage: true });
    await tab('updates');
    assert.match(await page.locator('#extension-version').textContent(), new RegExp(manifest.version.replaceAll('.', '\\.')));
    assert.ok(await page.locator('.extension-update').count() > 0);
    const displayedVersions = await page.locator('.extension-update h3').allTextContents();
    assert.ok(!displayedVersions.includes('1.3.4') && !displayedVersions.includes('1.3.3'),
        'legacy release history must not appear in the Side Panel');
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
        checks: ['four tabs', 'both type filters', 'name-only card content', 'search link and new tab', 'hover/keyboard action tooltips', 'set namespaces', 'favorite actions', 'name search', 'storage event', 'static updates', 'single-row tabs at 320/360/418px', 'page errors'] }));
} catch (error) {
    await page.screenshot({ path: resolve(screenshotDir, 'failure.png'), fullPage: true }).catch(() => {});
    console.error(`Failure screenshot: ${screenshotDir}/failure.png`);
    throw error;
} finally {
    await context.close();
    await browser.close();
}
