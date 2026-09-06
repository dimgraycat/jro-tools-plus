import { AssistCandidate, validItemId } from './search-assist.js';

type TargetIndex = Map<string, Map<string, AssistCandidate>>;
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const string = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

export function buildTargetIndex(payload: unknown, names: unknown): TargetIndex {
    const source = object(payload);
    if (!Array.isArray(source.items) || !Object.keys(object(names)).length) throw new Error('Invalid enchantment target data');
    const nameMap = object(names);
    const index: TargetIndex = new Map();
    for (const value of source.items) {
        const item = object(value);
        const id = string(item.item_id);
        if (!validItemId(id)) continue;
        const target = { id, name: string(nameMap[id]) || id };
        for (const setValue of array(item.sets)) {
            for (const slotValue of array(object(setValue).slots)) {
                for (const candidateValue of array(object(slotValue).candidates)) {
                    const candidate = object(candidateValue);
                    const candidateId = string(candidate.item_id);
                    const name = string(candidate.name);
                    // Match the Web's union of ID and exact-name reverse lookups.
                    for (const key of [
                        ...(validItemId(candidateId) ? [`id:${candidateId}`] : []),
                        ...(name ? [`name:${name}`] : []),
                    ]) {
                        if (!index.has(key)) index.set(key, new Map());
                        index.get(key)!.set(id, target);
                    }
                }
            }
        }
    }
    return index;
}

export function targetsForItem(index: TargetIndex, item: AssistCandidate): AssistCandidate[] {
    const targets = new Map([
        ...index.get(`id:${item.id}`) ?? [],
        ...index.get(`name:${item.name.trim()}`) ?? [],
    ]);
    return [...targets.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja') || Number(a.id) - Number(b.id));
}

export function createTargetLoader(fetcher: typeof fetch = fetch) {
    let cache: { index: TargetIndex; until: number } | undefined;
    return async (item: AssistCandidate, signal: AbortSignal): Promise<AssistCandidate[]> => {
        if (!cache || cache.until < Date.now()) {
            const urls = ['search/item-enchantment-targets.json', 'items/name-map.json'];
            const values = await Promise.all(urls.map(async (path) => {
                const response = await fetcher(`https://asgrcat.github.io/jro-search/data/${path}`,
                    { signal, credentials: 'omit', cache: 'no-cache' });
                if (!response.ok) throw new Error('Enchantment target fetch failed');
                return response.json();
            }));
            const index = buildTargetIndex(values[0], values[1]);
            if (signal.aborted) throw new Error('Aborted');
            // Cache only successful data, briefly and only for this Side Panel.
            cache = { index, until: Date.now() + 5 * 60 * 1000 };
        }
        return targetsForItem(cache.index, item);
    };
}
