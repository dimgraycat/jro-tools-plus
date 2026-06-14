export interface ItemNameEntry {
  itemId: string;
  name: string;
  url: string;
}

export interface ItemNameMatch extends ItemNameEntry {
  start: number;
  end: number;
}

const ITEM_NAME_MAP_URL = 'https://asgrcat.github.io/jro-search/data/items/name-map.json';
const ITEM_NAME_LINKER_ENABLED_KEY = 'itemNameLinkerEnabled';
const ITEM_NAME_LINK_CLASS = 'jro-tools-plus-item-link';
const ITEM_NAME_LINK_SELECTOR = `a[data-jro-tools-plus-item-link="true"]`;
const MIN_ITEM_NAME_LENGTH = 2;

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

function getChromeLastErrorMessage(): string | undefined {
  return chrome.runtime.lastError?.message;
}

function readLocalStorage(keys: string[]): Promise<Record<string, unknown>> {
  if (!hasChromeStorage()) {
    return Promise.resolve({});
  }

  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      if (getChromeLastErrorMessage()) {
        resolve({});
        return;
      }

      resolve(result);
    });
  });
}

export function isItemNameLinkerEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : true;
}

export function buildItemNameEntries(nameMap: Record<string, unknown>): ItemNameEntry[] {
  const usedNames = new Set<string>();
  return Object.entries(nameMap)
    .filter(([itemId, name]) => /^\d+$/.test(itemId) && typeof name === 'string' && name.length >= MIN_ITEM_NAME_LENGTH)
    .reduce<ItemNameEntry[]>((entries, [itemId, name]) => {
      if (usedNames.has(name as string)) {
        return entries;
      }

      usedNames.add(name as string);
      entries.push({
        itemId,
        name: name as string,
        url: `https://rotool.gungho.jp/item/${itemId}/`,
      });
      return entries;
    }, [])
    .sort((a, b) => b.name.length - a.name.length || Number(a.itemId) - Number(b.itemId));
}

function groupEntriesByFirstCharacter(entries: ItemNameEntry[]): Map<string, ItemNameEntry[]> {
  return entries.reduce<Map<string, ItemNameEntry[]>>((groups, entry) => {
    const firstCharacter = entry.name.charAt(0);
    const group = groups.get(firstCharacter) ?? [];
    group.push(entry);
    groups.set(firstCharacter, group);
    return groups;
  }, new Map());
}

export function findItemNameMatches(text: string, entries: ItemNameEntry[]): ItemNameMatch[] {
  if (!text || entries.length === 0) {
    return [];
  }

  const entriesByFirstCharacter = groupEntriesByFirstCharacter(entries);
  const matches: ItemNameMatch[] = [];

  for (let index = 0; index < text.length;) {
    const candidates = entriesByFirstCharacter.get(text.charAt(index)) ?? [];
    const match = candidates.find((entry) => text.startsWith(entry.name, index));

    if (match) {
      matches.push({
        ...match,
        start: index,
        end: index + match.name.length,
      });
      index += match.name.length;
      continue;
    }

    index += 1;
  }

  return matches;
}

function shouldSkipTextNode(textNode: Text): boolean {
  const parent = textNode.parentElement;
  if (!parent || !textNode.nodeValue?.trim()) {
    return true;
  }

  return !!parent.closest([
    'a',
    'button',
    'script',
    'style',
    'textarea',
    'input',
    'select',
    'option',
    'noscript',
    `[data-jro-tools-plus-item-link="true"]`,
  ].join(','));
}

function linkTextNode(textNode: Text, entries: ItemNameEntry[]) {
  if (shouldSkipTextNode(textNode)) {
    return;
  }

  const text = textNode.nodeValue ?? '';
  const matches = findItemNameMatches(text, entries);
  if (matches.length === 0) {
    return;
  }

  const fragment = document.createDocumentFragment();
  let currentIndex = 0;
  matches.forEach((match) => {
    if (match.start > currentIndex) {
      fragment.append(document.createTextNode(text.slice(currentIndex, match.start)));
    }

    const link = document.createElement('a');
    link.href = match.url;
    link.textContent = match.name;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = ITEM_NAME_LINK_CLASS;
    link.dataset.jroToolsPlusItemLink = 'true';
    fragment.append(link);
    currentIndex = match.end;
  });

  if (currentIndex < text.length) {
    fragment.append(document.createTextNode(text.slice(currentIndex)));
  }

  textNode.replaceWith(fragment);
}

function applyItemNameLinks(entries: ItemNameEntry[]) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  textNodes.forEach((textNode) => {
    linkTextNode(textNode, entries);
  });
}

function removeItemNameLinks() {
  document.querySelectorAll<HTMLAnchorElement>(ITEM_NAME_LINK_SELECTOR).forEach((link) => {
    link.replaceWith(document.createTextNode(link.textContent ?? ''));
  });
  document.body.normalize();
}

async function fetchItemNameEntries(): Promise<ItemNameEntry[]> {
  const response = await fetch(ITEM_NAME_MAP_URL, { cache: 'force-cache' });
  if (!response.ok) {
    return [];
  }

  const nameMap = await response.json() as Record<string, unknown>;
  return buildItemNameEntries(nameMap);
}

async function getItemNameLinkerEnabled(): Promise<boolean> {
  const result = await readLocalStorage([ITEM_NAME_LINKER_ENABLED_KEY]);
  return isItemNameLinkerEnabled(result[ITEM_NAME_LINKER_ENABLED_KEY]);
}

async function updateItemNameLinks(entriesPromise: Promise<ItemNameEntry[]>) {
  if (!(await getItemNameLinkerEnabled())) {
    removeItemNameLinks();
    return;
  }

  const entries = await entriesPromise;
  if (!(await getItemNameLinkerEnabled())) {
    removeItemNameLinks();
    return;
  }

  if (entries.length === 0) {
    return;
  }

  removeItemNameLinks();
  applyItemNameLinks(entries);
}

export function initializeItemNameLinker() {
  if (typeof document === 'undefined' || typeof chrome === 'undefined' || !location.hostname.endsWith('ragnarokonline.gungho.jp')) {
    return;
  }

  const entriesPromise = fetchItemNameEntries().catch(() => []);
  void updateItemNameLinks(entriesPromise);

  chrome.storage?.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && ITEM_NAME_LINKER_ENABLED_KEY in changes) {
      void updateItemNameLinks(entriesPromise);
    }
  });
}
