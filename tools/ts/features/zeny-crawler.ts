import { CharacterDetail, WorldInfo, CharacterPageLink } from '../core/types';

// Zeny表示設定のストレージキー
const ZENY_DISPLAY_PREFERENCE_KEY = 'zenyDisplayPreference';
let currentZenyDisplayPreference = 'full'; // デフォルトは全桁表示

// --- Zeny Formatting Helpers ---
function formatZenyForDisplay(zeny: number): string {
  if (isNaN(zeny) || zeny === null || typeof zeny === 'undefined') return "N/A";
  if (zeny >= 1_000_000_000) {
    return Math.floor(zeny / 1_000_000_000) + "G Zeny";
  } else if (zeny >= 1_000_000) {
    return Math.floor(zeny / 1_000_000) + "M Zeny";
  } else if (zeny >= 1_000) {
    return Math.floor(zeny / 1_000) + "K Zeny";
  } else {
    return zeny.toLocaleString() + " Zeny";
  }
}

function formatActualZeny(zeny: number): string {
  if (isNaN(zeny) || zeny === null || typeof zeny === 'undefined') return "N/A";
  return zeny.toLocaleString() + " Zeny";
}

// --- Date Formatting Helper ---
function formatTimestampToYyyyMmDdHhMmSs(timestamp: number): string {
  const date = new Date(timestamp);
  const YYYY = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const DD = String(date.getDate()).padStart(2, '0');
  const HH = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${YYYY}/${MM}/${DD} ${HH}:${mm}:${ss}`;
}


export function initializeZenyCrawler(): void {
    const zenyCrawlButton = document.getElementById('zeny-crawl-button') as HTMLButtonElement | null;
    const zenyCrawlStatus = document.getElementById('zeny-crawl-status') as HTMLElement | null;
    const zenyCrawlResultsOutput = document.getElementById('zeny-crawl-results-output') as HTMLElement | null;
    const zenyCrawlLastUpdated = document.getElementById('zeny-crawl-last-updated') as HTMLElement | null;
    const zenyDisplayModeRadios = document.querySelectorAll<HTMLInputElement>('input[name="zenyDisplayMode"]');

    const targetUrlPattern = /^https:\/\/rowebtool\.gungho\.jp\/character\/\w+\/\d+$/;
    const ZenyCrawlLastUpdatedStorageKey = 'zenyCrawlLastUpdatedTimestamp';
    const ZenyCrawlResultsStorageKey = 'zenyCrawlResultsData';
    const COOLDOWN_DURATION_MS = 5 * 60 * 1000;
    let cooldownIntervalId: number | null = null;

    function applyZenyDisplayPreferenceAndRender() {
        loadStoredCrawlResults();
    }

    function loadZenyDisplayPreference() {
        if (chrome.storage && chrome.storage.local) {
            chrome.storage.local.get([ZENY_DISPLAY_PREFERENCE_KEY], (result) => {
                if (chrome.runtime.lastError) {
                    console.error("Error loading Zeny display preference:", chrome.runtime.lastError.message);
                } else {
                    currentZenyDisplayPreference = result[ZENY_DISPLAY_PREFERENCE_KEY] || 'full';
                }
                zenyDisplayModeRadios.forEach(radio => {
                    radio.checked = (radio.value === currentZenyDisplayPreference);
                });
                applyZenyDisplayPreferenceAndRender();
            });
        } else {
            zenyDisplayModeRadios.forEach(radio => { radio.checked = (radio.value === currentZenyDisplayPreference); });
            applyZenyDisplayPreferenceAndRender();
        }
    }

    zenyDisplayModeRadios.forEach(radio => {
        radio.addEventListener('change', (event) => {
            currentZenyDisplayPreference = (event.target as HTMLInputElement).value;
            if (chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({ [ZENY_DISPLAY_PREFERENCE_KEY]: currentZenyDisplayPreference }, () => {
                    if (chrome.runtime.lastError) console.error("Error saving Zeny display preference:", chrome.runtime.lastError.message);
                    applyZenyDisplayPreferenceAndRender();
                });
            } else {
                applyZenyDisplayPreferenceAndRender();
            }
        });
    });

    function loadLastUpdatedTimestamp() {
        if (zenyCrawlLastUpdated && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get([ZenyCrawlLastUpdatedStorageKey], (result) => {
                if (chrome.runtime.lastError) {
                    console.error("Error loading last updated timestamp:", chrome.runtime.lastError.message);
                    return;
                }
                const timestamp = result[ZenyCrawlLastUpdatedStorageKey];
                if (timestamp && typeof timestamp === 'number') {
                    zenyCrawlLastUpdated.textContent = `前回取得: ${formatTimestampToYyyyMmDdHhMmSs(timestamp)}`;
                    checkCooldown(timestamp);
                }
            });
        }
    }

    function loadStoredCrawlResults() {
        if (zenyCrawlResultsOutput && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get([ZenyCrawlResultsStorageKey], (result) => {
                if (chrome.runtime.lastError) {
                    console.error("Error loading stored crawl results:", chrome.runtime.lastError.message);
                    return;
                }
                const storedData = result[ZenyCrawlResultsStorageKey];
                if (storedData && Array.isArray(storedData)) {
                    zenyCrawlResultsOutput.innerHTML = formatCharacterDetailsToHtml(storedData as CharacterDetail[]);
                }
            });
        }
    }

    function formatCharacterDetailsToHtml(details: CharacterDetail[]): string {
        if (!details || details.length === 0) {
            return '<p class="text-gray-500">データがありません</p>';
        }
        const worldsData: { [worldValue: string]: { worldText: string, characters: CharacterDetail[], totalZeny: number } } = {};
        details.forEach(char => {
            if (!worldsData[char.value]) {
                worldsData[char.value] = { worldText: char.text, characters: [], totalZeny: 0 };
            }
            worldsData[char.value].characters.push(char);
            const zenyString = (char.zeny || "0").replace(/,/g, '').replace(/\s*Zeny/i, '');
            const zenyAmount = parseInt(zenyString, 10);
            if (!isNaN(zenyAmount)) {
                worldsData[char.value].totalZeny += zenyAmount;
            }
        });

        let html = '<div class="space-y-4">';
        for (const worldValue in worldsData) {
            const world = worldsData[worldValue];
            let totalZenyDisplay: string;

            if (currentZenyDisplayPreference === 'full') {
                totalZenyDisplay = formatActualZeny(world.totalZeny);
            } else {
                totalZenyDisplay = `<span class="zeny-value" tabindex="0" data-actual-zeny="${world.totalZeny}">${formatZenyForDisplay(world.totalZeny)}</span>`;
            }

            html += `<div class="p-3 bg-gray-50 rounded-md shadow-sm">`;
            html += `<h3 class="text-lg font-semibold text-blue-800">${world.worldText} (合計: ${totalZenyDisplay})</h3>`;
            if (world.characters.length > 0) {
                html += '<ul class="list-disc list-inside ml-4 mt-2 space-y-1 text-sm">';
                world.characters.forEach(char => {
                    const charZenyString = (char.zeny || "0").replace(/,/g, '').replace(/\s*Zeny/i, '');
                    const charZenyAmount = parseInt(charZenyString, 10);
                    let charZenyDisplay: string;

                    if (isNaN(charZenyAmount)) {
                        charZenyDisplay = char.zeny || 'Zeny不明';
                    } else {
                        if (currentZenyDisplayPreference === 'full') {
                            charZenyDisplay = formatActualZeny(charZenyAmount);
                        } else {
                            charZenyDisplay = `<span class="zeny-value" tabindex="0" data-actual-zeny="${charZenyAmount}">${formatZenyForDisplay(charZenyAmount)}</span>`;
                        }
                    }
                    html += `<li>${char.characterName || '不明なキャラクター'} (${charZenyDisplay})</li>`;
                });
                html += '</ul>';
            }
            html += `</div>`;
        }
        html += '</div>';
        return html;
    }

    function checkCooldown(lastExecutionTime: number) {
        if (!zenyCrawlButton || !zenyCrawlStatus) return;
        const now = Date.now();
        const timeSinceLastExecution = now - lastExecutionTime;

        if (timeSinceLastExecution < COOLDOWN_DURATION_MS) {
            zenyCrawlButton.disabled = true;
            zenyCrawlButton.classList.add('opacity-50', 'cursor-not-allowed', 'bg-gray-400', 'hover:bg-gray-400');
            zenyCrawlButton.classList.remove('bg-blue-500', 'hover:bg-blue-700');
            
            const updateRemainingTime = () => {
                const currentNow = Date.now();
                const newRemainingTimeMs = COOLDOWN_DURATION_MS - (currentNow - lastExecutionTime);
                if (newRemainingTimeMs <= 0) {
                    zenyCrawlStatus.textContent = '再実行可能です';
                    zenyCrawlButton.disabled = false;
                    zenyCrawlButton.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-400', 'hover:bg-gray-400'); // クールダウン解除時のスタイル
                    zenyCrawlButton.classList.add('bg-indigo-600', 'hover:bg-indigo-700'); // 新しい色
                    if (cooldownIntervalId) clearInterval(cooldownIntervalId);
                    cooldownIntervalId = null;
                } else {
                    const minutes = Math.floor(newRemainingTimeMs / 60000);
                    const seconds = Math.floor((newRemainingTimeMs % 60000) / 1000);
                    zenyCrawlStatus.textContent = `再実行可能まであと ${minutes}分${seconds}秒`;
                }
            };
            if (cooldownIntervalId) clearInterval(cooldownIntervalId);
            updateRemainingTime();
            cooldownIntervalId = window.setInterval(updateRemainingTime, 1000);
        } else {
            zenyCrawlButton.disabled = false;
            zenyCrawlButton.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-400', 'hover:bg-gray-400'); // クールダウン終了時のスタイル
            zenyCrawlButton.classList.add('bg-indigo-600', 'hover:bg-indigo-700'); // 新しい色
            if (zenyCrawlStatus) {
                zenyCrawlStatus.textContent = '再実行可能です';
            }
            if (cooldownIntervalId) {
                clearInterval(cooldownIntervalId);
                cooldownIntervalId = null;
            }
        }
    }

    if (zenyCrawlButton && zenyCrawlStatus && zenyCrawlResultsOutput) {
        zenyCrawlButton.addEventListener('click', async () => {
            if (!zenyCrawlStatus || !zenyCrawlResultsOutput || !zenyCrawlButton || zenyCrawlButton.disabled) return;

            zenyCrawlStatus.textContent = '情報収集中...';
            zenyCrawlStatus.classList.remove('text-red-500', 'text-green-500', 'text-yellow-600');
            zenyCrawlButton.disabled = true;
            zenyCrawlResultsOutput.textContent = '';

            try {
                const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (activeTab && activeTab.id && activeTab.url && targetUrlPattern.test(activeTab.url)) {
                    zenyCrawlStatus.textContent = `対象ページでワールドリストを取得中...`;
                    await chrome.scripting.executeScript({
                        target: { tabId: activeTab.id },
                        files: ["/tools/js/zeny-characterpage-scraper.js"],
                    });

                    const worldOptionsResults = await chrome.scripting.executeScript<[], WorldInfo[] | null>({
                        target: { tabId: activeTab.id },
                        func: () => (window as any).getWorldOptionsFromPage ? (window as any).getWorldOptionsFromPage() : null,
                    });

                    if (!worldOptionsResults || !worldOptionsResults[0] || !worldOptionsResults[0].result) {
                        zenyCrawlStatus.textContent = 'ワールドリストの取得に失敗しました';
                        zenyCrawlStatus.classList.add('text-red-500');
                        return;
                    }
                    const worldOptions = worldOptionsResults[0].result;
                    if (worldOptions.length === 0) {
                        zenyCrawlStatus.textContent = '収集対象のワールドが見つかりませんでした';
                        return;
                    }

                    const allCharacterDetails: CharacterDetail[] = [];
                    for (const world of worldOptions) {
                        zenyCrawlStatus.textContent = `${world.text} のキャラクターURLリストを収集中...`;
                        const characterPageLinksResult = await chrome.scripting.executeScript<[string, string], CharacterPageLink[] | null>({
                            target: { tabId: activeTab.id },
                            func: (worldVal, worldTxt) => (window as any).scrapeCharacterLinksForWorld ? (window as any).scrapeCharacterLinksForWorld(worldVal, worldTxt) : null,
                            args: [world.value, world.text]
                        });

                        if (characterPageLinksResult && characterPageLinksResult[0] && characterPageLinksResult[0].result) {
                            const characterPageLinks = characterPageLinksResult[0].result;
                            for (const pageLink of characterPageLinks) {
                                let displayUrl = pageLink.href;
                                if (displayUrl.length > 60) {
                                    displayUrl = displayUrl.substring(0, 30) + "..." + displayUrl.substring(displayUrl.length - 25);
                                }
                                zenyCrawlStatus.textContent = `${pageLink.text} - ${displayUrl} から取得中...`;
                                const detailResult = await chrome.scripting.executeScript<[CharacterPageLink], CharacterDetail | null>({
                                    target: { tabId: activeTab.id },
                                    func: (charPageLink) => (window as any).scrapeCharacterDetails ? (window as any).scrapeCharacterDetails(charPageLink) : null,
                                    args: [pageLink]
                                });
                                if (detailResult && detailResult[0] && detailResult[0].result) {
                                    allCharacterDetails.push(detailResult[0].result);
                                } else {
                                    allCharacterDetails.push({ ...pageLink, characterName: "取得失敗", zeny: "取得失敗" });
                                }
                            }
                        }
                    }

                    const now = Date.now();
                    if (allCharacterDetails.length > 0) {
                        zenyCrawlResultsOutput.innerHTML = formatCharacterDetailsToHtml(allCharacterDetails);
                        zenyCrawlStatus.textContent = '取得が完了しました';
                        if (chrome.storage && chrome.storage.local) {
                            chrome.storage.local.set({ [ZenyCrawlLastUpdatedStorageKey]: now, [ZenyCrawlResultsStorageKey]: allCharacterDetails }, () => {
                                if (chrome.runtime.lastError) console.error("Error saving crawl data:", chrome.runtime.lastError.message);
                                if (zenyCrawlLastUpdated) zenyCrawlLastUpdated.textContent = `前回取得: ${formatTimestampToYyyyMmDdHhMmSs(now)}`;
                                checkCooldown(now);
                            });
                        } else { checkCooldown(now); }
                    } else {
                        zenyCrawlResultsOutput.textContent = '収集対象のキャラクターは見つかりませんでした';
                        zenyCrawlStatus.textContent = '取得完了 (データなし)';
                        if (chrome.storage && chrome.storage.local && zenyCrawlLastUpdated) {
                            chrome.storage.local.set({ [ZenyCrawlLastUpdatedStorageKey]: now }, () => {
                                if (chrome.runtime.lastError) console.error("Error saving last updated timestamp (no data):", chrome.runtime.lastError.message);
                                else zenyCrawlLastUpdated.textContent = `前回取得: ${formatTimestampToYyyyMmDdHhMmSs(now)}`;
                                checkCooldown(now);
                            });
                        } else { checkCooldown(now); }
                    }
                } else {
                    zenyCrawlStatus.textContent = 'アクティブなタブがキャラクター情報ページではありません';
                    zenyCrawlStatus.classList.add('text-red-500');
                    if (activeTab && activeTab.url) zenyCrawlResultsOutput.textContent = `現在のURL: ${activeTab.url}`;
                    else zenyCrawlResultsOutput.textContent = `アクティブなタブが見つからないか、URLがありません`;
                    zenyCrawlButton.disabled = false; // 対象外ページならボタンは再度有効に
                }
            } catch (error: any) {
                console.error('Zeny情報取得に失敗しました:', error);
                zenyCrawlStatus.textContent = `エラー: ${error.message}`;
                zenyCrawlStatus.classList.add('text-red-500');
                zenyCrawlResultsOutput.textContent = '処理中にエラーが発生しました。コンソールで詳細を確認してください。';
                // エラー発生時はクールダウンを開始せず、ボタンを再度有効にするか検討
                // checkCooldown(0); // 即再試行可能にする場合
                zenyCrawlButton.disabled = false; // エラー時はボタンを再度有効に
            }
        });

        if (zenyCrawlResultsOutput) {
            zenyCrawlResultsOutput.addEventListener('focusin', (event) => {
                if (currentZenyDisplayPreference === 'short') {
                    const target = event.target as HTMLElement;
                    if (target.classList.contains('zeny-value') && target.dataset.actualZeny) {
                        const actualZenyValue = parseInt(target.dataset.actualZeny, 10);
                        if (!isNaN(actualZenyValue)) target.textContent = formatActualZeny(actualZenyValue);
                    }
                }
            });
            zenyCrawlResultsOutput.addEventListener('focusout', (event) => {
                if (currentZenyDisplayPreference === 'short') {
                    const target = event.target as HTMLElement;
                    if (target.classList.contains('zeny-value') && target.dataset.actualZeny) {
                        const actualZenyValue = parseInt(target.dataset.actualZeny, 10);
                        if (!isNaN(actualZenyValue)) target.textContent = formatZenyForDisplay(actualZenyValue);
                    }
                }
            });
        }
    } else {
        console.warn("Zeny crawler UI elements not fully found.");
    }

    async function initializeZenyCrawlFeatureState() {
        if (!zenyCrawlButton || !zenyCrawlStatus || !zenyCrawlLastUpdated) {
            console.warn("Zeny crawl feature elements are not fully available for state initialization.");
            return;
        }
        try {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab && activeTab.url && targetUrlPattern.test(activeTab.url)) {
                loadLastUpdatedTimestamp(); // これが checkCooldown を呼ぶ
            } else {
                zenyCrawlButton.disabled = true;
                zenyCrawlButton.classList.add('opacity-50', 'cursor-not-allowed', 'bg-gray-400', 'hover:bg-gray-400');
                zenyCrawlButton.classList.remove('bg-indigo-600', 'hover:bg-indigo-700'); // 対象外ページの場合に削除するクラスも更新
                zenyCrawlStatus.textContent = '取得対象外のページです';
                zenyCrawlStatus.classList.remove('text-green-500', 'text-red-500');
                zenyCrawlStatus.classList.add('text-yellow-600');
                zenyCrawlLastUpdated.textContent = '';
            }
        } catch (error: any) {
            console.error("Error initializing Zeny crawl button state:", error);
            if (zenyCrawlStatus) {
                zenyCrawlStatus.textContent = `ボタン状態の初期化エラー: ${error.message}`;
                zenyCrawlStatus.classList.add('text-red-500');
            }
            if (zenyCrawlButton) zenyCrawlButton.disabled = true;
        }
    }

    initializeZenyCrawlFeatureState();
    loadZenyDisplayPreference(); // これが loadStoredCrawlResults を呼ぶ
}