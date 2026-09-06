import { LIBRARY_KEY } from '../../tools/lib/personal-library.js';
import { WebSnapshot, webType, webKeys, normalizeSnapshot, exportWebSnapshot } from '../../tools/lib/web-sync.js';

const type = webType(location.href);
if (type && window === window.top && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage && chrome.storage?.onChanged) {
    const keys = webKeys(type);
    const idsKey = type === 'item' ? 'itemIds' : 'monsterIds';
    const parse = (key: string) => {
        const value = localStorage.getItem(key);
        // Invalid storage must not be mistaken for an intentional deletion.
        return value === null ? null : JSON.parse(value);
    };
    const read = (): WebSnapshot => {
        const sets = parse(keys.sets);
        const array = (value: unknown): string[] => {
            if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) throw new Error('Invalid stored IDs');
            return value;
        };
        if (sets !== null && (!Array.isArray(sets?.sets) || sets.sets.some((set: any) =>
            !set || typeof set.id !== 'string' || !set.id || typeof set.name !== 'string'
            || !Array.isArray(set[idsKey])))) throw new Error('Invalid stored sets');
        return normalizeSnapshot({
            activeSetId: sets?.activeSetId,
            sets: sets !== null ? sets.sets.map((set: any) => ({ id: set.id, name: set.name, ids: array(set[idsKey]) }))
                : [{ id: 'default', name: 'お気に入り', ids: array(parse(keys.legacy) ?? []) }],
            history: array(parse(keys.history) ?? []),
        }, type);
    };
    let running = false;
    let again = false;
    let applying = false;
    let stopped = false;
    let pendingVisit: { id: string } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function synchronize() {
        if (stopped || applying) return;
        if (running) { again = true; return; }
        running = true;
        try {
            const current = read();
            const previous = parse(keys.baseline);
            const visit = pendingVisit;
            const response = await chrome.runtime.sendMessage({ type: 'library.web-sync', current, previous,
                syncId: localStorage.getItem(keys.instance), visitedId: visit?.id });
            if (!response?.ok) throw new Error(response?.error || 'Sync unavailable');
            if (pendingVisit === visit) pendingVisit = null;
            // Changes made while the request was in flight are sent in the next delta.
            if (JSON.stringify(read()) !== JSON.stringify(current)) {
                localStorage.setItem(keys.baseline, JSON.stringify(current));
                if (response.state.syncId) localStorage.setItem(keys.instance, response.state.syncId);
                again = true;
                return;
            }
            const next = exportWebSnapshot(response.state, type!, current.activeSetId);
            applying = true;
            if (response.state.syncId) localStorage.setItem(keys.instance, response.state.syncId);
            if (JSON.stringify(next) !== JSON.stringify(current)) {
                localStorage.setItem(keys.sets, JSON.stringify({ version: 1, activeSetId: next.activeSetId,
                    sets: next.sets.map((set) => ({ id: set.id, name: set.name, [idsKey]: set.ids })) }));
                localStorage.setItem(keys.legacy, JSON.stringify(next.sets.find((set) => set.id === next.activeSetId)?.ids || []));
                localStorage.setItem(keys.history, JSON.stringify(next.history));
                localStorage.setItem(keys.baseline, JSON.stringify(next));
                window.dispatchEvent(new Event('jro-search:personal-data-updated'));
            } else {
                localStorage.setItem(keys.baseline, JSON.stringify(next));
            }
        } catch {
            // Preserve both copies on network, extension reload, or storage failures.
            // The next local change or periodic check will retry.
        } finally {
            applying = false;
            running = false;
            if (again) { again = false; schedule(); }
        }
    }
    function schedule() {
        if (applying || stopped) return;
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; void synchronize(); }, 100);
    }
    window.addEventListener('jro-search:personal-data-changed', (event) => {
        if (applying) return;
        const detail = (event as CustomEvent).detail;
        if (detail?.kind === 'history' && typeof detail.id === 'string') pendingVisit = { id: detail.id };
        schedule();
    });
    window.addEventListener('storage', (event) => {
        if (event.key === null || [keys.sets, keys.legacy, keys.history].includes(event.key)) schedule();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[LIBRARY_KEY]) schedule();
    });
    // Also supports older Web releases and rechecks after service worker suspension.
    const check = () => {
        try { if (pendingVisit || JSON.stringify(read()) !== JSON.stringify(parse(keys.baseline))) schedule(); } catch {}
    };
    let interval = setInterval(check, 1500);
    window.addEventListener('pagehide', () => { stopped = true; clearInterval(interval); if (timer !== null) clearTimeout(timer); });
    window.addEventListener('pageshow', () => {
        if (stopped) { stopped = false; interval = setInterval(check, 1500); schedule(); }
    });
    schedule();
}
