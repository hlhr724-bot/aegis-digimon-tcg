import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "security-memory-gain-after-reveal",
  memory: 4,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT1-059", as: "attacker" }],
      deck: [{ card: "BT1-009", as: "turnDraw" }, "BT1-009"],
      security: ["BT1-009", "BT1-009"],
    },
    1: {
      security: [{ card: "BT4-111", as: "jackRaid" }, "BT1-009", "BT1-009"],
      deck: ["BT1-009", "BT1-009", "BT1-009"],
    },
  },
};

export default fixture;
