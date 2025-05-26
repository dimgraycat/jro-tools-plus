interface WorldInfo { // zeny-characterpage-scraper.ts と同じ定義
  value: string;
  text: string;
}

// zeny-characterpage-scraper.ts と同じ定義
interface CharacterPageLink extends WorldInfo {
  href: string;
}

interface CharacterDetail extends CharacterPageLink {
  characterName?: string;
  zeny?: string;
}

// Zeny表示設定のストレージキー
const ZENY_DISPLAY_PREFERENCE_KEY = 'zenyDisplayPreference';
let currentZenyDisplayPreference = 'full'; // デフォルトは全桁表示

// --- Zeny Formatting Helpers ---
// 数値をG (Giga) / M (Mega) 単位またはカンマ区切りでフォーマット (小数点3桁)
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

// 数値をカンマ区切りでフォーマット (実際のZeny表示用)
function formatActualZeny(zeny: number): string {
  if (isNaN(zeny) || zeny === null || typeof zeny === 'undefined') return "N/A";
  return zeny.toLocaleString() + " Zeny";
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

document.addEventListener('DOMContentLoaded', () => {
    const menuItems = document.querySelectorAll('aside nav ul li[class*="js-menu-"]');
    const pageElements = document.querySelectorAll('main[class*="js-pages-"]');
    const featureToggles: HTMLInputElement[] = [
        document.getElementById('toggle-feature-a'),
        document.getElementById('toggle-feature-b'),
        document.getElementById('toggle-feature-c')
    ].filter(toggle => toggle !== null) as HTMLInputElement[];

    function updateActiveState() {
        const currentHash = window.location.hash;
        const targetId = currentHash.substring(1);

        // メニューの選択状態を更新
        menuItems.forEach(li => {
            const link = li.querySelector('a') as HTMLAnchorElement | null;
            if (!link) return;
            const linkHref = link.getAttribute('href');

            li.classList.remove('bg-gray-100', 'border-blue-500');
            link.classList.remove('text-blue-600', 'font-semibold');
            li.classList.add('border-white');
            link.classList.add('text-gray-700');

            if (linkHref === currentHash) {
                li.classList.add('bg-gray-100', 'border-blue-500');
                link.classList.add('text-blue-600', 'font-semibold');
                li.classList.remove('border-white');
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

    // トグル設定をストレージから読み込む
    function loadToggleSettings() {
        if (!(chrome && chrome.storage && chrome.storage.local)) {
            console.warn("chrome.storage.local is not available. Toggle states will not be persisted.");
            return;
        }

        const keysToGet = featureToggles.map(toggle => toggle.id);
        chrome.storage.local.get(keysToGet, (result) => {
            if (chrome.runtime.lastError) {
                console.error("Error loading toggle settings:", chrome.runtime.lastError.message);
                return;
            }
            featureToggles.forEach(toggle => { // toggle is HTMLInputElement here
                if (toggle && result[toggle.id] !== undefined) {
                    toggle.checked = result[toggle.id];
                }
            });
        });
    }

    // トグル設定をストレージに保存する
    function saveToggleSetting(toggleId: string, isChecked: boolean) {
        if (!(chrome && chrome.storage && chrome.storage.local)) {
            return;
        }
        const setting: { [key: string]: boolean } = {};
        setting[toggleId] = isChecked;
        chrome.storage.local.set(setting, () => {
            if (chrome.runtime.lastError) {
                console.error("Error saving toggle setting for " + toggleId + ":", chrome.runtime.lastError.message);
            }
        });
    }

    // 各トグルスイッチに変更イベントリスナーを追加
    featureToggles.forEach(toggle => {
        toggle.addEventListener('change', (event) => {
            const target = event.target as HTMLInputElement;
            saveToggleSetting(target.id, target.checked);
        });
    });

    window.addEventListener('hashchange', updateActiveState);
    initialize();
    loadToggleSettings();

    // Zeny表示形式ラジオボタンの処理
    const zenyDisplayModeRadios = document.querySelectorAll<HTMLInputElement>('input[name="zenyDisplayMode"]');

    function applyZenyDisplayPreferenceAndRender() {
        // 保存された収集結果を現在の表示設定で再表示
        loadStoredCrawlResults();
    }

    function loadZenyDisplayPreference() {
        if (chrome.storage && chrome.storage.local) {
            chrome.storage.local.get([ZENY_DISPLAY_PREFERENCE_KEY], (result) => {
                if (chrome.runtime.lastError) {
                    console.error("Error loading Zeny display preference:", chrome.runtime.lastError.message);
                } else {
                    currentZenyDisplayPreference = result[ZENY_DISPLAY_PREFERENCE_KEY] || 'full'; // ストレージに設定がなければ全桁表示
                }
                zenyDisplayModeRadios.forEach(radio => {
                    radio.checked = (radio.value === currentZenyDisplayPreference);
                });
                applyZenyDisplayPreferenceAndRender(); // 設定を読み込んだ後に表示を更新
            });
        } else {
            // ストレージが利用できない場合はデフォルト設定で表示
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
                    applyZenyDisplayPreferenceAndRender(); // 設定変更後に表示を更新
                });
            } else {
                applyZenyDisplayPreferenceAndRender(); // ストレージがなくてもUI上は更新
            }
        });
    });

    // --- 所持Zeny情報収集機能 ---
    const zenyCrawlButton = document.getElementById('zeny-crawl-button') as HTMLButtonElement | null;
    const zenyCrawlStatus = document.getElementById('zeny-crawl-status') as HTMLElement | null;
    const zenyCrawlResultsOutput = document.getElementById('zeny-crawl-results-output') as HTMLElement | null;
    const zenyCrawlLastUpdated = document.getElementById('zeny-crawl-last-updated') as HTMLElement | null; // 前回取得日時表示用

    const targetUrlPattern = /^https:\/\/rowebtool\.gungho\.jp\/character\/\w+\/\d+$/;

    const ZenyCrawlLastUpdatedStorageKey = 'zenyCrawlLastUpdatedTimestamp';
    const ZenyCrawlResultsStorageKey = 'zenyCrawlResultsData'; // 収集結果保存用キー
    const COOLDOWN_DURATION_MS = 5 * 60 * 1000; // 5分間のクールダウン

    // 前回更新日時を読み込んで表示する関数
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
                    checkCooldown(timestamp); // クールダウン状態も確認
                }
            });
        }
    }

    // 保存された収集結果を読み込んで表示する関数
    function loadStoredCrawlResults() {
        if (zenyCrawlResultsOutput && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get([ZenyCrawlResultsStorageKey], (result) => {
                if (chrome.runtime.lastError) {
                    console.error("Error loading stored crawl results:", chrome.runtime.lastError.message);
                    return;
                }
                const storedData = result[ZenyCrawlResultsStorageKey];
                if (storedData && Array.isArray(storedData)) {
                    // zenyCrawlResultsOutput.textContent = JSON.stringify(storedData, null, 2);
                    zenyCrawlResultsOutput.innerHTML = formatCharacterDetailsToHtml(storedData as CharacterDetail[]);
                    // ステータス表示は checkCooldown や実行中のメッセージで管理するため、ここでは更新しない。
                }
            });
        }
    }

    // 収集結果を整形してHTML文字列を生成する関数
    function formatCharacterDetailsToHtml(details: CharacterDetail[]): string {
        if (!details || details.length === 0) {
            return '<p class="text-gray-500">データがありません</p>';
        }

        // ワールドごとにグループ化
        const worldsData: { [worldValue: string]: { worldText: string, characters: CharacterDetail[], totalZeny: number } } = {};
        details.forEach(char => {
            if (!worldsData[char.value]) {
                worldsData[char.value] = { worldText: char.text, characters: [], totalZeny: 0 };
            }
            worldsData[char.value].characters.push(char);
            // Zenyを数値に変換して合計 (カンマ区切りと "Zeny" を除去)
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
            } else { // 'short' or default
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
                        } else { // 'short'
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

    // クールダウン状態を確認し、ボタンの状態と残り時間を更新する関数
    let cooldownIntervalId: number | null = null;
    function checkCooldown(lastExecutionTime: number) {
        if (!zenyCrawlButton || !zenyCrawlStatus) return;

        const now = Date.now();
        const timeSinceLastExecution = now - lastExecutionTime;

        if (timeSinceLastExecution < COOLDOWN_DURATION_MS) {
            zenyCrawlButton.disabled = true;
            zenyCrawlButton.classList.add('opacity-50', 'cursor-not-allowed', 'bg-gray-400', 'hover:bg-gray-400');
            zenyCrawlButton.classList.remove('bg-blue-500', 'hover:bg-blue-700');
            const remainingTimeMs = COOLDOWN_DURATION_MS - timeSinceLastExecution;
            
            const updateRemainingTime = () => {
                const currentNow = Date.now();
                const newRemainingTimeMs = COOLDOWN_DURATION_MS - (currentNow - lastExecutionTime);
                if (newRemainingTimeMs <= 0) {
                    zenyCrawlStatus.textContent = '再実行可能です';
                    zenyCrawlButton.disabled = false;
                    zenyCrawlButton.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-400', 'hover:bg-gray-400');
                    zenyCrawlButton.classList.add('bg-blue-500', 'hover:bg-blue-700');
                    if (cooldownIntervalId) clearInterval(cooldownIntervalId);
                    cooldownIntervalId = null;
                } else {
                    const minutes = Math.floor(newRemainingTimeMs / 60000);
                    const seconds = Math.floor((newRemainingTimeMs % 60000) / 1000);
                    zenyCrawlStatus.textContent = `再実行可能まであと ${minutes}分${seconds}秒`;
                }
            };

            if (cooldownIntervalId) clearInterval(cooldownIntervalId);
            updateRemainingTime(); // 初回実行
            cooldownIntervalId = window.setInterval(updateRemainingTime, 1000);
        } else {
            zenyCrawlButton.disabled = false;
            zenyCrawlButton.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-400', 'hover:bg-gray-400');
            zenyCrawlButton.classList.add('bg-blue-500', 'hover:bg-blue-700');
            if (zenyCrawlStatus) {
                // クールダウンが終了していれば「再実行可能です」と表示。
                // 収集中やエラー表示の場合は、それぞれのハンドラでメッセージが設定される。
                zenyCrawlStatus.textContent = '再実行可能です';
            }
            // クールダウンタイマーが動いていればクリア
            if (cooldownIntervalId) {
                clearInterval(cooldownIntervalId);
                cooldownIntervalId = null;
            }
        }
    }

    if (zenyCrawlButton && zenyCrawlStatus && zenyCrawlResultsOutput) {
        zenyCrawlButton.addEventListener('click', async () => {
            if (!zenyCrawlStatus || !zenyCrawlResultsOutput || !zenyCrawlButton) return; // Null check

            // ボタンが無効（クールダウン中など）なら何もしない
            if (zenyCrawlButton.disabled) {
                return;
            }

            zenyCrawlStatus.textContent = '情報収集中...';
            zenyCrawlStatus.classList.remove('text-red-500', 'text-green-500', 'text-yellow-600');
            zenyCrawlButton.disabled = true;
            zenyCrawlResultsOutput.textContent = ''; // 前回の結果をクリア

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

                    if (allCharacterDetails.length > 0) {
                        zenyCrawlResultsOutput.innerHTML = formatCharacterDetailsToHtml(allCharacterDetails);
                        zenyCrawlStatus.textContent = '取得が完了しました';
                        const now = Date.now();
                        if (chrome.storage && chrome.storage.local) {
                            chrome.storage.local.set({ [ZenyCrawlLastUpdatedStorageKey]: now }, () => {
                                if (chrome.runtime.lastError) {
                                    console.error("Error saving last updated timestamp:", chrome.runtime.lastError.message);
                                } else if (zenyCrawlLastUpdated) {
                                    zenyCrawlLastUpdated.textContent = `前回取得: ${formatTimestampToYyyyMmDdHhMmSs(now)}`;
                                    checkCooldown(now); // 実行後にもクールダウン開始
                                }
                            });
                            chrome.storage.local.set({ [ZenyCrawlResultsStorageKey]: allCharacterDetails }, () => {
                                if (chrome.runtime.lastError) {
                                    console.error("Error saving crawl results:", chrome.runtime.lastError.message);
                                }
                            });
                        }
                    } else {
                        zenyCrawlResultsOutput.textContent = '収集対象のキャラクターは見つかりませんでした';
                        zenyCrawlStatus.textContent = '取得完了 (データなし)';
                        // データなしの場合もクールダウンは開始する（API負荷軽減のため）
                        const now = Date.now();
                         if (chrome.storage && chrome.storage.local && zenyCrawlLastUpdated) {
                            chrome.storage.local.set({ [ZenyCrawlLastUpdatedStorageKey]: now }, () => {
                                if (chrome.runtime.lastError) console.error("Error saving last updated timestamp (no data):", chrome.runtime.lastError.message);
                                else zenyCrawlLastUpdated.textContent = `前回取得: ${formatTimestampToYyyyMmDdHhMmSs(now)}`;
                                checkCooldown(now);
                            });
                        } else {
                             checkCooldown(now); // ストレージがなくてもクールダウンは試みる
                        }
                    }

                } else {
                    zenyCrawlStatus.textContent = 'アクティブなタブがキャラクター情報ページではありません';
                    zenyCrawlStatus.classList.add('text-red-500');
                    if (activeTab && activeTab.url) {
                        zenyCrawlResultsOutput.textContent = `現在のURL: ${activeTab.url}`;
                    } else {
                        zenyCrawlResultsOutput.textContent = `アクティブなタブが見つからないか、URLがありません`;
                    }
                }
            } catch (error: any) {
                console.error('Zeny情報取得に失敗しました:', error);
                zenyCrawlStatus.textContent = `エラー: ${error.message}`;
                zenyCrawlStatus.classList.add('text-red-500');
                zenyCrawlResultsOutput.textContent = '処理中にエラーが発生しました。コンソールで詳細を確認してください。';
                // エラー発生時、ボタンは disabled のまま。
                // 必要であれば、ここで checkCooldown(0) を呼んでリセットし、ボタンを有効化することもできる。
                // 例: checkCooldown(0); // エラー後は即再試行可能にする場合
            } finally {
                // ボタンの有効/無効は checkCooldown が主に管理する。
                // 収集処理が正常に完了した場合（データあり/なし問わず）、checkCooldown(now) が呼ばれ、
                // クールダウンが開始され、ボタンは disabled になる。
                // 収集処理中にエラーが発生した場合や、対象ページでない場合は、ボタンは disabled のまま。
                // この finally ブロックでボタンの状態を強制的に変更する必要は基本的にはない。
            }
        });

        // Zeny表示のフォーカスイベントリスナー (zenyCrawlResultsOutput が確実に存在する場合に設定)
        if (zenyCrawlResultsOutput) {
            zenyCrawlResultsOutput.addEventListener('focusin', (event) => {
                if (currentZenyDisplayPreference === 'short') {
                    const target = event.target as HTMLElement;
                    if (target.classList.contains('zeny-value') && target.dataset.actualZeny) {
                        const actualZenyValue = parseInt(target.dataset.actualZeny, 10);
                        if (!isNaN(actualZenyValue)) {
                            target.textContent = formatActualZeny(actualZenyValue);
                        }
                    }
                }
            });

            zenyCrawlResultsOutput.addEventListener('focusout', (event) => {
                if (currentZenyDisplayPreference === 'short') {
                    const target = event.target as HTMLElement;
                    if (target.classList.contains('zeny-value') && target.dataset.actualZeny) {
                        const actualZenyValue = parseInt(target.dataset.actualZeny, 10);
                        if (!isNaN(actualZenyValue)) {
                            target.textContent = formatZenyForDisplay(actualZenyValue);
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
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (activeTab && activeTab.url && targetUrlPattern.test(activeTab.url)) {
                loadLastUpdatedTimestamp();
            } else {
                zenyCrawlButton.disabled = true;
                zenyCrawlButton.classList.add('opacity-50', 'cursor-not-allowed', 'bg-gray-400', 'hover:bg-gray-400');
                zenyCrawlButton.classList.remove('bg-blue-500', 'hover:bg-blue-700');
                
                zenyCrawlStatus.textContent = '取得対象外のページです';
                zenyCrawlStatus.classList.remove('text-green-500', 'text-red-500');
                zenyCrawlStatus.classList.add('text-yellow-600');

                zenyCrawlLastUpdated.textContent = '';
            }
            // loadStoredCrawlResults() は loadZenyDisplayPreference から呼ばれるのでここでは不要
            // loadLastUpdatedTimestamp(); // これは必要に応じてだが、表示設定読み込み後にまとめて行う
        } catch (error: any) {
            console.error("Error initializing Zeny crawl button state:", error);
            if (zenyCrawlStatus) {
                zenyCrawlStatus.textContent = `ボタン状態の初期化エラー: ${error.message}`;
                zenyCrawlStatus.classList.add('text-red-500');
            }
            if (zenyCrawlButton) zenyCrawlButton.disabled = true;
        }
    }

    initializeZenyCrawlFeatureState(); // ボタン状態などの初期設定
    loadZenyDisplayPreference(); // 表示設定を読み込み、それに基づいて結果を表示
});