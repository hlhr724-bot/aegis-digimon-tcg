import type { Permanent } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { ARENA_ROW_LAYOUT } from "@/game/arena3d/field/arenaWorldLayout";
import { ArenaLayoutVariant } from "@/game/arena3d/field/ArenaLayoutVariant";
import { computeArenaRowSlots } from "@/game/arena3d/field/computeArenaRowSlots";
import { getArenaColumnX } from "@/game/arena3d/field/getArenaColumnX";
import { Side } from "@/game/side";

function buildPermanent(permanentId: string, stackSize = 0): Permanent {
  return {
    permanentId,
    topCard: { instanceId: `${permanentId}-top`, cardId: "BT1-010", faceUp: true },
    stack: Array.from({ length: stackSize }, (_, index) => ({
      instanceId: `${permanentId}-${index}`,
      cardId: "BT1-001",
      faceUp: true,
    })),
    linked: [],
    isSuspended: false,
  } as unknown as Permanent;
}

function buildPermanents(prefix: string, count: number): Permanent[] {
  return Array.from({ length: count }, (_, index) => buildPermanent(`${prefix}${index}`));
}

const NEVER_SUSPENDED = () => false;
const LAYOUTS = Object.values(ArenaLayoutVariant);

describe.each(LAYOUTS)("computeArenaRowSlots on the $name layout", ({ lanes }) => {
  it("places both players' cards on mirrored columns", () => {
    const viewer = computeArenaRowSlots({
      side: Side.Viewer,
      lanes,
      arrangement: { digimon: buildPermanents("a", 2), support: [] },
      isSuspended: NEVER_SUSPENDED,
    });
    const opponent = computeArenaRowSlots({
      side: Side.Opponent,
      lanes,
      arrangement: { digimon: buildPermanents("b", 2), support: [] },
      isSuspended: NEVER_SUSPENDED,
    });
    expect(viewer.map((slot) => slot.z)).toEqual([lanes.digimonDepth, lanes.digimonDepth]);
    expect(viewer.map((slot) => slot.column)).toEqual([1, 2]);
    expect(opponent.map((slot) => slot.column)).toEqual([2, 3]);
    expect(opponent.map((slot) => 0 - slot.x + 0).sort()).toEqual(viewer.map((slot) => slot.x).sort());
    expect(opponent[0]!.z).toBe(-lanes.digimonDepth);
  });

  it("gives digimon and support cards the same size and columns", () => {
    const slots = computeArenaRowSlots({
      side: Side.Viewer,
      lanes,
      arrangement: {
        digimon: buildPermanents("d", 5),
        support: buildPermanents("s", 5).map((permanent) => ({ key: permanent.permanentId, members: [permanent] })),
      },
      isSuspended: NEVER_SUSPENDED,
    });
    const digimon = slots.filter((slot) => slot.z === lanes.digimonDepth);
    const support = slots.filter((slot) => slot.z === lanes.supportDepth);
    expect(new Set(slots.map((slot) => slot.width))).toEqual(new Set([ARENA_ROW_LAYOUT.cardWidth]));
    expect(support.map((slot) => slot.x)).toEqual(digimon.map((slot) => slot.x));
    expect(digimon.map((slot) => slot.x)).toEqual([0, 1, 2, 3, 4].map((column) => getArenaColumnX(column, lanes)));
  });

  it("keeps group keys and members for grouped support cards", () => {
    const tamer = buildPermanent("t1");
    const copy = buildPermanent("t2");
    const [slot] = computeArenaRowSlots({
      side: Side.Viewer,
      lanes,
      arrangement: { digimon: [], support: [{ key: "t1", members: [tamer, copy] }] },
      isSuspended: NEVER_SUSPENDED,
    });
    expect(slot!.fieldKey).toBe("t1");
    expect(slot!.members.map((member) => member.permanentId)).toEqual(["t1", "t2"]);
    expect(slot!.z).toBe(lanes.supportDepth);
  });

  it("shrinks a crowded lane to fit its width", () => {
    const crowded = Array.from({ length: 12 }, (_, index) => buildPermanent(`p${index}`, 3));
    const slots = computeArenaRowSlots({
      side: Side.Viewer,
      lanes,
      arrangement: { digimon: crowded, support: [] },
      isSuspended: NEVER_SUSPENDED,
    });
    const last = slots[slots.length - 1]!;
    expect(slots.every((slot) => slot.column === undefined)).toBe(true);
    expect(slots[0]!.width).toBeLessThan(ARENA_ROW_LAYOUT.cardWidth);
    expect(last.x + last.width / 2).toBeLessThanOrEqual(lanes.halfWidth + 0.001);
  });

  it("keeps evolution sources and suspended cards on columns", () => {
    const slots = computeArenaRowSlots({
      side: Side.Viewer,
      lanes,
      arrangement: { digimon: [buildPermanent("e0", 3), buildPermanent("e1", 3), buildPermanent("e2")], support: [] },
      isSuspended: (permanent) => permanent.permanentId === "e2",
    });
    expect(slots.map((slot) => slot.column)).toEqual([1, 2, 3]);
  });
});
