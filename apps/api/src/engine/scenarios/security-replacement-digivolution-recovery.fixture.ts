import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "security-replacement-digivolution-recovery",
  board: {
    0: {
      deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
      security: ["BT1-009"],
      hand: [{ card: "BT26-103", as: "wrath-mode" }],
      battleArea: [{ card: "BT24-101", as: "jupitermon", under: ["BT24-003"] }],
    },
    1: {
      deck: ["BT1-009", "BT1-009"],
      security: ["BT1-084"],
    },
  },
  turnSeat: 0,
  turnCount: 3,
  memory: 10,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
