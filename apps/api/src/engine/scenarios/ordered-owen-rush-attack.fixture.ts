import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "ordered-owen-rush-attack",
  board: {
    0: {
      deck: ["BT1-009", "BT1-009"],
      hand: [{ card: "BT21-026", as: "wargreymon" }],
      battleArea: [
        { card: "BT21-081", as: "first-owen" },
        { card: "BT21-081", as: "second-owen" },
      ],
    },
    1: {
      deck: ["BT1-009", "BT1-009"],
      security: ["BT1-009", "BT1-009", "BT1-009"],
      battleArea: [
        { card: "EX8-026", as: "restriction" },
        { card: "BT1-010", as: "opponent" },
      ],
    },
  },
  turnSeat: 0,
  turnCount: 5,
  memory: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
