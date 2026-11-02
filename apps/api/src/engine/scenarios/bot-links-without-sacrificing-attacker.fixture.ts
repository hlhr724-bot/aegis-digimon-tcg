import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 1,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT21-009", as: "host", suspended: true }],
      hand: [{ card: "BT21-009", as: "link" }],
      deck: ["BT1-010", "BT1-010", "BT1-010"],
      security: 3,
    },
    1: { deck: ["BT1-010"], security: 3 },
  },
};

export default fixture;
