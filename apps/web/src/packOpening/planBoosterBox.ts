import type { CardDefinition } from "@aegis/shared";
import { BOOSTER_BOX_PACK_COUNT } from "@/packOpening/BoosterProgress";
import { BoxHit } from "@/packOpening/BoxHit";
import { getPackCardRarity } from "@/packOpening/getPackCardRarity";
import { getPackPullRates } from "@/packOpening/getPackPullRates";
import { listPackAlternateArts } from "@/packOpening/listPackAlternateArts";

type Params = {
  setId: string;
  cards: readonly CardDefinition[];
  random: () => number;
};

function roundAtRandom(expected: number, random: () => number): number {
  const whole = Math.floor(expected);
  return whole + (random() < expected - whole ? 1 : 0);
}

export function planBoosterBox({ setId, cards, random }: Params): BoxHit[] {
  const rates = getPackPullRates({ setId });
  const rarities = new Set(cards.map((card) => getPackCardRarity({ card, setId })));
  const hasAlternateArts = listPackAlternateArts({ cards, setId }).length > 0;
  const allocations: [BoxHit, number][] = [
    [
      BoxHit.ALTERNATE_ART.value,
      hasAlternateArts ? roundAtRandom(rates.alternateArt * BOOSTER_BOX_PACK_COUNT, random) : 0,
    ],
    [
      BoxHit.SECRET_RARE.value,
      rarities.has(BoxHit.SECRET_RARE.value) ? roundAtRandom(rates.secretRare * BOOSTER_BOX_PACK_COUNT, random) : 0,
    ],
    [
      BoxHit.ULTRA_RARE.value,
      rarities.has(BoxHit.ULTRA_RARE.value) ? roundAtRandom(rates.ultimateRare * BOOSTER_BOX_PACK_COUNT, random) : 0,
    ],
    [
      BoxHit.SUPER_RARE.value,
      rarities.has(BoxHit.SUPER_RARE.value) ? roundAtRandom(rates.superRare * BOOSTER_BOX_PACK_COUNT, random) : 0,
    ],
  ];
  const hits = allocations
    .flatMap(([hit, count]) => Array.from({ length: count }, () => hit))
    .slice(0, BOOSTER_BOX_PACK_COUNT);
  while (hits.length < BOOSTER_BOX_PACK_COUNT) {
    hits.push(BoxHit.RARE.value);
  }
  for (let index = hits.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [hits[index], hits[swap]] = [hits[swap]!, hits[index]!];
  }
  return hits;
}
