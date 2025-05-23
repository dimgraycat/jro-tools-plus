document.addEventListener('DOMContentLoaded', () => {
    const menuItems = document.querySelectorAll('aside nav ul li[class*="js-menu-"]');
    const pageElements = document.querySelectorAll('main[class*="js-pages-"]');
    const featureToggles = [
        document.getElementById('toggle-feature-a'),
        document.getElementById('toggle-feature-b'),
        document.getElementById('toggle-feature-c')
    ].filter(toggle => toggle !== null);

    function updateActiveState() {
        const currentHash = window.location.hash;
        const targetId = currentHash.substring(1);

        // メニューの選択状態を更新
        menuItems.forEach(li => {
            const link = li.querySelector('a');
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
        const firstMenuLink = menuItems[0]?.querySelector('a')?.getAttribute('href');
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
            featureToggles.forEach(toggle => {
                if (result[toggle.id] !== undefined) {
                    toggle.checked = result[toggle.id];
                }
            });
        });
    }

    // トグル設定をストレージに保存する
    function saveToggleSetting(toggleId, isChecked) {
        if (!(chrome && chrome.storage && chrome.storage.local)) {
            // console.warn("chrome.storage.local is not available. Toggle state not saved.");
            return;
        }
        const setting = {};
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
            saveToggleSetting(event.target.id, event.target.checked);
        });
    });

    window.addEventListener('hashchange', updateActiveState);
    initialize();
    loadToggleSettings();
});