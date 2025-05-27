export function initializeUINavigation(): void {
    const menuItems = document.querySelectorAll('aside nav ul li[class*="js-menu-"]');
    const pageElements = document.querySelectorAll('main[class*="js-pages-"]');

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

    function initialize() {
        let currentHash = window.location.hash;
        const firstMenuLink = (menuItems[0]?.querySelector('a') as HTMLAnchorElement | null)?.getAttribute('href');
        const validPageIds = Array.from(pageElements).map(p => p.id);

        if (!currentHash || !validPageIds.includes(currentHash.substring(1))) {
            if (firstMenuLink && validPageIds.includes(firstMenuLink.substring(1))) {
                window.location.hash = firstMenuLink;
                return; // hashchangeイベントでupdateActiveStateが呼ばれる
            } else if (validPageIds.length > 0) {
                window.location.hash = `#${validPageIds[0]}`;
                return; // hashchangeイベントでupdateActiveStateが呼ばれる
            }
        }
        updateActiveState(); // 初期表示時にも実行
    }

    window.addEventListener('hashchange', updateActiveState);
    initialize();
}