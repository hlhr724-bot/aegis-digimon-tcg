import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "attack-immunity-lapses-in-main",
  board: {
    0: {
      battleArea: [{ card: "BT27-103", as: "ouryuken", under: ["BT13-075", "BT27-015"] }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [{ card: "ST1-06", as: "blocker" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: ["ST1-16", "BT1-009", "BT1-009"],
    },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
