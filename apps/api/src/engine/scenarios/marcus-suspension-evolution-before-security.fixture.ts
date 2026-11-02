import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "marcus-suspension-evolution-before-security",
  board: {
    0: {
      battleArea: [
        { card: "AD1-021", as: "marcus" },
        { card: "AD1-016", as: "shineGreymon" },
      ],
      hand: [{ card: "BT25-104", as: "burstMode" }],
      deck: Array.from({ length: 8 }, () => "BT1-009"),
      security: ["BT1-009", "BT1-009"],
    },
    1: {
      battleArea: [{ card: "BT1-010", as: "victim" }],
      security: ["BT1-009", "BT1-009", "BT1-009"],
      deck: ["BT1-009", "BT1-009"],
    },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 1,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
