import { EntryFilter, LibraryEntry, filterEntries } from './personal-library.js';

export interface LibraryViewFilter {
    type: EntryFilter;
    query: string;
    setId: string;
    setType?: 'item' | 'monster';
}

export function selectLibraryEntries(entries: LibraryEntry[], filter: LibraryViewFilter): LibraryEntry[] {
    return filterEntries(entries, filter.type, filter.query)
        .filter((entry) => !filter.setId || ((!filter.setType || entry.type === filter.setType)
            && entry.setIds?.includes(filter.setId)));
}

export interface VersionHistoryEntry {
    version: string;
    date: string;
    changes: string[];
}

export function parseVersionHistory(value: unknown): VersionHistoryEntry[] {
    if (!Array.isArray(value)) throw new Error('更新履歴の形式が正しくありません。');
    return value.map((entry: unknown) => {
        if (!entry || typeof entry !== 'object') throw new Error('更新履歴の形式が正しくありません。');
        const raw = entry as Partial<VersionHistoryEntry>;
        if (typeof raw.version !== 'string' || typeof raw.date !== 'string'
            || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date) || !Array.isArray(raw.changes)
            || !raw.changes.every((change) => typeof change === 'string')) {
            throw new Error('更新履歴の形式が正しくありません。');
        }
        return { version: raw.version, date: raw.date, changes: [...raw.changes] };
    });
}
