import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 3,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "BT4-115", as: "lucemon" },
        { card: "BT3-033", as: "salamon" },
      ],
      hand: [{ card: "BT3-037", as: "turuiemon" }],
      deck: Array<string>(8).fill("ST1-03"),
      security: 3,
    },
    1: {
      deck: Array<string>(8).fill("ST1-03"),
      security: 3,
    },
  },
};

export default fixture;
