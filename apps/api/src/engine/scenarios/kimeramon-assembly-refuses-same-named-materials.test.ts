import { describe, expect, it } from "vitest";
import "../../cards/index.js";
import { setupEngine } from "../testkit/harness.js";

const KIMERAMON = "EX9-074";
const SKULL_GREYMON = "EX9-062";
const DISTINCT_LEVEL_FOUR_DM = ["EX9-009", "EX9-010", "EX9-017", "EX9-025", "EX9-026", "EX9-028"];
const SENTINEL = "BT1-009";

async function declareKimeramonAssembly(materials: readonly string[]) {
  const s = setupEngine({
    0: {
      hand: [{ card: KIMERAMON, as: "kimeramon" }],
      trash: materials.map((card, index) => ({ card, as: `material-${index}` })),
      deck: [SENTINEL, SENTINEL, SENTINEL],
      security: [SENTINEL],
    },
    1: { deck: [SENTINEL, SENTINEL, SENTINEL], security: [SENTINEL] },
  });
  s.state.memory = 10;
  await s.ready();
  const result = s.engine.applyIntent(0, {
    type: "playCard",
    instanceId: s.inst("kimeramon").instanceId,
    assembly: { materialInstanceIds: materials.map((_card, index) => s.inst(`material-${index}`).instanceId) },
  });
  return { result, s };
}

describe("Kimeramon Assembly with same-named materials", () => {
  it("refuses two SkullGreymon and leaves every card where it was", async () => {
    const materials = [...DISTINCT_LEVEL_FOUR_DM.slice(0, 5), SKULL_GREYMON, SKULL_GREYMON];
    const { result, s } = await declareKimeramonAssembly(materials);

    expect(result).toEqual({ ok: false, reason: "invalid-material" });
    expect(s.state.players[0]!.hand.map(({ cardId }) => cardId)).toEqual([KIMERAMON]);
    expect(s.state.players[0]!.trash.map(({ cardId }) => cardId)).toEqual(materials);
    expect(s.state.players[0]!.battleArea.length).toBe(0);
    expect(s.state.memory).toBe(10);
  });

  it("accepts one SkullGreymon beside six differently named level 4 cards", async () => {
    const { result } = await declareKimeramonAssembly([...DISTINCT_LEVEL_FOUR_DM, SKULL_GREYMON]);

    expect(result).toEqual({ ok: true });
  });
});
