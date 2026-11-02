import type { ScenarioFixture } from "#api/engine/scenario/types";

const decisionRollbackHandAffordancesFixture: ScenarioFixture = {
  memory: 10,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: true,
  board: {
    0: {
      hand: ["BT18-042", "BT1-009"],
      deck: ["BT1-009"],
      security: ["BT1-009", "BT1-012"],
      battleArea: [{ card: "BT1-060", under: ["BT1-009"] }],
    },
    1: { deck: ["BT1-009"], security: ["BT1-019"] },
  },
};

export default decisionRollbackHandAffordancesFixture;
