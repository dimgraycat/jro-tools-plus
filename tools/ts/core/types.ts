export interface WorldInfo {
  value: string;
  text: string;
}

export interface CharacterPageLink extends WorldInfo {
  href: string;
}

export interface CharacterDetail extends CharacterPageLink {
  characterName?: string;
  zeny?: string;
}