import { CardKind, type CardDefinition } from "@aegis/shared";

export const KIND_FILTERS = ["Digimon", "DigiEgg", "Tamer", "Option", "Dual"] as const;

export type KindFilter = (typeof KIND_FILTERS)[number];

type MatchesKindFilterParams = {
  card: Pick<CardDefinition, "kinds">;
  selectedKinds: readonly KindFilter[];
};

function hasKind(card: Pick<CardDefinition, "kinds">, kind: KindFilter): boolean {
  if (kind === "Dual") {
    return card.kinds.includes(CardKind.Digimon) && card.kinds.includes(CardKind.Option);
  }
  return card.kinds.includes(CardKind[kind]);
}

export function matchesKindFilter({ card, selectedKinds }: MatchesKindFilterParams): boolean {
  if (selectedKinds.length === 0) {
    return true;
  }
  return selectedKinds.some((kind) => hasKind(card, kind));
}
