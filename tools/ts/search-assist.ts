import { entryFromUrl } from '../lib/personal-library.js';
import { AssistItem, loadAssistItem } from '../lib/search-assist.js';
import { searchUrl } from '../lib/web-sync.js';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    element.textContent = text;
    element.className = className;
    return element;
}

function itemLink(name: string, id: string): HTMLAnchorElement {
    const link = node('a', name);
    link.href = searchUrl({ type: 'item', id });
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = 'JRO Searchで開く';
    return link;
}

function renderItem(item: AssistItem, container: HTMLElement): void {
    const title = node('h3', '', 'assist-item-name');
    title.append(itemLink(item.name, item.id));
    container.append(title);
    if (!item.sets.length) {
        container.append(node('p', 'このアイテムのエンチャント情報はJRO Searchに登録されていません。'));
    }
    for (const set of item.sets) {
        const details = node('details', '', 'assist-set');
        const summary = node('summary', set.name);
        details.append(summary);
        const content = node('div', '', 'assist-set-content');
        for (const condition of set.conditions) content.append(node('p', condition, 'assist-condition'));
        for (const slot of set.slots) {
            const section = node('section', '', 'assist-slot');
            section.append(node('h4', slot.name));
            for (const condition of slot.conditions) section.append(node('p', condition, 'assist-condition'));
            const candidates = node('div', '', 'assist-candidates');
            for (const candidate of slot.candidates) {
                candidates.append(candidate.id ? itemLink(candidate.name, candidate.id) : node('span', candidate.name));
            }
            section.append(candidates);
            content.append(section);
        }
        details.append(content);
        container.append(details);
    }
}

function initialize(): void {
    const container = document.getElementById('search-assist-content');
    const retry = document.getElementById('search-assist-retry') as HTMLButtonElement | null;
    if (!container || !retry) return;
    let revision = 0;
    let controller: AbortController | undefined;
    const refresh = async () => {
        const token = ++revision;
        controller?.abort();
        // No data fetching while a different feature is selected.
        if (location.hash !== '#search-assist') return;
        container.replaceChildren();
        retry.hidden = true;
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (token !== revision) return;
            const entry = tab?.url ? entryFromUrl(tab.url, tab.title) : null;
            if (entry?.type !== 'item') {
                container.append(node('p', '公式のアイテム詳細ページを開くと、エンチャント情報を表示します。'));
                return;
            }
            container.append(node('p', `${entry.name}のエンチャント情報を取得中…`));
            controller = new AbortController();
            const requestController = controller;
            const timeout = setTimeout(() => requestController.abort(), 10000);
            let item: AssistItem | null;
            try { item = await loadAssistItem(entry.id, requestController.signal); }
            finally { clearTimeout(timeout); }
            if (token !== revision) return;
            container.replaceChildren();
            if (item) renderItem(item, container);
            else container.append(node('p', 'このアイテムはJRO Searchにまだ登録されていません。'));
        } catch {
            if (token !== revision) return;
            container.replaceChildren(node('p', 'エンチャント情報を取得できませんでした。通信状態を確認して再試行してください。'));
            retry.hidden = false;
        }
    };
    retry.addEventListener('click', () => { void refresh(); });
    window.addEventListener('hashchange', () => { void refresh(); });
    chrome.tabs.onActivated.addListener(() => { void refresh(); });
    chrome.tabs.onUpdated.addListener((_id, info, tab) => {
        if (tab.active && (info.url || info.status === 'complete')) void refresh();
    });
    chrome.tabs.onRemoved.addListener(() => { void refresh(); });
    window.addEventListener('pagehide', () => { ++revision; controller?.abort(); });
    void refresh();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
else initialize();
