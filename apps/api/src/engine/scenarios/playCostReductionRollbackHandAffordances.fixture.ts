import type { ScenarioFixture } from "#api/engine/scenario/types";

const playCostReductionRollbackHandAffordancesFixture: ScenarioFixture = {
  memory: 0,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: true,
  board: {
    0: {
      hand: ["BT13-080", "BT13-083", "P-201"],
      deck: ["BT1-009", "BT1-009"],
      security: ["BT1-009"],
      breeding: "ST6-01",
    },
    1: { deck: ["BT1-009"], security: ["BT1-019"] },
  },
};

export default playCostReductionRollbackHandAffordancesFixture;
