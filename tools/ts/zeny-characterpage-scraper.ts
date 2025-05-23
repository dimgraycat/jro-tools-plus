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

/**
 * 指定されたキャラクターページからワールド選択の情報を取得する関数。
 * この関数は、対象のウェブページのコンテキストで実行されることを意図しています。
 */
async function scrapeCharacterLinksForWorld(worldValue: string, worldText: string): Promise<CharacterPageLink[] | null> {
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  if (!worldValue) {
    return null;
  }

  const characterListPageUrl = `https://rowebtool.gungho.jp/character/${worldValue}/0`;

  await sleep(1500);

  try {
    const response = await fetch(characterListPageUrl);
    if (!response.ok) {
      console.error(`Failed to fetch ${characterListPageUrl}: ${response.status} ${response.statusText}`);
      return null;
    }
    const htmlText = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    const links = doc.querySelectorAll("body > main > article > div > div.listSet > ul > li > dl > dt > a");
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
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  if (!characterPageLink.href) {
    console.warn("Character href is empty, skipping detail scraping.");
    return null;
  }

  await sleep(1500);

  try {
    const response = await fetch(characterPageLink.href);
    if (!response.ok) {
      console.error(`Failed to fetch ${characterPageLink.href}: ${response.status} ${response.statusText}`);
      return { ...characterPageLink, characterName: "取得失敗", zeny: "取得失敗" }; // URLはあるが詳細取得失敗
    }
    const htmlText = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    const charNameElement = doc.querySelector("body > main > article > section > div.base > table > tbody > tr:nth-child(1) > td:nth-child(2)");
    const zenyElement = doc.querySelector("body > main > article > section > div.info > table > tbody > tr:nth-child(2) > td");

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