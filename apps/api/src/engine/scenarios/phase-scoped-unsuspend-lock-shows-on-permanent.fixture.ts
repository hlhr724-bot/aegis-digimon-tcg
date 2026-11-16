import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "phase-scoped-unsuspend-lock-shows-on-permanent",
  board: {
    0: {
      hand: [{ card: "EX13-041", as: "groundramon" }],
      deck: Array(12).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [{ card: "BT1-013", as: "lockedDigimon" }],
      deck: Array(12).fill("BT1-009"),
      security: 3,
    },
  },
  memory: 7,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
