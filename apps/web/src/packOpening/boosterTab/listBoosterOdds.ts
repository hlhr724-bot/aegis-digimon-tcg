import type { CardDefinition } from "@aegis/shared";
import { BOOSTER_BOX_PACK_COUNT } from "@/packOpening/BoosterProgress";
import {
  BOOSTER_PACK_COMMON_SLOTS,
  BOOSTER_PACK_RARE_SLOTS,
  BOOSTER_PACK_UNCOMMON_SLOTS,
} from "@/packOpening/BoosterPackSlots";
import { BoosterOddsKind } from "@/packOpening/boosterTab/BoosterOddsKind";
import { getPackCardRarity } from "@/packOpening/getPackCardRarity";
import { getPackPullRates } from "@/packOpening/getPackPullRates";
import { listPackAlternateArts } from "@/packOpening/listPackAlternateArts";

type BoosterOddsEntry = (typeof BoosterOddsKind)[keyof typeof BoosterOddsKind];

export type BoosterOdds =
  | { kind: BoosterOddsEntry; slotsPerPack: number; isMinimum: boolean }
  | { kind: BoosterOddsEntry; perBox: number };

type Params = {
  setId: string;
  cards: readonly CardDefinition[];
};

export function listBoosterOdds({ setId, cards }: Params): BoosterOdds[] {
  const rates = getPackPullRates({ setId });
  const rarities = new Set(cards.map((card) => getPackCardRarity({ card, setId })));
  const hits: [BoosterOddsEntry, number, boolean][] = [
    [BoosterOddsKind.SUPER_RARE, rates.superRare, rarities.has(BoosterOddsKind.SUPER_RARE.value)],
    [BoosterOddsKind.ULTRA_RARE, rates.ultimateRare, rarities.has(BoosterOddsKind.ULTRA_RARE.value)],
    [BoosterOddsKind.SECRET_RARE, rates.secretRare, rarities.has(BoosterOddsKind.SECRET_RARE.value)],
    [BoosterOddsKind.ALTERNATE_ART, rates.alternateArt, listPackAlternateArts({ cards, setId }).length > 0],
  ];
  return [
    { kind: BoosterOddsKind.COMMON, slotsPerPack: BOOSTER_PACK_COMMON_SLOTS, isMinimum: false },
    { kind: BoosterOddsKind.UNCOMMON, slotsPerPack: BOOSTER_PACK_UNCOMMON_SLOTS, isMinimum: false },
    { kind: BoosterOddsKind.RARE, slotsPerPack: BOOSTER_PACK_RARE_SLOTS, isMinimum: true },
    ...hits
      .filter(([, rate, available]) => available && rate > 0)
      .map(([kind, rate]) => ({ kind, perBox: rate * BOOSTER_BOX_PACK_COUNT })),
  ];
}
