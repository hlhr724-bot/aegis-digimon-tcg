import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "marcus-agumon-end-of-turn-attack-without-yellow-greymon",
  board: {
    0: {
      battleArea: [
        { card: "AD1-021", as: "marcus" },
        { card: "BT1-013", as: "redDigimon" },
      ],
      hand: ["BT1-009"],
      deck: Array(12).fill("BT1-009"),
      security: 3,
    },
    1: {
      hand: ["BT1-009"],
      deck: Array(12).fill("BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
