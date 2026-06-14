interface WorldInfo {
  value: string;
  text: string;
}

// ワールド情報とキャラクターリストページから取得したキャラクター詳細ページへのリンク
interface CharacterPageLink extends WorldInfo {
  href: string;
}

// 最終的に収集するキャラクター詳細情報
interface CharacterDetail extends CharacterPageLink {
  characterName?: string;
  zeny?: string;
}

const SCRAPE_DELAY_MS = 1500;
const SELECTORS = {
  characterLinks: "body > main > article > div > div.listSet > ul > li > dl > dt > a",
  characterName: "body > main > article > section > div.base > table > tbody > tr:nth-child(1) > td:nth-child(2)",
  zeny: "body > main > article > section > div.info > table > tbody > tr:nth-child(2) > td",
} as const;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchHtmlDocument(url: string): Promise<Document | null> {
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    return null;
  }

  const htmlText = await response.text();
  return new DOMParser().parseFromString(htmlText, 'text/html');
}

/**
 * 指定されたキャラクターページからワールド選択の情報を取得する関数。
 * この関数は、対象のウェブページのコンテキストで実行されることを意図しています。
 */
async function scrapeCharacterLinksForWorld(worldValue: string, worldText: string): Promise<CharacterPageLink[] | null> {
  if (!worldValue) {
    return null;
  }

  const characterListPageUrl = `https://rowebtool.gungho.jp/character/${worldValue}/0`;

  await sleep(SCRAPE_DELAY_MS);

  try {
    const doc = await fetchHtmlDocument(characterListPageUrl);
    if (!doc) {
      return null;
    }

    const links = doc.querySelectorAll(SELECTORS.characterLinks);
    const characterLinksOnPage: CharacterPageLink[] = Array.from(links).map(a => ({
      href: (a as HTMLAnchorElement).href,
      value: worldValue,
      text: worldText
    }));
    return characterLinksOnPage.length > 0 ? characterLinksOnPage : null;
  } catch (error) {
    console.error(`Error processing ${characterListPageUrl}:`, error);
    return null;
  }
}

async function scrapeCharacterDetails(characterPageLink: CharacterPageLink): Promise<CharacterDetail | null> {
  if (!characterPageLink.href) {
    console.warn("Character href is empty, skipping detail scraping.");
    return null;
  }

  await sleep(SCRAPE_DELAY_MS);

  try {
    const doc = await fetchHtmlDocument(characterPageLink.href);
    if (!doc) {
      return { ...characterPageLink, characterName: "取得失敗", zeny: "取得失敗" }; // URLはあるが詳細取得失敗
    }

    const charNameElement = doc.querySelector(SELECTORS.characterName);
    const zenyElement = doc.querySelector(SELECTORS.zeny);

    const characterName = charNameElement?.textContent?.trim() || "不明";
    const zeny = zenyElement?.textContent?.trim() || "不明";

    return {
      ...characterPageLink,
      characterName,
      zeny
    };

  } catch (error) {
    console.error(`Error processing character details for ${characterPageLink.href}:`, error);
    return { ...characterPageLink, characterName: "エラー", zeny: "エラー" }; // URLはあるが処理中にエラー
  }
}
/**
 * 最初のキャラクターページからワールドのvalueとtextのリストを取得する関数。
 */
function getWorldOptionsFromPage(): WorldInfo[] | null {
  const worldChangeForm = document.forms.namedItem("worldchange");
  if (!worldChangeForm) {
    console.warn("World selection form ('worldchange') not found on this page.");
    return null;
  }
  const selectElement = worldChangeForm.elements.namedItem("world");
  if (!(selectElement instanceof HTMLSelectElement)) {
    console.warn("World select element ('world') not found or not a select element.");
    return null;
  }
  return Array.from(selectElement.options).map(option => ({
    value: option.value,
    text: option.text
  }));
}

if (typeof window !== 'undefined') {
  (window as any).scrapeCharacterLinksForWorld = scrapeCharacterLinksForWorld;
  (window as any).scrapeCharacterDetails = scrapeCharacterDetails;
  (window as any).getWorldOptionsFromPage = getWorldOptionsFromPage;
}

export {};
