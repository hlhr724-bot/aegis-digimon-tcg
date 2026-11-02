import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "optional-bound-deletion-keeps-both-boards",
  board: {
    0: {
      battleArea: [{ card: "BT26-055", as: "other-giromon" }],
      hand: [
        { card: "BT26-055", as: "giromon" },
        { card: "BT1-009", as: "placement" },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [{ card: "BT1-009", as: "opponent" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
  },
  memory: 7,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
