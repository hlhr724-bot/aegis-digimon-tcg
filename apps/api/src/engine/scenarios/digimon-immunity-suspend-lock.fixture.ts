import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "digimon-immunity-suspend-lock",
  memory: 5,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT6-084", as: "ciel" }],
      hand: [{ card: "BT20-084", as: "awakened" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: Array<string>(5).fill("BT1-009"),
    },
    1: {
      battleArea: [{ card: "BT25-060", as: "rebootmon", suspended: true }],
      deck: Array<string>(8).fill("BT1-009"),
      security: Array<string>(5).fill("BT1-009"),
    },
  },
};

export default fixture;
