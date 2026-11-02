import { describe, expect, it } from "vitest";
import { BOOSTER_PACK_COMMON_SLOTS, BOOSTER_PACK_UNCOMMON_SLOTS } from "@/packOpening/BoosterPackSlots";
import { BoosterOddsKind } from "@/packOpening/boosterTab/BoosterOddsKind";
import { listBoosterOdds } from "@/packOpening/boosterTab/listBoosterOdds";
import { listBoosterSets } from "@/packOpening/listBoosterSets";

function findSet(setId: string) {
  const boosterSet = listBoosterSets().find((set) => set.setId === setId);
  if (!boosterSet) {
    throw new Error(`Missing booster set ${setId}`);
  }
  return boosterSet;
}

describe("booster odds", () => {
  it("lists the fixed pack slots before the box hit rates", () => {
    const boosterSet = findSet("BT12");
    const odds = listBoosterOdds({ setId: boosterSet.setId, cards: boosterSet.cards });

    expect(odds.slice(0, 3)).toEqual([
      { kind: BoosterOddsKind.COMMON, slotsPerPack: BOOSTER_PACK_COMMON_SLOTS, isMinimum: false },
      { kind: BoosterOddsKind.UNCOMMON, slotsPerPack: BOOSTER_PACK_UNCOMMON_SLOTS, isMinimum: false },
      { kind: BoosterOddsKind.RARE, slotsPerPack: 1, isMinimum: true },
    ]);
    expect(odds.find((entry) => entry.kind === BoosterOddsKind.SUPER_RARE)).toEqual({
      kind: BoosterOddsKind.SUPER_RARE,
      perBox: 7,
    });
  });

  it("shows ultimate rares only for sets that print them", () => {
    const withUltimate = findSet("BT25");
    const withoutUltimate = findSet("BT12");

    expect(
      listBoosterOdds({ setId: withUltimate.setId, cards: withUltimate.cards }).some(
        (entry) => entry.kind === BoosterOddsKind.ULTRA_RARE,
      ),
    ).toBe(true);
    expect(
      listBoosterOdds({ setId: withoutUltimate.setId, cards: withoutUltimate.cards }).some(
        (entry) => entry.kind === BoosterOddsKind.ULTRA_RARE,
      ),
    ).toBe(false);
  });
});
