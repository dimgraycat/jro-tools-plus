export function initializeFeatureToggles(): void {
    const featureToggles: HTMLInputElement[] = [
        document.getElementById('toggle-feature-a'),
        document.getElementById('toggle-feature-b'),
        document.getElementById('toggle-feature-c')
    ].filter(toggle => toggle !== null) as HTMLInputElement[];

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

    featureToggles.forEach(toggle => {
        toggle.addEventListener('change', (event) => {
            const target = event.target as HTMLInputElement;
            saveToggleSetting(target.id, target.checked);
        });
    });

    loadToggleSettings();
}