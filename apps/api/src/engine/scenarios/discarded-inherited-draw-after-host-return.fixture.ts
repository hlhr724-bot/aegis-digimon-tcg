import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "discarded-inherited-draw-after-host-return",
  board: {
    0: {
      battleArea: [{ card: "BT11-081", as: "host", under: [{ card: "EX10-045", as: "source" }] }],
      deck: [{ card: "BT1-010", as: "drawn" }, ...Array(8).fill("BT1-010")],
      security: 3,
    },
    1: {
      hand: [{ card: "BT14-026", as: "zudomon" }],
      deck: Array(8).fill("BT1-010"),
      security: 3,
    },
  },
  memory: 10,
  turnSeat: 1,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
  presentation: {
    opponent: {
      main: [{ kind: "play", card: "BT14-026" }],
      fallbackMain: "end",
    },
  },
};
export default fixture;
