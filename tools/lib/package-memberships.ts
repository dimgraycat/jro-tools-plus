import { validItemId } from './search-assist.js';

export interface PackageMembership { key: string; group: 'costama' | 'ragcan'; label: string; url: string }
type MembershipIndex = Map<string, PackageMembership[]>;
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

function officialUrl(value: unknown): string {
    try {
        const url = new URL(string(value));
        return ['https:', 'http:'].includes(url.protocol) && url.hostname === 'ragnarokonline.gungho.jp'
            && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
}

function label(value: string): string {
    const match = value.match(/^(\d{4})-?(.+)$/u);
    if (!match) return value;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months.indexOf(match[2]);
    return month >= 0 ? `${match[1]}年${String(month + 1).padStart(2, '0')}月` : `${match[1]} ${match[2]}`;
}

export function buildMembershipIndex(payload: unknown): MembershipIndex {
    const source = object(payload);
    if (!Array.isArray(source.groups)) throw new Error('Invalid package data');
    const index: MembershipIndex = new Map();
    for (const value of source.groups) {
        const group = object(value);
        if (group.key !== 'costama' && group.key !== 'ragcan') continue;
        if (!Array.isArray(group.packages)) throw new Error('Invalid package group');
        for (const value of group.packages) {
            const pkg = object(value);
            if (!Array.isArray(pkg.item_ids)) throw new Error('Invalid package items');
            const key = string(pkg.key);
            const name = string(pkg.label) || key;
            if (!key || !name) continue;
            const membership: PackageMembership = { key, group: group.key, label: label(name), url: officialUrl(pkg.url) };
            for (const value of pkg.item_ids) {
                if (!validItemId(value)) continue;
                const id = String(value);
                const memberships = index.get(id) || [];
                if (!memberships.some((entry) => entry.group === membership.group && entry.key === key)) memberships.push(membership);
                index.set(id, memberships);
            }
        }
    }
    return index;
}

export function createMembershipLoader(fetcher: typeof fetch = fetch) {
    let cache: { index: MembershipIndex; until: number } | undefined;
    return async (id: string, signal: AbortSignal): Promise<PackageMembership[]> => {
        if (signal.aborted) throw new Error('Aborted');
        if (!cache || cache.until < Date.now()) {
            const response = await fetcher('https://asgrcat.github.io/jro-search/data/search/package-index.json',
                { signal, credentials: 'omit', cache: 'no-cache' });
            if (!response.ok) throw new Error('Package fetch failed');
            const index = buildMembershipIndex(await response.json());
            if (signal.aborted) throw new Error('Aborted');
            cache = { index, until: Date.now() + 5 * 60 * 1000 };
        }
        return cache.index.get(id) || [];
    };
}
