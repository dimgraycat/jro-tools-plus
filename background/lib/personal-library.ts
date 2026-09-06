import { LIBRARY_KEY, entryFromUrl, entryKey, normalizeLibrary, recordVisit, setFavorite, officialUrl } from '../../tools/lib/personal-library.js';
import { EntryType } from '../../tools/lib/personal-library.js';
import { WEB_BASE, webType, normalizeSnapshot, mergeWebSnapshot } from '../../tools/lib/web-sync.js';

const nameRequests: Partial<Record<EntryType, Promise<Record<string, string>>>> = {};
function loadNames(type: EntryType): Promise<Record<string, string>> {
    if (!nameRequests[type]) {
        const path = type === 'item' ? 'data/items/name-map.json' : 'data/search/monster-index.json';
        nameRequests[type] = fetch(new URL(path, WEB_BASE), { credentials: 'omit', signal: AbortSignal.timeout(10000) })
            .then(async (response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const value = await response.json();
                const result: Record<string, string> = {};
                if (type === 'item') {
                    for (const [id, name] of Object.entries(value)) if (typeof name === 'string') result[id] = name.slice(0, 200);
                } else {
                    for (const entry of value.monsters ?? []) if (typeof entry.monster_id === 'string' && typeof entry.name === 'string') {
                        result[entry.monster_id] = entry.name.slice(0, 200);
                    }
                }
                return result;
            }).catch(() => ({}));
    }
    return nameRequests[type]!;
}

// Serialize updates from different tabs/panels so one save cannot overwrite another.
let pending: Promise<unknown> = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!message || !['library.get', 'library.visit', 'library.favorite', 'library.web-sync'].includes(message.type)) return;
    const extensionPage = sender.id === chrome.runtime.id
        && sender.url?.startsWith(chrome.runtime.getURL('tools/'));
    const source = sender.url ? entryFromUrl(sender.url) : null;
    const sourceType = sender.url ? webType(sender.url) : null;
    const validWebSync = sender.id === chrome.runtime.id && sourceType && sender.frameId === 0 && message.type === 'library.web-sync';
    if (sender.id !== chrome.runtime.id) return;
    if (!extensionPage && !validWebSync && (message.type !== 'library.visit' || !source || sender.frameId !== 0)) return;

    const operation = pending.then(async () => {
        const stored = await chrome.storage.local.get(LIBRARY_KEY);
        let state = normalizeLibrary(stored[LIBRARY_KEY]);
        const before = JSON.stringify(state);
        // A reinstall/storage reset starts a new synchronization generation. Old
        // Web baselines must be imported, not mistaken for acknowledged deletions.
        if (!state.syncId) state.syncId = crypto.randomUUID();
        if (validWebSync) {
            const current = normalizeSnapshot(message.current, sourceType!);
            const previous = message.syncId === state.syncId && message.previous
                ? normalizeSnapshot(message.previous, sourceType!) : null;
            const names = await loadNames(sourceType!);
            state = mergeWebSnapshot(state, sourceType!, current, previous, names);
            if (typeof message.visitedId === 'string' && current.history.includes(message.visitedId)) {
                const visited = entryFromUrl(`https://rotool.gungho.jp/${sourceType}/${encodeURIComponent(message.visitedId)}/`,
                    names[message.visitedId] || state.history.find((e) => e.type === sourceType && e.id === message.visitedId)?.name || '');
                if (visited) state = recordVisit(state, visited);
            }
            state.favorites = state.favorites.map((e) => e.type === sourceType && names[e.id] ? { ...e, name: names[e.id] } : e);
            state.history = state.history.map((e) => e.type === sourceType && names[e.id] ? { ...e, name: names[e.id] } : e);
        } else if (message.type !== 'library.get') {
            const value = message.entry;
            if (!value || typeof value.id !== 'string' || typeof value.name !== 'string') throw new Error('Invalid entry');
            const entry = entryFromUrl(officialUrl(value), value.name);
            if (!entry || (!extensionPage && entryKey(source!) !== entryKey(entry))) throw new Error('Invalid entry');
            if (message.type === 'library.favorite') {
                if (typeof message.favorite !== 'boolean') throw new Error('Invalid favorite state');
                if (message.setId !== undefined && typeof message.setId !== 'string') throw new Error('Invalid set');
                state = setFavorite(state, entry, message.favorite, Date.now(), message.setId);
            } else {
                state = recordVisit(state, entry);
            }
        }
        if (JSON.stringify(state) !== before) {
            state.revision++;
            await chrome.storage.local.set({ [LIBRARY_KEY]: state });
        }
        return { ok: true, state };
    });
    pending = operation.catch(() => undefined);
    void operation.then(respond, () => respond({ ok: false, error: '保存データを更新できませんでした。もう一度お試しください。' }));
    return true;
});
