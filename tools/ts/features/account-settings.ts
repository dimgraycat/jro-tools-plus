export function initializeAccountSettings(): void {
    const displayNameInput = document.getElementById('zeny-display-name-input') as HTMLInputElement | null;
    const updateDisplayNameButton = document.getElementById('zeny-update-display-name-button') as HTMLButtonElement | null;
    const toggleDisplayNameButton = document.getElementById('zeny-toggle-display-name-button') as HTMLButtonElement | null;
    const displayNameSection = document.getElementById('zeny-display-name-section') as HTMLDivElement | null;

    if (toggleDisplayNameButton && displayNameSection) {
        toggleDisplayNameButton.addEventListener('click', () => {
            displayNameSection.classList.toggle('hidden');
        });
    }

    if (displayNameInput && updateDisplayNameButton) {
        updateDisplayNameButton.addEventListener('click', () => {
            if (displayNameInput.hasAttribute('readonly')) {
                displayNameInput.removeAttribute('readonly');
                displayNameInput.focus();
                const icon = updateDisplayNameButton.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-pencil-alt');
                    icon.classList.add('fa-save');
                }
                updateDisplayNameButton.setAttribute('title', '変更を保存');
            } else {
                const newDisplayName = displayNameInput.value;

                // --- ここに表示名を保存する具体的なロジックを実装します ---
                // const selectedTarget = (document.getElementById('zeny-crawl-target-select') as HTMLSelectElement)?.value;
                // if (selectedTarget) {
                //   console.log(`ターゲット「${selectedTarget}」の表示名を「${newDisplayName}」として保存します。`);
                //   // localStorage.setItem(`displayName_for_target_${selectedTarget}`, newDisplayName);
                // } else {
                //   console.warn('表示名を保存するためのターゲットが選択されていません。');
                // }
                console.log('「変更」ボタンがクリックされました。表示名を保存する処理を実装する必要があります。入力された値:', newDisplayName);
                // ----------------------------------------------------

                displayNameInput.setAttribute('readonly', 'true');
                const icon = updateDisplayNameButton.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-save');
                    icon.classList.add('fa-pencil-alt');
                }
                updateDisplayNameButton.setAttribute('title', '表示名を変更する');
            }
        });

        // TODO: 将来的には、以下の機能追加を検討すると良いでしょう:
        // 1. ページ読み込み時やセレクトボックス(zeny-crawl-target-select)の選択が変更された際に、
        //    保存されている表示名をdisplayNameInputにロードして表示する処理。
        // 2. 「変更」ボタンクリック時に、実際に入力値を永続化する処理（例: localStorageへの保存）。
        // 3. アカウント追加・削除機能の実装
    }
}