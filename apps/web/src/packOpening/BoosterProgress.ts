import type { BoxHit } from "@/packOpening/BoxHit";

export interface StoredPackCard {
  cardId: string;
  artId?: string;
}

export interface OpenedPack {
  openedAt: number;
  cards: StoredPackCard[];
}

export interface BoosterBox {
  setId: string;
  packs: OpenedPack[];
  hits?: BoxHit[];
}

export interface BoosterProgress {
  version: 2;
  activeBox: BoosterBox | null;
}

export const BOOSTER_PROGRESS_KEY = "aegis:booster-progress:v2";
export const LEGACY_BOOSTER_PROGRESS_KEY = "aegis:booster-progress:v1";
export const BOOSTER_BOX_PACK_COUNT = 24;
