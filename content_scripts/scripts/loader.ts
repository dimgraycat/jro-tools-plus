import './../sass/jro_tools_plus.scss'; // Webpackで処理するためにSCSSをインポート
import { entryFromUrl } from '../../tools/lib/personal-library.js';

interface SiteRule {
  domain: string;
  regex: RegExp;
  js: string[];
  // css: string[]; // manifest.jsonでCSSを指定するため、この行は不要になります
}

const siteConfigs: SiteRule[] = [
  {
    "domain": "rotool.gungho.jp",
    "regex": /^\/(monster|map)\/.*/g,
    "js": [],
  }
];

const injectScripts = (list: string[]): void => {
  list.forEach((file) => {
    const elem = document.createElement('script');
    elem.setAttribute('src', chrome.runtime.getURL(file));
    document.body?.appendChild(elem);
  });
};

const currentUrl = new URL(location.href);
siteConfigs.forEach((config: SiteRule): void => {
  if (currentUrl.host === config.domain && currentUrl.pathname.match(config.regex)) {
    injectScripts(config.js);
  }
});

function currentLibraryEntry() {
  const name = document.querySelector('h1.conent-ttl')?.textContent
    || document.title.split('|')[0];
  return entryFromUrl(location.href, name || '');
}

const libraryEntry = currentLibraryEntry();
if (libraryEntry && window === window.top) {
  void chrome.runtime.sendMessage({ type: 'library.visit', entry: libraryEntry }).catch(() => undefined);
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id === chrome.runtime.id && message?.type === 'library.current') {
    respond(currentLibraryEntry());
  }
});
