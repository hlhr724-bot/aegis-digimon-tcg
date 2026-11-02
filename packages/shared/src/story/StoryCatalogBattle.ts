import type { storyCatalogDecks } from "#shared/story/storyCatalogDecks";

export type StoryCatalogBattle = {
  id: string;
  campaignId: string;
  chapter: string;
  title: string;
  protagonist?: string;
  opponents?: readonly string[];
  playerDeckRefs: readonly (keyof typeof storyCatalogDecks)[];
  opponentCoverCardId?: string;
  opponentDeckRef: keyof typeof storyCatalogDecks;
  sourceUrl: string;
  isOptional?: boolean;
  completionGroup?: string;
};
