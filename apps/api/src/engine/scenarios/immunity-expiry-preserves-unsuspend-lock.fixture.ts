import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "immunity-expiry-preserves-unsuspend-lock",
  board: {
    0: {
      deck: Array<string>(10).fill("BT1-009"),
      security: ["BT1-009", "BT1-009"],
      hand: [{ card: "ST24-10", as: "lilamon" }],
    },
    1: {
      deck: Array<string>(10).fill("BT1-009"),
      security: ["BT1-009", "BT1-009"],
      hand: [{ card: "BT16-102", as: "magnamon-x" }],
      battleArea: [{ card: "BT8-038", as: "magnamon" }],
    },
  },
  memory: 10,
  turnSeat: 1,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
