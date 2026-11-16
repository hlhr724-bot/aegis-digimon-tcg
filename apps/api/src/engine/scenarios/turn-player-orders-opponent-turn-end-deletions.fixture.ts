import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "turn-player-orders-opponent-turn-end-deletions",
  board: {
    0: {
      battleArea: [
        { card: "BT1-020", as: "firstAttacker" },
        { card: "BT1-020", as: "returnedDigimon" },
        { card: "BT1-020", as: "secondAttacker" },
      ],
      deck: Array(12).fill("BT1-009"),
      security: 3,
    },
    1: {
      security: [
        { card: "BT23-025", as: "firstMarineAngemon" },
        { card: "BT23-025", as: "secondMarineAngemon" },
        "BT1-009",
      ],
      deck: Array(12).fill("BT1-009"),
    },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
