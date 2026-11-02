import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "kurata-deletion-continues-after-source-placement",
  board: {
    0: {
      battleArea: [
        { card: "BT13-103", as: "original-kurata" },
        { card: "EX10-066", as: "other-kurata" },
        { card: "BT13-088", as: "belphemon" },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [
        { card: "BT27-015", as: "first-target" },
        { card: "BT27-015", as: "second-target" },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
  },
  memory: 3,
  turnSeat: 1,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
  presentation: { opponent: { endBreeding: true, fallbackMain: "end" } },
};

export default fixture;
