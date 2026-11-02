import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "blind-opponent-hand-discard",
  memory: 10,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      eggDeck: ["BT1-001"],
      hand: [{ card: "EX6-055", as: "dan" }],
      deck: ["BT1-009", "BT1-009"],
      security: 3,
    },
    1: {
      hand: [
        { card: "P-039", as: "returned", faceUp: true },
        { card: "BT1-010", as: "hidden" },
      ],
      deck: ["BT1-009", "BT1-009"],
      security: 3,
    },
  },
};

export default fixture;
