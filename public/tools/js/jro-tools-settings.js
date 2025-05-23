document.addEventListener('DOMContentLoaded', () => {
  // 設定項目を定義
  const features = [
    { id: 'toggle-feature-a', key: 'featureA', defaultValue: false },
    { id: 'toggle-feature-b', key: 'featureB', defaultValue: true },
    { id: 'toggle-feature-c', key: 'featureC', defaultValue: false }
  ];

  // 各機能のDOM要素と現在の状態を保持するオブジェクトのマップ
  const featureControls = new Map();

  features.forEach(feature => {
    const checkboxElement = document.getElementById(feature.id);
    if (checkboxElement instanceof HTMLInputElement) {
      featureControls.set(feature.key, {
        element: checkboxElement,
        defaultValue: feature.defaultValue,
        // containerElement: document.getElementById(feature.containerId) // 必要であれば
      });
    } else {
      console.warn(`Checkbox element with ID "${feature.id}" not found or not an input element.`);
    }
  });

  // デバウンス関数
  function debounce(func, delay) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), delay);
    };
  }

  // UI（チェックボックスの状態）を更新する関数
  function updateCheckboxState(key,isChecked) {
    const control = featureControls.get(key);
    if (control && control.element.checked !== isChecked) {
      control.element.checked = isChecked;
      // peer-checked: スタイルがCSSで適用されるように、イベントを意図的に発火
      // これにより、ブラウザに状態変更を通知し、CSSの再評価を促します。
      // ただし、これが原因で無限ループや過剰な書き込みが発生しないように注意が必要。
      // 今回は、ユーザー操作時のみ保存するため、loadSettings時はこのイベント発火は不要かもしれません。
      // control.element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }


  // 初期状態をストレージから読み込み、UIに反映する関数
  async function loadSettings() {
    const keysToGet = features.map(f => f.key);
    try {
      const result = await new Promise((resolve, reject) => {
        chrome.storage.sync.get(keysToGet, (data) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(data);
          }
        });
      });

      featureControls.forEach((control, key) => {
        const storedValue = result[key];
        const valueToSet = storedValue !== undefined ? storedValue : control.defaultValue;
        updateCheckboxState(key, valueToSet);
      });
      console.log('Settings loaded and UI updated.');

    } catch (error) {
      console.error(`Error loading settings: ${error.message || 'Unknown error'}`);
      // エラー発生時はデフォルト値をUIに適用
      featureControls.forEach((control, key) => {
        updateCheckboxState(key, control.defaultValue);
      });
    }
  }

  // 設定をストレージに保存する関数
  async function saveSetting(key, value) {
    const settings = { [key]: value }; // ES6のComputedPropertyNameで簡潔に
    try {
      await new Promise((resolve, reject) => {
        chrome.storage.sync.set(settings, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
      console.log(`Setting saved: ${key} = ${value}`);
    } catch (error) {
      console.error(`Error saving setting ${key}: ${error.message || 'Unknown error'}`);
    }
  }

  // デバウンスされた保存関数 (書き込み頻度を抑えるため500ミリ秒の遅延)
  const debouncedSaveSetting = debounce(saveSetting, 500);

  // 各チェックボックスにイベントリスナーを設定
  featureControls.forEach((control, key) => {
    control.element.addEventListener('change', (event) => {
      // ユーザー操作による変更の場合のみ保存処理を行う
      if (event.isTrusted) { // isTrusted はユーザー起因のイベントで true
        const newValue = control.element.checked;
        // UIの更新はCSSのpeer-checkedに任せる。
        // updateCheckboxState(key, newValue); // ここで再度UIを更新する必要はないはず
        debouncedSaveSetting(key, newValue);
      }
    });
  });

  // 初期設定を読み込む
  loadSettings();
});
