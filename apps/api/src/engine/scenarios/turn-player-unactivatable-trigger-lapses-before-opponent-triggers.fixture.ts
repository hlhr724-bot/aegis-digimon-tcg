import type { ScenarioFixture } from "../scenario/types.js";

export function turnPlayerUnactivatableTriggerLapsesBeforeOpponentTriggers(): ScenarioFixture {
  return {
    memory: 5,
    turnSeat: 0,
    turnCount: 6,
    isFirstPlayersFirstTurn: false,
    board: {
      0: {
        battleArea: [{ card: "EX12-015", as: "gokuumon", under: ["EX12-056"] }],
        hand: [{ card: "EX12-048", as: "seitenGokuumon" }],
        deck: ["EX12-012", "EX12-043", "EX12-075", "EX12-029", "EX12-029"],
        eggDeck: ["EX12-002"],
        security: 2,
      },
      1: {
        battleArea: [
          "EX1-066",
          {
            card: "BT22-078",
            as: "boltmon",
            suspended: true,
            under: ["EX8-008", { card: "BT27-007", as: "solarmon" }, "BT22-074", "BT25-014", "BT27-012"],
          },
        ],
        hand: ["BT22-071", "LM-027", "BT4-111"],
        deck: ["LM-050", "BT22-011", "BT25-014", "BT27-010", "P-198", "LM-050"],
        eggDeck: ["BT15-006", "BT15-006"],
        security: 3,
      },
    },
  };
}

export default turnPlayerUnactivatableTriggerLapsesBeforeOpponentTriggers();
