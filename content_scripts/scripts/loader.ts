import './../sass/jro_tools_plus.scss'; // Webpackで処理するためにSCSSをインポート

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
