export interface WorldInfo { // zeny-characterpage-scraper.ts と同じ定義
  value: string;
  text: string;
}

// zeny-characterpage-scraper.ts と同じ定義
export interface CharacterPageLink extends WorldInfo {
  href: string;
}

export interface CharacterDetail extends CharacterPageLink {
  characterName?: string;
  zeny?: string;
}

export interface WorldZenySummary {
    worldText: string;
    characters: CharacterDetail[];
    totalZeny: number;
}

export type ZenyDisplayPreference = 'full' | 'short';

const DEFAULT_ZENY_DISPLAY_PREFERENCE: ZenyDisplayPreference = 'full';
const ZENY_CHARACTER_INDEX_URL_PATTERN = /^https:\/\/rowebtool\.gungho\.jp\/character\/?(?:\?[^#]*)?(?:#.*)?$/;
const ZENY_CHARACTER_DETAIL_URL_PATTERN = /^https:\/\/rowebtool\.gungho\.jp\/character\/\w+\/\d+$/;
const ZENY_SCRAPER_FILE = '/tools/js/zeny-characterpage-scraper.js';
const ZENY_COOLDOWN_DURATION_MS = 5 * 60 * 1000;
const ZENY_VALUE_CLASS_NAME = 'zeny-value';
const ZENY_BUTTON_ENABLED_CLASSES = ['bg-blue-500', 'hover:bg-blue-700'];
const ZENY_BUTTON_DISABLED_CLASSES = ['opacity-50', 'cursor-not-allowed', 'bg-gray-400', 'hover:bg-gray-400'];
const STORAGE_KEYS = {
    zenyDisplayPreference: 'zenyDisplayPreference',
    zenyCrawlLastUpdated: 'zenyCrawlLastUpdatedTimestamp',
    zenyCrawlResults: 'zenyCrawlResultsData',
} as const;

let currentZenyDisplayPreference: ZenyDisplayPreference = DEFAULT_ZENY_DISPLAY_PREFERENCE;

export function isZenyTargetUrl(url: string | undefined): boolean {
    return typeof url === 'string'
        && (ZENY_CHARACTER_INDEX_URL_PATTERN.test(url) || ZENY_CHARACTER_DETAIL_URL_PATTERN.test(url));
}

class ZenyCrawlInterruptedError extends Error {
    constructor(message = '取得中に対象タブが閉じられたため中断しました') {
        super(message);
        this.name = 'ZenyCrawlInterruptedError';
    }
}

function isZenyCrawlInterruptedError(error: unknown): error is ZenyCrawlInterruptedError {
    return error instanceof ZenyCrawlInterruptedError;
}

function hasChromeStorage(): boolean {
    return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

function getChromeLastErrorMessage(): string | undefined {
    return chrome.runtime.lastError?.message;
}

function readLocalStorage(keys: string[]): Promise<Record<string, unknown>> {
    if (!hasChromeStorage()) {
        return Promise.resolve({});
    }

    return new Promise((resolve) => {
        chrome.storage.local.get(keys, (result) => {
            const errorMessage = getChromeLastErrorMessage();
            if (errorMessage) {
                console.error('Error loading local storage:', errorMessage);
                resolve({});
                return;
            }
            resolve(result);
        });
    });
}

function writeLocalStorage(values: Record<string, unknown>, context: string): Promise<void> {
    if (!hasChromeStorage()) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        chrome.storage.local.set(values, () => {
            const errorMessage = getChromeLastErrorMessage();
            if (errorMessage) {
                console.error(`Error saving ${context}:`, errorMessage);
            }
            resolve();
        });
    });
}

export function isZenyDisplayPreference(value: unknown): value is ZenyDisplayPreference {
    return value === 'full' || value === 'short';
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function parseZenyAmount(zeny: string | undefined): number | null {
    const amount = parseInt((zeny || '0').replace(/,/g, '').replace(/\s*Zeny/i, ''), 10);
    return Number.isNaN(amount) ? null : amount;
}

export function formatShortZeny(zeny: number): string {
    if (!Number.isFinite(zeny)) return 'N/A';
    if (zeny >= 1_000_000_000) return `${Math.floor(zeny / 1_000_000_000)}G Zeny`;
    if (zeny >= 1_000_000) return `${Math.floor(zeny / 1_000_000)}M Zeny`;
    if (zeny >= 1_000) return `${Math.floor(zeny / 1_000)}K Zeny`;
    return `${zeny.toLocaleString()} Zeny`;
}

export function formatActualZeny(zeny: number): string {
    if (!Number.isFinite(zeny)) return 'N/A';
    return `${zeny.toLocaleString()} Zeny`;
}

export function formatZenyForDisplay(zeny: number, preference: ZenyDisplayPreference): string {
    if (preference === 'full') {
        return formatActualZeny(zeny);
    }

    return `<span class="${ZENY_VALUE_CLASS_NAME}" tabindex="0" data-actual-zeny="${zeny}">${formatShortZeny(zeny)}</span>`;
}

export function groupCharacterDetailsByWorld(details: CharacterDetail[]): Record<string, WorldZenySummary> {
    return details.reduce<Record<string, WorldZenySummary>>((worlds, character) => {
        if (!worlds[character.value]) {
            worlds[character.value] = {
                worldText: character.text,
                characters: [],
                totalZeny: 0,
            };
        }

        worlds[character.value].characters.push(character);
        const zenyAmount = parseZenyAmount(character.zeny);
        if (zenyAmount !== null) {
            worlds[character.value].totalZeny += zenyAmount;
        }

        return worlds;
    }, {});
}

function renderCharacterZeny(character: CharacterDetail, preference: ZenyDisplayPreference): string {
    const amount = parseZenyAmount(character.zeny);
    if (amount === null) {
        return escapeHtml(character.zeny || 'Zeny不明');
    }

    return formatZenyForDisplay(amount, preference);
}

export function formatCharacterDetailsToHtml(details: CharacterDetail[], preference: ZenyDisplayPreference): string {
    if (!details || details.length === 0) {
        return '<p class="text-gray-500">データがありません</p>';
    }

    const worldsData = groupCharacterDetailsByWorld(details);
    const worldsHtml = Object.keys(worldsData).map((worldValue) => {
        const world = worldsData[worldValue];
        const totalZenyDisplay = formatZenyForDisplay(world.totalZeny, preference);
        const charactersHtml = world.characters.map((character) => {
            const characterName = escapeHtml(character.characterName || '不明なキャラクター');
            const characterZeny = renderCharacterZeny(character, preference);
            return `<li>${characterName} (${characterZeny})</li>`;
        }).join('');

        return [
            '<div class="p-3 bg-gray-50 rounded-md shadow-sm">',
            `<h3 class="text-lg font-semibold text-blue-800">${escapeHtml(world.worldText)} (合計: ${totalZenyDisplay})</h3>`,
            '<ul class="list-disc list-inside ml-4 mt-2 space-y-1 text-sm">',
            charactersHtml,
            '</ul>',
            '</div>',
        ].join('');
    }).join('');

    return `<div class="space-y-4">${worldsHtml}</div>`;
}

// --- Date Formatting Helper ---
function formatTimestampToYyyyMmDdHhMmSs(timestamp: number): string {
  const date = new Date(timestamp);
  const YYYY = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
  const DD = String(date.getDate()).padStart(2, '0');
  const HH = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${YYYY}/${MM}/${DD} ${HH}:${mm}:${ss}`;
}

if (typeof document !== 'undefined') {
document.addEventListener('DOMContentLoaded', () => {
    const menuItems = document.querySelectorAll('nav ul li[class*="js-menu-"]');
    const pageElements = document.querySelectorAll('main[class*="js-pages-"]');

    function updateActiveState() {
        const currentHash = window.location.hash;
        const targetId = currentHash.substring(1);

        // メニューの選択状態を更新
        menuItems.forEach(li => {
            const link = li.querySelector('a') as HTMLAnchorElement | null;
            if (!link) return;
            const linkHref = link.getAttribute('href');

            li.classList.remove('bg-gray-100', 'border-blue-500', 'border-white', 'border-transparent');
            link.classList.remove('text-blue-600', 'font-semibold');
            li.classList.add('border-transparent');
            link.classList.add('text-gray-700');

            if (linkHref === currentHash) {
                li.classList.add('bg-gray-100', 'border-blue-500');
                link.classList.add('text-blue-600', 'font-semibold');
                li.classList.remove('border-white', 'border-transparent');
                link.classList.remove('text-gray-700');
            }
        });

        // ページの表示状態を更新
        pageElements.forEach(page => {
            if (page.id === targetId) {
                page.classList.remove('hidden');
            } else {
                page.classList.add('hidden');
            }
        });
    }

    // 初期化処理
    function initialize() {
        let currentHash = window.location.hash;
        const firstMenuLink = (menuItems[0]?.querySelector('a') as HTMLAnchorElement | null)?.getAttribute('href');
        const validPageIds = Array.from(pageElements).map(p => p.id);

        if (!currentHash || !validPageIds.includes(currentHash.substring(1))) {
            if (firstMenuLink && validPageIds.includes(firstMenuLink.substring(1))) {
                window.location.hash = firstMenuLink;
                return;
            } else if (validPageIds.length > 0) {
                window.location.hash = `#${validPageIds[0]}`;
                return;
            }
        }
        updateActiveState();
    }

    window.addEventListener('hashchange', updateActiveState);
    initialize();

    // --- 所持Zeny情報収集機能 ---
    const zenyCrawlButton = document.getElementById('zeny-crawl-button') as HTMLButtonElement | null;
    const zenyCrawlStatus = document.getElementById('zeny-crawl-status') as HTMLElement | null;
    const zenyCrawlResultsOutput = document.getElementById('zeny-crawl-results-output') as HTMLElement | null;
    const zenyCrawlLastUpdated = document.getElementById('zeny-crawl-last-updated') as HTMLElement | null;
    const zenyDisplayModeRadios = document.querySelectorAll<HTMLInputElement>('input[name="zenyDisplayMode"]');

    let cooldownIntervalId: number | null = null;
    let activeZenyCrawlTabId: number | null = null;
    let activeZenyCrawlTabWasClosed = false;
    let suppressNextZenyTargetStateRefresh = false;

    function setZenyButtonEnabled(isEnabled: boolean) {
        if (!zenyCrawlButton) return;

        zenyCrawlButton.disabled = !isEnabled;
        if (isEnabled) {
            zenyCrawlButton.classList.remove(...ZENY_BUTTON_DISABLED_CLASSES);
            zenyCrawlButton.classList.add(...ZENY_BUTTON_ENABLED_CLASSES);
            return;
        }

        zenyCrawlButton.classList.add(...ZENY_BUTTON_DISABLED_CLASSES);
        zenyCrawlButton.classList.remove(...ZENY_BUTTON_ENABLED_CLASSES);
    }

    function setZenyStatus(message: string, stateClass?: 'text-red-500' | 'text-yellow-600' | 'text-green-500') {
        if (!zenyCrawlStatus) return;

        zenyCrawlStatus.textContent = message;
        zenyCrawlStatus.classList.remove('text-red-500', 'text-green-500', 'text-yellow-600');
        if (stateClass) {
            zenyCrawlStatus.classList.add(stateClass);
        }
    }

    function updateLastUpdatedText(timestamp: number) {
        if (!zenyCrawlLastUpdated) return;
        zenyCrawlLastUpdated.textContent = `前回取得: ${formatTimestampToYyyyMmDdHhMmSs(timestamp)}`;
    }

    function clearCooldownTimer() {
        if (cooldownIntervalId) {
            clearInterval(cooldownIntervalId);
            cooldownIntervalId = null;
        }
    }

    function resetZenyReadyState() {
        clearCooldownTimer();
        setZenyButtonEnabled(true);
        setZenyStatus('再実行可能です');
        if (zenyCrawlLastUpdated) {
            zenyCrawlLastUpdated.textContent = '';
        }
    }

    async function loadLastUpdatedTimestamp() {
        const result = await readLocalStorage([STORAGE_KEYS.zenyCrawlLastUpdated]);
        const timestamp = result[STORAGE_KEYS.zenyCrawlLastUpdated];
        if (typeof timestamp === 'number') {
            updateLastUpdatedText(timestamp);
            checkCooldown(timestamp);
            return;
        }

        resetZenyReadyState();
    }

    async function loadStoredCrawlResults() {
        if (!zenyCrawlResultsOutput) return;

        const result = await readLocalStorage([STORAGE_KEYS.zenyCrawlResults]);
        const storedData = result[STORAGE_KEYS.zenyCrawlResults];
        if (Array.isArray(storedData)) {
            zenyCrawlResultsOutput.innerHTML = formatCharacterDetailsToHtml(storedData as CharacterDetail[], currentZenyDisplayPreference);
        }
    }

    function syncZenyDisplayRadios() {
        zenyDisplayModeRadios.forEach(radio => {
            radio.checked = radio.value === currentZenyDisplayPreference;
        });
    }

    async function loadZenyDisplayPreference() {
        const result = await readLocalStorage([STORAGE_KEYS.zenyDisplayPreference]);
        const storedPreference = result[STORAGE_KEYS.zenyDisplayPreference];
        currentZenyDisplayPreference = isZenyDisplayPreference(storedPreference)
            ? storedPreference
            : DEFAULT_ZENY_DISPLAY_PREFERENCE;

        syncZenyDisplayRadios();
        await loadStoredCrawlResults();
    }

    async function saveZenyDisplayPreference(preference: ZenyDisplayPreference) {
        currentZenyDisplayPreference = preference;
        await writeLocalStorage({ [STORAGE_KEYS.zenyDisplayPreference]: preference }, 'Zeny display preference');
        await loadStoredCrawlResults();
    }

    zenyDisplayModeRadios.forEach(radio => {
        radio.addEventListener('change', (event) => {
            const preference = (event.target as HTMLInputElement).value;
            if (isZenyDisplayPreference(preference)) {
                void saveZenyDisplayPreference(preference);
            }
        });
    });

    function checkCooldown(lastExecutionTime: number) {
        if (!zenyCrawlButton || !zenyCrawlStatus) return;

        const now = Date.now();
        const timeSinceLastExecution = now - lastExecutionTime;

        if (timeSinceLastExecution < ZENY_COOLDOWN_DURATION_MS) {
            setZenyButtonEnabled(false);

            const updateRemainingTime = () => {
                const currentNow = Date.now();
                const newRemainingTimeMs = ZENY_COOLDOWN_DURATION_MS - (currentNow - lastExecutionTime);
                if (newRemainingTimeMs <= 0) {
                    setZenyStatus('再実行可能です');
                    setZenyButtonEnabled(true);
                    if (cooldownIntervalId) clearInterval(cooldownIntervalId);
                    cooldownIntervalId = null;
                } else {
                    const minutes = Math.floor(newRemainingTimeMs / 60000);
                    const seconds = Math.floor((newRemainingTimeMs % 60000) / 1000);
                    setZenyStatus(`再実行可能まであと ${minutes}分${seconds}秒`);
                }
            };

            if (cooldownIntervalId) clearInterval(cooldownIntervalId);
            updateRemainingTime(); // 初回実行
            cooldownIntervalId = window.setInterval(updateRemainingTime, 1000);
        } else {
            setZenyButtonEnabled(true);
            setZenyStatus('再実行可能です');
            clearCooldownTimer();
        }
    }

    function formatStatusUrl(url: string): string {
        return url.length > 60
            ? `${url.substring(0, 30)}...${url.substring(url.length - 25)}`
            : url;
    }

    async function getActiveBrowserTab(): Promise<chrome.tabs.Tab | null> {
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        return activeTab ?? null;
    }

    function isActiveZenyCrawlTabClosed(tabId: number): boolean {
        return activeZenyCrawlTabId === tabId && activeZenyCrawlTabWasClosed;
    }

    function isClosedTabExecutionError(error: unknown): boolean {
        if (!(error instanceof Error)) {
            return false;
        }

        return /No tab with id|Frame with ID .* was removed|tab was closed|Cannot access/i.test(error.message);
    }

    function toZenyCrawlExecutionError(tabId: number, error: unknown): Error {
        if (isActiveZenyCrawlTabClosed(tabId) || isClosedTabExecutionError(error)) {
            return new ZenyCrawlInterruptedError();
        }

        return error instanceof Error ? error : new Error(String(error));
    }

    async function executeActiveTabScript<TArgs extends unknown[], TResult>(
        tabId: number,
        func: (...args: TArgs) => TResult,
        args?: TArgs
    ): Promise<TResult | null> {
        const [result] = await chrome.scripting.executeScript<TArgs, TResult>({
            target: { tabId },
            func,
            args,
        }).catch((error) => {
            throw toZenyCrawlExecutionError(tabId, error);
        });

        return (result?.result ?? null) as TResult | null;
    }

    async function injectZenyScraper(tabId: number) {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: [ZENY_SCRAPER_FILE],
        }).catch((error) => {
            throw toZenyCrawlExecutionError(tabId, error);
        });
    }

    async function fetchWorldOptions(tabId: number): Promise<WorldInfo[] | null> {
        return executeActiveTabScript<[], WorldInfo[] | null>(
            tabId,
            () => (window as any).getWorldOptionsFromPage ? (window as any).getWorldOptionsFromPage() : null
        );
    }

    async function fetchCharacterPageLinks(tabId: number, world: WorldInfo): Promise<CharacterPageLink[] | null> {
        return executeActiveTabScript<[string, string], CharacterPageLink[] | null>(
            tabId,
            (worldVal, worldTxt) => (window as any).scrapeCharacterLinksForWorld
                ? (window as any).scrapeCharacterLinksForWorld(worldVal, worldTxt)
                : null,
            [world.value, world.text]
        );
    }

    async function fetchCharacterDetail(tabId: number, pageLink: CharacterPageLink): Promise<CharacterDetail | null> {
        return executeActiveTabScript<[CharacterPageLink], CharacterDetail | null>(
            tabId,
            (charPageLink) => (window as any).scrapeCharacterDetails
                ? (window as any).scrapeCharacterDetails(charPageLink)
                : null,
            [pageLink]
        );
    }

    async function collectCharacterDetails(tabId: number): Promise<CharacterDetail[] | null> {
        setZenyStatus('対象タブを閉じないでください\n対象ページでワールドリストを取得中...', 'text-yellow-600');
        await injectZenyScraper(tabId);

        const worldOptions = await fetchWorldOptions(tabId);
        if (!worldOptions) {
            setZenyStatus('ワールドリストの取得に失敗しました', 'text-red-500');
            return null;
        }

        if (worldOptions.length === 0) {
            setZenyStatus('収集対象のワールドが見つかりませんでした');
            return null;
        }

        const allCharacterDetails: CharacterDetail[] = [];
        for (const world of worldOptions) {
            setZenyStatus(`対象タブを閉じないでください\n${world.text} のキャラクターURLリストを収集中...`, 'text-yellow-600');
            const characterPageLinks = await fetchCharacterPageLinks(tabId, world);
            if (!characterPageLinks) continue;

            for (const pageLink of characterPageLinks) {
                setZenyStatus(`対象タブを閉じないでください\n${pageLink.text} - ${formatStatusUrl(pageLink.href)} から取得中...`, 'text-yellow-600');
                const detail = await fetchCharacterDetail(tabId, pageLink);
                allCharacterDetails.push(detail ?? { ...pageLink, characterName: '取得失敗', zeny: '取得失敗' });
            }
        }

        return allCharacterDetails;
    }

    async function persistCrawlCompletion(details: CharacterDetail[], timestamp: number) {
        await writeLocalStorage({
            [STORAGE_KEYS.zenyCrawlLastUpdated]: timestamp,
            [STORAGE_KEYS.zenyCrawlResults]: details,
        }, 'Zeny crawl results');
        updateLastUpdatedText(timestamp);
        checkCooldown(timestamp);
    }

    async function handleZenyCrawlClick() {
        if (!zenyCrawlButton || !zenyCrawlResultsOutput) return;
        if (zenyCrawlButton.disabled) return;

        let shouldRefreshAfterCrawl = true;
        setZenyStatus('対象タブを閉じないでください\n情報収集中...', 'text-yellow-600');
        setZenyButtonEnabled(false);
        zenyCrawlResultsOutput.textContent = '';

        try {
            const activeTab = await getActiveBrowserTab();
            if (!activeTab?.id || !isZenyTargetUrl(activeTab.url)) {
                setZenyStatus('アクティブなタブがキャラクター情報ページではありません', 'text-red-500');
                zenyCrawlResultsOutput.textContent = activeTab?.url
                    ? `現在のURL: ${activeTab.url}`
                    : 'アクティブなタブが見つからないか、URLがありません';
                return;
            }

            activeZenyCrawlTabId = activeTab.id;
            activeZenyCrawlTabWasClosed = false;

            const allCharacterDetails = await collectCharacterDetails(activeTab.id);
            if (allCharacterDetails === null) {
                return;
            }

            const now = Date.now();
            if (allCharacterDetails.length > 0) {
                zenyCrawlResultsOutput.innerHTML = formatCharacterDetailsToHtml(allCharacterDetails, currentZenyDisplayPreference);
                setZenyStatus('取得が完了しました');
                await persistCrawlCompletion(allCharacterDetails, now);
                return;
            }

            zenyCrawlResultsOutput.textContent = '収集対象のキャラクターは見つかりませんでした';
            setZenyStatus('取得完了 (データなし)');
            await writeLocalStorage({ [STORAGE_KEYS.zenyCrawlLastUpdated]: now }, 'Zeny crawl last updated timestamp');
            updateLastUpdatedText(now);
            checkCooldown(now);
        } catch (error: any) {
            if (isZenyCrawlInterruptedError(error)) {
                shouldRefreshAfterCrawl = false;
                suppressNextZenyTargetStateRefresh = true;
                setZenyStatus(error.message, 'text-yellow-600');
                zenyCrawlResultsOutput.textContent = '取得中に対象ページのタブが閉じられたため、収集を中断しました。';
                return;
            }

            console.error('Zeny情報取得に失敗しました:', error);
            setZenyStatus(`エラー: ${error.message}`, 'text-red-500');
            zenyCrawlResultsOutput.textContent = '処理中にエラーが発生しました。コンソールで詳細を確認してください。';
        } finally {
            activeZenyCrawlTabId = null;
            activeZenyCrawlTabWasClosed = false;
            if (shouldRefreshAfterCrawl) {
                scheduleZenyTargetStateRefresh();
            }
        }
    }

    if (zenyCrawlButton && zenyCrawlStatus && zenyCrawlResultsOutput) {
        zenyCrawlButton.addEventListener('click', () => {
            void handleZenyCrawlClick();
        });

        // Zeny表示のフォーカスイベントリスナー (zenyCrawlResultsOutput が確実に存在する場合に設定)
        if (zenyCrawlResultsOutput) {
            zenyCrawlResultsOutput.addEventListener('focusin', (event) => {
                if (currentZenyDisplayPreference === 'short') {
                    const target = event.target as HTMLElement;
                    if (target.classList.contains(ZENY_VALUE_CLASS_NAME) && target.dataset.actualZeny) {
                        const actualZenyValue = parseInt(target.dataset.actualZeny, 10);
                        if (!Number.isNaN(actualZenyValue)) {
                            target.textContent = formatActualZeny(actualZenyValue);
                        }
                    }
                }
            });

            zenyCrawlResultsOutput.addEventListener('focusout', (event) => {
                if (currentZenyDisplayPreference === 'short') {
                    const target = event.target as HTMLElement;
                    if (target.classList.contains(ZENY_VALUE_CLASS_NAME) && target.dataset.actualZeny) {
                        const actualZenyValue = parseInt(target.dataset.actualZeny, 10);
                        if (!Number.isNaN(actualZenyValue)) {
                            target.textContent = formatShortZeny(actualZenyValue);
                        }
                    }
                }
            });
        }
    } else {
        if (!zenyCrawlButton) console.warn("Element with ID 'zeny-crawl-button' not found.");
        if (!zenyCrawlStatus) console.warn("Element with ID 'zeny-crawl-status' not found.");
        if (!zenyCrawlResultsOutput) console.warn("Element with ID 'zeny-crawl-results-output' not found.");
        if (!zenyCrawlLastUpdated) console.warn("Element with ID 'zeny-crawl-last-updated' not found.");
    }

    async function initializeZenyCrawlFeatureState() {
        if (!zenyCrawlButton || !zenyCrawlStatus || !zenyCrawlResultsOutput || !zenyCrawlLastUpdated) {
            console.warn("Zeny crawl feature elements are not fully available for initialization.");
            return;
        }

        try {
            const activeTab = await getActiveBrowserTab();

            if (isZenyTargetUrl(activeTab?.url)) {
                loadLastUpdatedTimestamp();
            } else {
                clearCooldownTimer();
                setZenyButtonEnabled(false);
                setZenyStatus('取得対象外のページです', 'text-yellow-600');

                zenyCrawlLastUpdated.textContent = '';
            }
            // loadStoredCrawlResults() は loadZenyDisplayPreference から呼ばれるのでここでは不要
            // loadLastUpdatedTimestamp(); // これは必要に応じてだが、表示設定読み込み後にまとめて行う
        } catch (error: any) {
            console.error("Error initializing Zeny crawl button state:", error);
            if (zenyCrawlStatus) {
                setZenyStatus(`ボタン状態の初期化エラー: ${error.message}`, 'text-red-500');
            }
            if (zenyCrawlButton) zenyCrawlButton.disabled = true;
        }
    }

    let zenyTargetStateRefreshTimer: number | null = null;

    function scheduleZenyTargetStateRefresh() {
        if (activeZenyCrawlTabId !== null) {
            return;
        }

        if (suppressNextZenyTargetStateRefresh) {
            suppressNextZenyTargetStateRefresh = false;
            return;
        }

        if (zenyTargetStateRefreshTimer !== null) {
            clearTimeout(zenyTargetStateRefreshTimer);
        }

        zenyTargetStateRefreshTimer = window.setTimeout(() => {
            zenyTargetStateRefreshTimer = null;
            void initializeZenyCrawlFeatureState();
        }, 100);
    }

    function watchActiveTabForZenyTargetChanges() {
        chrome.tabs.onActivated.addListener(() => {
            scheduleZenyTargetStateRefresh();
        });

        chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
            if (tab.active && (changeInfo.url || changeInfo.status === 'complete')) {
                scheduleZenyTargetStateRefresh();
            }
        });

        chrome.tabs.onRemoved.addListener((tabId) => {
            if (activeZenyCrawlTabId === tabId) {
                activeZenyCrawlTabWasClosed = true;
            }

            scheduleZenyTargetStateRefresh();
        });

        chrome.windows.onFocusChanged.addListener((windowId) => {
            if (windowId !== chrome.windows.WINDOW_ID_NONE) {
                scheduleZenyTargetStateRefresh();
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                scheduleZenyTargetStateRefresh();
            }
        });
    }

    initializeZenyCrawlFeatureState(); // ボタン状態などの初期設定
    watchActiveTabForZenyTargetChanges();
    loadZenyDisplayPreference(); // 表示設定を読み込み、それに基づいて結果を表示
});
}

export {};
