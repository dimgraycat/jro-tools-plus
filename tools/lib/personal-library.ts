export type EntryType = 'item' | 'monster';
export type EntryFilter = 'all' | EntryType;
export interface LibraryEntry {
    type: EntryType;
    id: string;
    name: string;
    viewedAt: number;
    addedAt?: number;
    setIds?: string[];
}
export interface FavoriteSet { type: EntryType; id: string; name: string; }
export interface PersonalLibrary {
    version: 1;
    revision: number;
    syncId?: string;
    sets: FavoriteSet[];
    favorites: LibraryEntry[];
    history: LibraryEntry[];
}

export const LIBRARY_KEY = 'jro-tools-plus.personalLibrary';
export const HISTORY_LIMIT = 50;
export const entryKey = (entry: Pick<LibraryEntry, 'type' | 'id'>) => `${entry.type}:${entry.id}`;

export function entryFromUrl(value: string, name = '', now = Date.now()): LibraryEntry | null {
    try {
        const url = new URL(value);
        if (url.origin !== 'https://rotool.gungho.jp') return null;
        // Official item pages may include a trailing numeric page segment (e.g. /item/26165/0/).
        const match = /^\/(item)\/(\d+)(?:\/\d+)?\/?$/.exec(url.pathname)
            || /^\/(monster)\/([A-Za-z0-9_]+)\/?$/.exec(url.pathname);
        if (!match || (match[1] === 'item' && !/^\d+$/.test(match[2]))) return null;
        return {
            type: match[1] as EntryType,
            id: match[2],
            name: name.trim().slice(0, 200) || match[2],
            viewedAt: now,
        };
    } catch { return null; }
}

export function officialUrl(entry: Pick<LibraryEntry, 'type' | 'id'>): string {
    return `https://rotool.gungho.jp/${entry.type}/${encodeURIComponent(entry.id)}/`;
}

export function normalizeLibrary(value: unknown): PersonalLibrary {
    const raw = value as Partial<PersonalLibrary> | null;
    const sets: FavoriteSet[] = [];
    for (const type of ['item', 'monster'] as const) {
        sets.push({ type, id: 'default', name: 'お気に入り' });
        for (const set of Array.isArray(raw?.sets) ? raw!.sets : []) {
            if (set?.type === type && typeof set.id === 'string' && set.id && set.id !== 'default'
                && !sets.some((existing) => existing.type === type && existing.id === set.id)) {
                sets.push({ type, id: set.id.slice(0, 200), name: String(set.name || 'お気に入り').slice(0, 200) });
            }
        }
    }
    const normalize = (entries: unknown): LibraryEntry[] => {
        const seen = new Set<string>();
        if (!Array.isArray(entries)) return [];
        return [...entries].sort((a, b) => (b?.viewedAt || 0) - (a?.viewedAt || 0)).flatMap((value) => {
            if (!value || !['item', 'monster'].includes(value.type) || typeof value.id !== 'string') return [];
            const entry = entryFromUrl(officialUrl(value), typeof value.name === 'string' ? value.name : '',
                Number.isFinite(value.viewedAt) ? value.viewedAt : 0);
            if (!entry || seen.has(entryKey(entry))) return [];
            seen.add(entryKey(entry));
            if (Number.isFinite(value.addedAt)) entry.addedAt = value.addedAt;
            if (Array.isArray(value.setIds)) entry.setIds = [...new Set<string>(value.setIds.filter((id: unknown) =>
                typeof id === 'string' && sets.some((set) => set.type === entry.type && set.id === id)))];
            return [entry];
        });
    };
    const history = normalize(raw?.history).sort((a, b) => b.viewedAt - a.viewedAt);
    const counts = { item: 0, monster: 0 };
    return {
        version: 1,
        revision: Number.isSafeInteger(raw?.revision) ? raw!.revision! : 0,
        ...(typeof raw?.syncId === 'string' && raw.syncId ? { syncId: raw.syncId.slice(0, 100) } : {}),
        sets,
        favorites: normalize(raw?.favorites).map((entry) => ({ ...entry, setIds: entry.setIds ?? ['default'] }))
            .filter((entry) => entry.setIds.length > 0).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)),
        history: history.filter((entry) => ++counts[entry.type] <= HISTORY_LIMIT),
    };
}

export function recordVisit(state: PersonalLibrary, entry: LibraryEntry): PersonalLibrary {
    const key = entryKey(entry);
    return normalizeLibrary({
        ...state,
        history: [entry, ...state.history.filter((candidate) => entryKey(candidate) !== key)],
        favorites: state.favorites.map((candidate) => entryKey(candidate) === key
            ? { ...candidate, name: entry.name, viewedAt: entry.viewedAt } : candidate),
    });
}

export function setFavorite(state: PersonalLibrary, entry: LibraryEntry, favorite: boolean, now = Date.now(), setId?: string): PersonalLibrary {
    const others = state.favorites.filter((candidate) => entryKey(candidate) !== entryKey(entry));
    const existing = state.favorites.find((candidate) => entryKey(candidate) === entryKey(entry));
    const target = setId ?? 'default';
    if (!state.sets.some((set) => set.type === entry.type && set.id === target)) return state;
    const memberships = existing?.setIds ?? [];
    const setIds = favorite ? [...new Set([...memberships, target])]
        : setId ? memberships.filter((id) => id !== setId) : [];
    return normalizeLibrary({ ...state, favorites: setIds.length
        ? [{ ...entry, setIds, addedAt: existing?.addedAt ?? now }, ...others] : others });
}

export function filterEntries(entries: LibraryEntry[], filter: EntryFilter, query: string): LibraryEntry[] {
    const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase('ja');
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    return entries.filter((entry) => (filter === 'all' || entry.type === filter)
        && terms.every((term) => normalize(entry.name).includes(term)));
}
