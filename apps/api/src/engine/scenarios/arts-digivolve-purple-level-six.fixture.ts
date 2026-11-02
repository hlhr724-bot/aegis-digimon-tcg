import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "arts-digivolve-purple-level-six",
  turnSeat: 0,
  turnCount: 3,
  memory: 10,
  isFirstPlayersFirstTurn: false,
  presentation: { timed: false },
  board: {
    0: {
      battleArea: [{ card: "BT4-089", as: "plutomon" }],
      hand: [{ card: "BT27-085", as: "ravemon" }],
      deck: ["BT1-010", "BT1-011"],
    },
    1: { hand: ["BT1-009"], security: ["BT1-009"] },
  },
};

export default fixture;
