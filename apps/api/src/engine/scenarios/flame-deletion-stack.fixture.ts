import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "flame-deletion-stack",
  memory: 5,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT27-007", as: "base" }],
      hand: [
        { card: "BT27-010", as: "champion" },
        { card: "BT27-012", as: "ultimate" },
      ],
      deck: Array.from({ length: 12 }, () => "BT1-009"),
      security: 3,
    },
    1: {
      battleArea: ["BT1-009", "BT1-019", "BT1-019"],
      deck: Array.from({ length: 12 }, () => "BT1-010"),
      security: 3,
    },
  },
};

export default fixture;
