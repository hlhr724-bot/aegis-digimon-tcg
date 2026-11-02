import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "redirected-attack-battles-defender",
  board: {
    0: {
      battleArea: [{ card: "BT24-029", as: "attacker", under: [{ card: "BT24-021", as: "source" }] }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [{ card: "AD1-012", as: "defender" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
