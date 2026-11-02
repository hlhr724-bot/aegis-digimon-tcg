import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "trashed-option-trait-places-option",
  board: {
    0: {
      battleArea: [{ card: "BT14-071", as: "purpleSource" }],
      hand: [
        { card: "EX5-069", as: "bitingCrush" },
        { card: "BT15-100", as: "demonLordOption" },
      ],
      deck: Array(10).fill("BT1-009"),
    },
    1: {
      battleArea: [{ card: "BT1-020", as: "victim" }],
      deck: Array(10).fill("BT1-009"),
      security: Array(5).fill("BT1-009"),
    },
  },
  memory: 8,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
