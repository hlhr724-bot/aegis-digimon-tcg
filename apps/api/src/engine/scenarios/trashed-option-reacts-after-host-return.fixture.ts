import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "trashed-option-reacts-after-host-return",
  board: {
    0: {
      deck: Array<string>(10).fill("BT1-009"),
      battleArea: [{ card: "BT1-038", as: "slayer-base" }],
      hand: [{ card: "EX13-024", as: "slayer" }],
    },
    1: {
      deck: Array<string>(10).fill("BT1-009"),
      battleArea: [{ card: "BT1-009", as: "host", under: [{ card: "EX7-070", as: "blitz" }] }],
    },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
