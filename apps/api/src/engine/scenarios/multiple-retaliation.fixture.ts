import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "multiple-retaliation",
  board: {
    0: {
      battleArea: [{ card: "EX13-045", as: "winner", dp: 25000, under: ["EX13-021"] }],
      deck: Array(10).fill("BT1-009"),
    },
    1: {
      battleArea: [{ card: "BT1-009", as: "holder", under: ["BT26-070", "ST23-12"], suspended: true }],
      deck: Array(10).fill("BT1-009"),
      security: Array(5).fill("BT1-009"),
    },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
