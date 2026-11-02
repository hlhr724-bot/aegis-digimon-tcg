import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "original-dp-after-immunity-expiry",
  board: {
    0: {
      deck: Array<string>(10).fill("BT1-009"),
      security: ["BT1-009", "BT1-009"],
      hand: [{ card: "BT18-039", as: "mistymon" }],
    },
    1: {
      deck: Array<string>(10).fill("BT1-009"),
      security: ["BT1-009", "BT1-009"],
      hand: [{ card: "BT25-059", as: "ceresmon" }],
    },
  },
  memory: 10,
  turnSeat: 1,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
