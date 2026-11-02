import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 10,
  turnSeat: 0,
  turnCount: 6,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT2-072", as: "remover" }],
      hand: [{ card: "BT2-110", as: "trumpSword" }],
      deck: ["BT1-010", "BT1-010", "BT1-010"],
      security: 3,
    },
    1: {
      battleArea: [{ card: "BT10-015", as: "armor", under: [{ card: "BT10-008", as: "promoted" }] }],
      deck: ["BT1-010", "BT1-010", "BT1-010"],
      security: 3,
    },
  },
};

export default fixture;
