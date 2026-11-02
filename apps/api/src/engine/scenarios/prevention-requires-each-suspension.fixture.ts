import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "prevention-requires-each-suspension",
  memory: 10,
  turnSeat: 1,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT24-030", as: "protector", dp: 1000 }],
      deck: Array<string>(10).fill("BT1-010"),
      security: 5,
    },
    1: {
      battleArea: [{ card: "BT24-085", as: "redSource" }],
      hand: [1, 2, 3].map((n) => ({ card: "BT2-091", as: `removal${n}` })),
      deck: Array<string>(10).fill("BT1-010"),
      security: 5,
    },
  },
};

export default fixture;
