import { EntryType, LibraryEntry, PersonalLibrary, entryFromUrl, normalizeLibrary, setFavorite } from './personal-library.js';

export interface WebSet { id: string; name: string; ids: string[]; }
export interface WebSnapshot { sets: WebSet[]; history: string[]; activeSetId: string; }
export const WEB_BASE = 'https://asgrcat.github.io/jro-search/';

export function webType(url: string): EntryType | null {
    try {
        const parsed = new URL(url);
        if (parsed.origin !== 'https://asgrcat.github.io') return null;
        if (parsed.pathname === '/jro-search/items/' || parsed.pathname === '/jro-search/items/index.html') return 'item';
        if (parsed.pathname === '/jro-search/monsters/' || parsed.pathname === '/jro-search/monsters/index.html') return 'monster';
    } catch {}
    return null;
}

export function webKeys(type: EntryType) {
    const prefix = `jro-search.${type === 'item' ? 'items' : 'monsters'}`;
    return {
        sets: `${prefix}.favoriteSets`,
        legacy: `${prefix}.${type === 'item' ? 'favoriteItems' : 'favorites'}`,
        history: `${prefix}.${type === 'item' ? 'recentItems' : 'history'}`,
        baseline: `${prefix}.toolsPlusSyncBaseline`,
        instance: `${prefix}.toolsPlusSyncInstance`,
    };
}

export function normalizeSnapshot(value: unknown, type: EntryType): WebSnapshot {
    const raw = value as Partial<WebSnapshot> | null;
    const ids = (values: unknown): string[] => Array.isArray(values)
        ? [...new Set(values.filter((id): id is string => typeof id === 'string'
            && !!entryFromUrl(`https://rotool.gungho.jp/${type}/${encodeURIComponent(id)}/`)))].slice(0, 20000) : [];
    const sets: WebSet[] = [];
    for (const set of Array.isArray(raw?.sets) ? raw!.sets : []) {
        if (!set || typeof set.id !== 'string' || !set.id || sets.some((s) => s.id === set.id)) continue;
        sets.push({ id: set.id.slice(0, 200), name: set.id === 'default' ? 'お気に入り' : String(set.name || 'お気に入り').slice(0, 200), ids: ids(set.ids) });
    }
    if (!sets.some((set) => set.id === 'default')) sets.unshift({ id: 'default', name: 'お気に入り', ids: [] });
    return { sets, history: ids(raw?.history).slice(0, 50),
        activeSetId: sets.some((set) => set.id === raw?.activeSetId) ? raw!.activeSetId! : 'default' };
}

// Apply edits relative to the last acknowledged snapshot, not a whole-list overwrite.
// An unchanged stale Web tab therefore cannot resurrect a removed favorite.
export function mergeWebSnapshot(state: PersonalLibrary, type: EntryType, current: WebSnapshot,
    previous: WebSnapshot | null, names: Record<string, string> = {}, now = Date.now()): PersonalLibrary {
    let next = normalizeLibrary(state);
    const entry = (id: string, time = now): LibraryEntry => ({ type, id,
        name: names[id] || next.favorites.find((e) => e.type === type && e.id === id)?.name
            || next.history.find((e) => e.type === type && e.id === id)?.name || id,
        viewedAt: time });
    for (const old of previous?.sets ?? []) {
        if (old.id !== 'default' && !current.sets.some((s) => s.id === old.id)) {
            next.sets = next.sets.filter((s) => s.type !== type || s.id !== old.id);
            next.favorites = next.favorites.map((e) => e.type === type
                ? { ...e, setIds: e.setIds?.filter((id) => id !== old.id) } : e);
        }
    }
    for (const set of current.sets) {
        const old = previous?.sets.find((s) => s.id === set.id);
        const existing = next.sets.find((s) => s.type === type && s.id === set.id);
        if (!existing && !old) next.sets.push({ type, id: set.id, name: set.name });
        else if (existing && old && old.name !== set.name) existing.name = set.name;
        for (const id of old?.ids ?? []) if (!set.ids.includes(id)) next = setFavorite(next, entry(id), false, now, set.id);
        for (const id of set.ids) if (!old?.ids.includes(id)) next = setFavorite(next, entry(id), true, now, set.id);
    }
    const removed = (previous?.history ?? []).filter((id) => !current.history.includes(id));
    next.history = next.history.filter((e) => e.type !== type || !removed.includes(e.id));
    for (let index = current.history.length - 1; index >= 0; index--) {
        const id = current.history[index];
        const known = next.history.find((e) => e.type === type && e.id === id);
        const newVisit = previous && index === 0 && previous.history[0] !== id;
        if ((!previous && !known) || (previous && !previous.history.includes(id)) || newVisit) {
            next.history = [entry(id, now - index), ...next.history.filter((e) => e.type !== type || e.id !== id)];
        }
    }
    return normalizeLibrary(next);
}

export function exportWebSnapshot(state: PersonalLibrary, type: EntryType, activeSetId = 'default'): WebSnapshot {
    return normalizeSnapshot({ activeSetId,
        sets: state.sets.filter((s) => s.type === type).map((set) => ({ id: set.id, name: set.name,
            ids: state.favorites.filter((e) => e.type === type && e.setIds?.includes(set.id)).map((e) => e.id) })),
        history: state.history.filter((e) => e.type === type).map((e) => e.id),
    }, type);
}
