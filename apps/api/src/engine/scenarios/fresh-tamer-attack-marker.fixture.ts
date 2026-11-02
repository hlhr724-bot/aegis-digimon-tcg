import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 10,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT12-088", as: "establishedTamer" }],
      hand: [
        { card: "BT12-088", as: "freshTamer" },
        { card: "BT4-011", as: "freshHybrid" },
        { card: "BT4-011", as: "establishedHybrid" },
      ],
      deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012", "BT1-014", "BT1-015"],
      eggDeck: ["BT1-001"],
      security: 3,
    },
    1: {
      deck: ["BT1-009", "BT1-010", "BT1-011"],
      eggDeck: ["BT1-001"],
      security: ["BT1-009", "BT1-010", "BT1-011"],
    },
  },
};

export default fixture;
