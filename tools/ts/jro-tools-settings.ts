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

    // --- 所持Zeny情報収集機能 ---
    const zenyCrawlButton = document.getElementById('zeny-crawl-button') as HTMLButtonElement | null;
    const zenyCrawlStatus = document.getElementById('zeny-crawl-status') as HTMLElement | null;
    const zenyCrawlResultsOutput = document.getElementById('zeny-crawl-results-output') as HTMLElement | null;
    const zenyCrawlLastUpdated = document.getElementById('zeny-crawl-last-updated') as HTMLElement | null; // 前回更新日時表示用

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
                    zenyCrawlLastUpdated.textContent = `前回更新: ${new Date(timestamp).toLocaleString()}`;
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
                    if (zenyCrawlStatus) zenyCrawlStatus.textContent = '前回の収集結果を表示しています。';
                }
            });
        }
    }

    // 収集結果を整形してHTML文字列を生成する関数
    function formatCharacterDetailsToHtml(details: CharacterDetail[]): string {
        if (!details || details.length === 0) {
            return '<p class="text-gray-500">データがありません。</p>';
        }

        // ワールドごとにグループ化
        const worldsData: { [worldValue: string]: { worldText: string, characters: CharacterDetail[], totalZeny: number } } = {};
        details.forEach(char => {
            if (!worldsData[char.value]) {
                worldsData[char.value] = { worldText: char.text, characters: [], totalZeny: 0 };
            }
            worldsData[char.value].characters.push(char);
            // Zenyを数値に変換して合計 (カンマ区切りと "Zeny" を除去)
            const zenyAmount = parseInt((char.zeny || "0").replace(/,/g, '').replace(/\s*Zeny/i, ''), 10);
            if (!isNaN(zenyAmount)) {
                worldsData[char.value].totalZeny += zenyAmount;
            }
        });

        let html = '<div class="space-y-4">';
        for (const worldValue in worldsData) {
            const world = worldsData[worldValue];
            html += `<div class="p-3 bg-gray-50 rounded-md shadow-sm">`;
            html += `<h3 class="text-lg font-semibold text-blue-800">${world.worldText} (合計: ${world.totalZeny.toLocaleString()} Zeny)</h3>`;
            if (world.characters.length > 0) {
                html += '<ul class="list-disc list-inside ml-4 mt-2 space-y-1 text-sm">';
                world.characters.forEach(char => {
                    html += `<li>${char.characterName || '不明なキャラクター'} (${char.zeny || 'Zeny不明'} Zeny)</li>`;
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
                    zenyCrawlStatus.textContent = '再実行可能です。';
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
            if (zenyCrawlStatus.textContent?.startsWith('再実行可能まであと')) {
                 zenyCrawlStatus.textContent = '前回の収集結果を表示しています。';
            }
        }
    }

    if (zenyCrawlButton && zenyCrawlStatus && zenyCrawlResultsOutput) {
        zenyCrawlButton.addEventListener('click', async () => {
            if (!zenyCrawlStatus || !zenyCrawlResultsOutput || !zenyCrawlButton) return; // Null check

            // クールダウンチェックは loadLastUpdatedTimestamp -> checkCooldown で行われるが、念のためここでも簡易チェック
            if (zenyCrawlButton.disabled && zenyCrawlStatus.textContent?.startsWith('再実行可能まであと')) {
                // 既にクールダウンメッセージが表示されていれば何もしない
                return;
            }

            zenyCrawlStatus.textContent = '情報収集中...';            zenyCrawlStatus.classList.remove('text-red-500', 'text-green-500');
            zenyCrawlButton.disabled = true;
            zenyCrawlResultsOutput.textContent = ''; // 前回の結果をクリア

            const targetUrlPattern = /^https:\/\/rowebtool\.gungho\.jp\/character\/\w+\/\d+$/;

            try {
                const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

                if (activeTab && activeTab.id && activeTab.url && targetUrlPattern.test(activeTab.url)) {
                    zenyCrawlStatus.textContent = `対象ページでワールドリストを取得中...`;

                    // Step 1: スクレート対象のスクリプトファイルを注入
                    // Webpackの出力が dist/tools/js/zeny-characterpage-scraper.js で、
                    // 拡張機能のルートが dist/ の場合、パスは /tools/js/zeny-characterpage-scraper.js
                    await chrome.scripting.executeScript({
                        target: { tabId: activeTab.id },
                        files: ["/tools/js/zeny-characterpage-scraper.js"], // manifest.jsonのweb_accessible_resourcesと合わせる
                    });

                    // Step 2: ワールドリストを取得
                    const worldOptionsResults = await chrome.scripting.executeScript<[], WorldInfo[] | null>({
                        target: { tabId: activeTab.id },
                        func: () => {
                            if (typeof (window as any).getWorldOptionsFromPage === 'function') {
                                return (window as any).getWorldOptionsFromPage();
                            }
                            return null;
                        },
                    });

                    if (!worldOptionsResults || !worldOptionsResults[0] || !worldOptionsResults[0].result) {
                        zenyCrawlStatus.textContent = 'ワールドリストの取得に失敗しました。';
                        zenyCrawlStatus.classList.add('text-red-500');
                        zenyCrawlButton.disabled = false;
                        return;
                    }

                    const worldOptions = worldOptionsResults[0].result;
                    if (worldOptions.length === 0) {
                        zenyCrawlStatus.textContent = '処理対象のワールドが見つかりませんでした。';
                        zenyCrawlButton.disabled = false;
                        return;
                    }

                    const allCharacterDetails: CharacterDetail[] = []; // 収集した全キャラクター詳細を格納

                    for (const world of worldOptions) {
                        zenyCrawlStatus.textContent = `${world.text} のキャラクターURLリストを収集中...`; // ステータス更新
                        
                        const characterPageLinksResult = await chrome.scripting.executeScript<[string, string], CharacterPageLink[] | null>({
                            target: { tabId: activeTab.id },
                            func: (worldVal, worldTxt) => { // 引数を渡す
                                if (typeof (window as any).scrapeCharacterLinksForWorld === 'function') {
                                    return (window as any).scrapeCharacterLinksForWorld(worldVal, worldTxt);
                                }
                                return null;
                            },
                            args: [world.value, world.text] // 関数に渡す引数
                        });

                        if (characterPageLinksResult && characterPageLinksResult[0] && characterPageLinksResult[0].result) {
                            const characterPageLinks = characterPageLinksResult[0].result;
                            for (const pageLink of characterPageLinks) {
                                // ステータス更新: どのキャラクターのページを収集中か表示
                                let displayUrl = pageLink.href;
                                if (displayUrl.length > 60) { // URLが長い場合は短縮
                                    displayUrl = displayUrl.substring(0, 30) + "..." + displayUrl.substring(displayUrl.length - 25);
                                }
                                zenyCrawlStatus.textContent = `${pageLink.text} - ${displayUrl} の詳細を収集中...`;

                                const detailResult = await chrome.scripting.executeScript<[CharacterPageLink], CharacterDetail | null>({
                                    target: { tabId: activeTab.id },
                                    func: (charPageLink) => {
                                        if (typeof (window as any).scrapeCharacterDetails === 'function') {
                                            return (window as any).scrapeCharacterDetails(charPageLink);
                                        }
                                        return null;
                                    },
                                    args: [pageLink]
                                });

                                if (detailResult && detailResult[0] && detailResult[0].result) {
                                    allCharacterDetails.push(detailResult[0].result);
                                } else {
                                    // 詳細取得に失敗した場合でも、元々のリンク情報とエラーを示す情報を追加することも可能
                                    allCharacterDetails.push({ ...pageLink, characterName: "詳細取得失敗", zeny: "詳細取得失敗" });
                                }
                            }
                        }
                    }

                    // 全ての処理が完了
                    if (allCharacterDetails.length > 0) {
                            // zenyCrawlResultsOutput.textContent = JSON.stringify(allCharacterDetails, null, 2);
                            zenyCrawlResultsOutput.innerHTML = formatCharacterDetailsToHtml(allCharacterDetails);
                            zenyCrawlStatus.textContent = '情報収集が完了しました。';
                            zenyCrawlStatus.classList.add('text-green-500');
                            // 成功時に現在日時を保存・表示
                            const now = Date.now();
                            if (chrome.storage && chrome.storage.local) { // storage APIの存在確認
                                chrome.storage.local.set({ [ZenyCrawlLastUpdatedStorageKey]: now }, () => {
                                    if (chrome.runtime.lastError) {
                                        console.error("Error saving last updated timestamp:", chrome.runtime.lastError.message);
                                    } else if (zenyCrawlLastUpdated) {
                                        zenyCrawlLastUpdated.textContent = `前回更新: ${new Date(now).toLocaleString()}`;
                                        checkCooldown(now); // 実行後にもクールダウン開始
                                    }
                                });
                                // 収集結果も保存
                                chrome.storage.local.set({ [ZenyCrawlResultsStorageKey]: allCharacterDetails }, () => {
                                    if (chrome.runtime.lastError) {
                                        console.error("Error saving crawl results:", chrome.runtime.lastError.message);
                                    }
                                });
                            }
                        } else {
                            zenyCrawlResultsOutput.textContent = '収集対象のキャラクターは見つかりませんでした。';
                            zenyCrawlStatus.textContent = '情報収集完了 (データなし)。';
                        }

                } else {
                    zenyCrawlStatus.textContent = 'アクティブなタブが対象のキャラクター情報ページではありません。';
                    zenyCrawlStatus.classList.add('text-red-500');
                    if (activeTab && activeTab.url) {
                        zenyCrawlResultsOutput.textContent = `現在のURL: ${activeTab.url}\n期待するパターン: ${targetUrlPattern.toString()}`;
                    } else {
                        zenyCrawlResultsOutput.textContent = `アクティブなタブが見つからないか、URLがありません。`;
                    }
                }
            } catch (error: any) {
                console.error('Zeny情報収集に失敗しました:', error);
                zenyCrawlStatus.textContent = `エラー: ${error.message}`;
                zenyCrawlStatus.classList.add('text-red-500');
                zenyCrawlResultsOutput.textContent = '処理中にエラーが発生しました。コンソールで詳細を確認してください。';
            } finally {
                // ボタンの有効/無効は checkCooldown が管理するため、ここでは直接変更しない。
                // ただし、エラー発生時など、クールダウン状態に関わらずボタンを有効にしたい場合は
                // checkCooldown(0); // これでクールダウンがリセットされ、ボタンが有効になる
                // または、ここで直接クラスを操作して有効化する
                // zenyCrawlButton.disabled = false;
                // zenyCrawlButton.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-400', 'hover:bg-gray-400');
                // zenyCrawlButton.classList.add('bg-blue-500', 'hover:bg-blue-700');
            }
        });
    } else {
        // 要素が見つからない場合の警告（デバッグ用）
        if (!zenyCrawlButton) console.warn("Element with ID 'zeny-crawl-button' not found.");
        if (!zenyCrawlStatus) console.warn("Element with ID 'zeny-crawl-status' not found.");
        if (!zenyCrawlResultsOutput) console.warn("Element with ID 'zeny-crawl-results-output' not found.");
        if (!zenyCrawlLastUpdated) console.warn("Element with ID 'zeny-crawl-last-updated' not found.");
    }

    // 初期化時に前回更新日時を読み込む
    loadLastUpdatedTimestamp();
    loadStoredCrawlResults(); // 初期化時に保存された収集結果も読み込む
});