import {
    EntryType, LibraryEntry, PersonalLibrary, LIBRARY_KEY, entryFromUrl, entryKey,
    normalizeLibrary, officialUrl,
} from '../lib/personal-library.js';
import { LibraryViewFilter, parseVersionHistory, selectLibraryEntries } from '../lib/library-view.js';

type LibraryTab = 'favorites' | 'history';
const filters: Record<LibraryTab, LibraryViewFilter & { type: EntryType }> = {
    favorites: { type: 'item', query: '', setId: '' },
    history: { type: 'item', query: '', setId: '' },
};
let state: PersonalLibrary = normalizeLibrary(null);
let currentEntry: LibraryEntry | null = null;
let activeRequest = 0;
let saving = false;
let currentSetId = '';
const typeName = (type: EntryType) => type === 'item' ? 'アイテム' : 'モンスター';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
}

function showError(message = ''): void {
    const node = document.getElementById('library-error')!;
    node.textContent = message;
    node.hidden = !message;
}

async function request(message: object): Promise<PersonalLibrary> {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || '保存データを読み込めませんでした。');
    return normalizeLibrary(response.state);
}

function acceptResponse(next: PersonalLibrary): void {
    // A storage event from another tab can arrive before an older request response.
    if (next.revision >= state.revision) state = next;
}

function selectedFavorite(entry: LibraryEntry, setId = ''): boolean {
    return state.favorites.some((favorite) => entryKey(favorite) === entryKey(entry)
        && (!setId || favorite.setIds?.includes(setId)));
}

async function toggleFavorite(entry: LibraryEntry, setId = ''): Promise<void> {
    if (saving) return;
    const favorite = !selectedFavorite(entry, setId);
    saving = true;
    showError();
    render();
    try {
        acceptResponse(await request({ type: 'library.favorite', entry, favorite, ...(setId ? { setId } : {}) }));
    } catch (error) {
        showError(error instanceof Error ? error.message : 'お気に入りを保存できませんでした。');
    } finally {
        saving = false;
        render();
    }
}

function renderCard(entry: LibraryEntry, tab: LibraryTab | 'current', setId = ''): HTMLElement {
    const card = element(tab === 'current' ? 'div' : 'li', 'library-card');
    const content = element('div', 'library-content');
    const link = element('a', 'library-name', entry.name);
    link.href = officialUrl(entry);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    content.append(link);
    const details = [typeName(entry.type)];
    if (tab === 'history' && entry.viewedAt > 0) {
        details.push(new Date(entry.viewedAt).toLocaleString('ja-JP', {
            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
        }));
    }
    if (tab === 'favorites') {
        const names = (state.sets ?? []).filter((set) => set.type === entry.type && entry.setIds?.includes(set.id))
            .map((set) => set.name);
        if (names.length) details.push(names.join('・'));
    }
    content.append(element('p', 'library-meta', details.join(' · ')));
    const favorite = selectedFavorite(entry, setId);
    const button = element('button', 'library-favorite', favorite ? '♥' : '♡');
    button.type = 'button';
    button.disabled = saving;
    button.setAttribute('aria-pressed', String(favorite));
    const destination = setId ? (state.sets ?? []).find((set) => set.id === setId && set.type === entry.type)?.name : '';
    const action = favorite ? (destination ? `${destination}から解除` : 'すべてのお気に入りセットから解除')
        : (destination ? `${destination}に追加` : 'お気に入りに追加');
    button.setAttribute('aria-label', `${entry.name}を${action}`);
    button.title = action;
    button.addEventListener('click', () => { void toggleFavorite(entry, setId); });
    card.append(content, button);
    return card;
}

function renderSetFilter(): void {
    const select = document.getElementById('favorites-set') as HTMLSelectElement;
    const matching = (state.sets ?? []).filter((set) => set.type === filters.favorites.type);
    if (!matching.some((set) => `${set.type}:${set.id}` === select.value)) {
        filters.favorites.setId = '';
        filters.favorites.setType = undefined;
    }
    const selected = select.value;
    const all = element('option', '', 'すべてのセット');
    all.value = '';
    select.replaceChildren(all);
    for (const set of matching) {
        const option = element('option', '', `${typeName(set.type)} · ${set.name}`);
        option.value = `${set.type}:${set.id}`;
        select.append(option);
    }
    select.value = matching.some((set) => `${set.type}:${set.id}` === selected) ? selected : '';
}

function renderCurrentEntry(): void {
    const container = document.querySelector<HTMLElement>('[data-current-entry]')!;
    container.replaceChildren();
    if (!currentEntry) {
        container.append(element('p', '', '公式のアイテム・モンスター詳細ページを開くと、ここからお気に入りに追加できます。'));
        return;
    }
    container.append(element('p', '', '現在開いているページ'));
    const sets = (state.sets ?? []).filter((set) => set.type === currentEntry!.type);
    if (!sets.some((set) => set.id === currentSetId)) currentSetId = sets[0]?.id ?? '';
    if (sets.length) {
        const label = element('label', 'library-set-label', '追加先セット');
        const select = element('select', 'library-query');
        select.setAttribute('aria-label', '現在のページの追加先セット');
        for (const set of sets) {
            const option = element('option', '', set.name);
            option.value = set.id;
            select.append(option);
        }
        select.value = currentSetId;
        select.addEventListener('change', () => { currentSetId = select.value; renderCurrentEntry(); });
        label.append(select);
        container.append(label);
    }
    container.append(renderCard(currentEntry, 'current', currentSetId));
}

function render(): void {
    renderSetFilter();
    for (const tab of ['favorites', 'history'] as const) {
        const entries = selectLibraryEntries(state[tab], filters[tab]);
        document.getElementById(`${tab}-list`)!.replaceChildren(...entries.map((entry) => renderCard(entry, tab, filters[tab].setId)));
        document.getElementById(`${tab}-count`)!.textContent = `${entries.length}件`;
        const empty = document.getElementById(`${tab}-empty`)!;
        empty.hidden = entries.length > 0;
        empty.textContent = state[tab].length ? '条件に一致するデータがありません。'
            : tab === 'favorites' ? 'お気に入りはまだありません。公式ページで追加するか、JRO Searchを開いて共有データを読み込んでください。'
                : '閲覧履歴はまだありません。公式のアイテム・モンスター詳細ページを開くと記録されます。';
    }
    renderCurrentEntry();
}

async function refreshCurrentEntry(): Promise<void> {
    const token = ++activeRequest;
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        let entry = tab?.url ? entryFromUrl(tab.url, tab.title) : null;
        if (entry && tab.id !== undefined) {
            try {
                const detected = await chrome.tabs.sendMessage(tab.id, { type: 'library.current' });
                if (detected && entryKey(detected) === entryKey(entry)) {
                    entry = entryFromUrl(tab.url!, typeof detected.name === 'string' ? detected.name : tab.title);
                }
            } catch { /* Tabs opened before extension reload use the validated URL and title. */ }
        }
        if (token !== activeRequest) return;
        currentEntry = entry;
        renderCurrentEntry();
    } catch {
        if (token === activeRequest) { currentEntry = null; renderCurrentEntry(); }
    }
}

async function renderUpdates(): Promise<void> {
    document.getElementById('extension-version')!.textContent = `インストール済みバージョン ${chrome.runtime.getManifest().version}`;
    const container = document.getElementById('extension-updates')!;
    try {
        const response = await fetch(chrome.runtime.getURL('data/version-history.json'));
        if (!response.ok) throw new Error('更新履歴を読み込めませんでした。');
        const entries = parseVersionHistory(await response.json());
        container.replaceChildren(...entries.map((entry) => {
            const section = element('section', 'extension-update');
            const date = element('time', '', entry.date);
            date.dateTime = entry.date;
            const changes = element('ul');
            changes.append(...entry.changes.map((change) => element('li', '', change)));
            section.append(element('h3', '', entry.version), date, changes);
            return section;
        }));
    } catch (error) {
        container.textContent = error instanceof Error ? error.message : '更新履歴を読み込めませんでした。';
        container.setAttribute('role', 'alert');
    }
}

async function initialize(): Promise<void> {
    if (!document.getElementById('favorites-list')) return;
    document.querySelectorAll<HTMLButtonElement>('[data-library][data-filter]').forEach((button) => {
        button.addEventListener('click', () => {
            const tab = button.dataset.library as LibraryTab;
            filters[tab].type = button.dataset.filter as EntryType;
            document.querySelectorAll<HTMLButtonElement>(`[data-library="${tab}"]`).forEach((candidate) => {
                candidate.setAttribute('aria-pressed', String(candidate === button));
            });
            render();
        });
    });
    for (const tab of ['favorites', 'history'] as const) {
        const input = document.getElementById(`${tab}-query`) as HTMLInputElement;
        input.addEventListener('input', () => { filters[tab].query = input.value; render(); });
    }
    const setFilter = document.getElementById('favorites-set') as HTMLSelectElement;
    setFilter.addEventListener('change', () => {
        filters.favorites.setId = setFilter.value.slice(setFilter.value.indexOf(':') + 1);
        filters.favorites.setType = setFilter.value ? setFilter.value.split(':')[0] as EntryType : undefined;
        render();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[LIBRARY_KEY]) {
            state = normalizeLibrary(changes[LIBRARY_KEY].newValue);
            render();
        }
    });
    chrome.tabs.onActivated.addListener(() => { void refreshCurrentEntry(); });
    chrome.tabs.onUpdated.addListener((_id, info, tab) => {
        if (tab.active && (info.url || info.status === 'complete')) void refreshCurrentEntry();
    });
    render();
    void refreshCurrentEntry();
    void renderUpdates();
    try { acceptResponse(await request({ type: 'library.get' })); render(); }
    catch (error) { showError(error instanceof Error ? error.message : '保存データを読み込めませんでした。'); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void initialize(); });
else void initialize();
