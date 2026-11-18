import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "search-picks-every-category-in-one-answer",
  board: {
    0: {
      hand: [{ card: "EX9-035", as: "searcher" }],
      deck: [
        "BT1-009",
        { card: "BT26-077", as: "hand-only" },
        { card: "EX9-035", as: "either-category" },
        { card: "BT26-048", as: "other-either-category" },
        ...Array<string>(10).fill("BT1-009"),
      ],
      security: 3,
    },
    1: { deck: Array<string>(12).fill("BT1-009"), security: 3 },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
