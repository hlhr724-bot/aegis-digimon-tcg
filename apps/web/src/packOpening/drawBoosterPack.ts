import type { CardDefinition } from "@aegis/shared";
import { findPackRarity } from "@/packOpening/findPackRarity";
import { getPackCardRarity } from "@/packOpening/getPackCardRarity";
import { getPackPullRates, type PackPullRates } from "@/packOpening/getPackPullRates";
import { BoxHit } from "@/packOpening/BoxHit";
import { BOOSTER_PACK_COMMON_SLOTS, BOOSTER_PACK_UNCOMMON_SLOTS } from "@/packOpening/BoosterPackSlots";
import { listPackAlternateArts } from "@/packOpening/listPackAlternateArts";
import type { PackCard } from "@/packOpening/PackCard";
import { PackRarity } from "@/packOpening/PackRarity";

type Params = {
  setId: string;
  cards: readonly CardDefinition[];
  random: () => number;
  hit?: BoxHit;
};

type HitParams = {
  roll: number;
  alternateChance: number;
  rates: PackPullRates;
  pools: Map<PackRarity, CardDefinition[]>;
};

function rollHitRarity({ roll, alternateChance, rates, pools }: HitParams): PackRarity {
  const weightedRarities = [
    { rarity: PackRarity.SECRET_RARE.value, chance: rates.secretRare },
    { rarity: PackRarity.ULTRA_RARE.value, chance: rates.ultimateRare },
    { rarity: PackRarity.SUPER_RARE.value, chance: rates.superRare },
  ];
  let threshold = alternateChance;
  for (const { rarity, chance } of weightedRarities) {
    if (!pools.get(rarity)?.length) {
      continue;
    }
    threshold += chance;
    if (roll < threshold) {
      return rarity;
    }
  }
  return PackRarity.RARE.value;
}

type ResolveParams = {
  rarity: PackRarity;
  pools: Map<PackRarity, CardDefinition[]>;
};

function resolveAvailableRarity({ rarity, pools }: ResolveParams): PackRarity | undefined {
  let current: PackRarity | undefined = rarity;
  while (current && !pools.get(current)?.length) {
    current = findPackRarity(current)?.fallback;
  }
  return current;
}

type PoolParams = {
  cards: readonly CardDefinition[];
  setId: string;
};

function groupByRarity({ cards, setId }: PoolParams): Map<PackRarity, CardDefinition[]> {
  const normalizedCards = cards.map((card) => {
    const rarity = getPackCardRarity({ card, setId });
    if (rarity === card.rarity) {
      return card;
    }
    return { ...card, rarity };
  });
  const pools = new Map<PackRarity, CardDefinition[]>();
  for (const entry of Object.values(PackRarity)) {
    pools.set(
      entry.value,
      normalizedCards.filter((card) => card.rarity === entry.value),
    );
  }
  return pools;
}

type PlannedHitParams = {
  hit: BoxHit;
  alternateArts: readonly PackCard[];
  random: () => number;
};

function drawPlannedHit({ hit, alternateArts, random }: PlannedHitParams) {
  if (hit === BoxHit.ALTERNATE_ART.value) {
    const alternate = alternateArts[Math.floor(random() * alternateArts.length)];
    return { rarity: PackRarity.RARE.value, alternate };
  }
  return { rarity: hit, alternate: undefined };
}

type RolledHitParams = {
  alternateArts: readonly PackCard[];
  rates: PackPullRates;
  pools: Map<PackRarity, CardDefinition[]>;
  random: () => number;
};

function drawRolledHit({ alternateArts, rates, pools, random }: RolledHitParams) {
  const alternateChance = alternateArts.length > 0 ? rates.alternateArt : 0;
  const roll = random();
  const alternate = roll < alternateChance ? alternateArts[Math.floor(random() * alternateArts.length)] : undefined;
  return { rarity: rollHitRarity({ roll, alternateChance, rates, pools }), alternate };
}

export function drawBoosterPack({ cards, setId, random, hit }: Params): PackCard[] {
  const pools = groupByRarity({ cards, setId });
  const rates = getPackPullRates({ setId });
  const alternateArts = listPackAlternateArts({ cards, setId });
  const { rarity: hitRarity, alternate } = hit
    ? drawPlannedHit({ hit, alternateArts, random })
    : drawRolledHit({ alternateArts, rates, pools, random });
  const slots: PackRarity[] = [
    ...Array.from({ length: BOOSTER_PACK_COMMON_SLOTS }, () => PackRarity.COMMON.value),
    ...Array.from({ length: BOOSTER_PACK_UNCOMMON_SLOTS }, () => PackRarity.UNCOMMON.value),
    PackRarity.RARE.value,
    hitRarity,
  ];
  const drawn: PackCard[] = [];
  for (const [index, slot] of slots.entries()) {
    if (index === slots.length - 1 && alternate) {
      drawn.push(alternate);
      continue;
    }
    const rarity = resolveAvailableRarity({ rarity: slot, pools });
    if (!rarity) {
      continue;
    }
    const pool = pools.get(rarity) ?? [];
    const unused = pool.filter((card) => !drawn.includes(card));
    const candidates = unused.length > 0 ? unused : pool;
    const card = candidates[Math.floor(random() * candidates.length)];
    if (card) {
      drawn.push(card);
    }
  }
  return drawn;
}
