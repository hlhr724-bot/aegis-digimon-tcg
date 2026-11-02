import { resolveCardArt } from "@aegis/shared/cards/arts";
import { getCardDefinition } from "@aegis/shared/cards/registry";
import type { CardFinishEntry } from "@/design/webglCard/CardFinish";
import { getCardFinish } from "@/design/webglCard/getCardFinish";
import { getPackCardRarity } from "@/packOpening/getPackCardRarity";

type Params = {
  cardId: string;
  artId?: string;
};

const PARALLEL_ART_SUFFIX = /^_P\d+/;

function findParallelArtId({ cardId, artId }: Params): string | undefined {
  if (!artId) {
    return undefined;
  }
  const resolved = resolveCardArt(cardId, artId).artId;
  return PARALLEL_ART_SUFFIX.test(resolved.slice(cardId.length)) ? resolved : undefined;
}

export function getCardDetailFinish({ cardId, artId }: Params): CardFinishEntry {
  const definition = getCardDefinition(cardId);
  const rarity = definition ? getPackCardRarity({ card: definition, setId: definition.set }) : undefined;
  return getCardFinish({ rarity, artId: findParallelArtId({ cardId, artId }) });
}
