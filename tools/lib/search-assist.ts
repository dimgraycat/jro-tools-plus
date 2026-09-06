// Public JRO Search detail data. Keep parsing/network concerns independent of the DOM.
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
export const validItemId = (value: unknown): boolean => /^[1-9]\d*$/.test(text(value)) && Number.isSafeInteger(Number(value));
export interface AssistCandidate { name: string; id: string }
export interface AssistSlot { name: string; conditions: string[]; candidates: AssistCandidate[] }
export interface AssistSet { name: string; conditions: string[]; slots: AssistSlot[] }
export interface AssistItem { id: string; name: string; sets: AssistSet[] }

export function detailUrl(id: string): string {
    if (!validItemId(id)) throw new Error('Invalid item ID');
    return `https://asgrcat.github.io/jro-search/data/search/item-details/${String(Number(id) % 64).padStart(2, '0')}.json`;
}

function conditions(value: RecordValue): string[] {
    const method = text(value.selection_method);
    const labels: Record<string, string> = {
        random: 'ランダムエンチャント', select: '指定エンチャント', fixed: '固定エンチャント',
        select_or_random: '指定/ランダムエンチャント', slot_and_effect_select: '指定エンチャント',
    };
    return [
        value.npc_name ? `NPC: ${text(value.npc_name)}` : '',
        method ? labels[method] || method : '',
        value.success_rate ? `成功率: ${text(value.success_rate)}` : '',
        text(value.failure_effect),
        value.required_refine ? `精錬条件: ${text(value.required_refine)}` : '',
        value.required_transcendence ? `超越: ${text(value.required_transcendence)}` : '',
        value.required_enchantment ? `前提: ${text(value.required_enchantment)}` : '',
        value.required_enchanted_slots ? `エンチャント済み: ${text(value.required_enchanted_slots)}` : '',
    ].filter(Boolean);
}

export function parseAssistItem(payload: unknown, id: string): AssistItem | null {
    const source = record(payload);
    if (!Array.isArray(source.items)) throw new Error('Invalid detail data');
    const item = source.items.map(record).find((entry) => text(entry.item_id) === id);
    if (!item) return null;
    const enchantments = record(item.enchantments);
    if (enchantments.sets !== undefined && !Array.isArray(enchantments.sets)) throw new Error('Invalid enchantment data');
    return {
        id, name: text(item.name) || id,
        sets: list(enchantments.sets).map((value) => {
            const set = record(value);
            const fee = list(set.fee).map((value) => {
                const material = record(value);
                const amount = text(material.amount ?? material.quantity);
                return [text(material.item_name), amount ? `${amount}個` : ''].filter(Boolean).join(' ');
            }).filter(Boolean).join('、');
            return {
                name: text(set.name) || 'エンチャント',
                conditions: [...conditions(set), ...(fee ? [`必要素材: ${fee}`] : [])],
                slots: list(set.slots).map((value) => {
                    const slot = record(value);
                    return {
                        name: [text(slot.enchant_step_label), text(slot.slot_label)].filter(Boolean).join(' / ') || '対象箇所',
                        conditions: conditions(slot),
                        candidates: list(slot.candidates).map((value) => {
                            const candidate = record(value);
                            return { name: text(candidate.name), id: validItemId(candidate.item_id) ? text(candidate.item_id) : '' };
                        }).filter((candidate) => candidate.name),
                    };
                }),
            };
        }),
    };
}

export async function loadAssistItem(id: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<AssistItem | null> {
    const response = await fetcher(detailUrl(id), { signal, cache: 'no-cache', credentials: 'omit' });
    if (!response.ok) throw new Error('Detail fetch failed');
    return parseAssistItem(await response.json(), id);
}
