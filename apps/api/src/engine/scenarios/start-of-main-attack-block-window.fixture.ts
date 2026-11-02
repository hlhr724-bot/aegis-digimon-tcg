import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "start-of-main-attack-block-window",
  memory: 8,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      hand: [{ card: "BT25-054", as: "grantor" }],
      security: ["BT1-009", "BT1-010"],
      deck: ["BT1-013", "BT1-014", "BT1-015", "BT1-016"],
    },
    1: {
      battleArea: [{ card: "BT1-043", as: "attacker" }],
      security: ["BT1-009", "BT1-010"],
      deck: ["BT1-013", "BT1-014", "BT1-015", "BT1-016"],
    },
  },
};

export default fixture;
