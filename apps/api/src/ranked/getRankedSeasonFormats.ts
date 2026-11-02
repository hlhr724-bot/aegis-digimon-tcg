import type { DeckFormat } from "@aegis/shared/deckFormat";

type Params = { seasonId: number };

const SEASON_FORMATS: Readonly<Record<number, readonly DeckFormat[]>> = {
  1: ["standard"],
};

export function getRankedSeasonFormats({ seasonId }: Params): DeckFormat[] {
  return [...(SEASON_FORMATS[seasonId] ?? [])];
}
