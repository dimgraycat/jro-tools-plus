import { initializeUINavigation } from './ui/ui-navigation';
import { initializeFeatureToggles } from './features/feature-toggle';
import { initializeZenyCrawler } from './features/zeny-crawler';
import { initializeAccountSettings } from './features/account-settings';
// 必要であれば types.ts から型をインポートする際のパスも更新
// import { SomeType } from './core/types';

document.addEventListener('DOMContentLoaded', () => {
    initializeUINavigation();
    initializeFeatureToggles();
    initializeZenyCrawler();
    initializeAccountSettings();
});