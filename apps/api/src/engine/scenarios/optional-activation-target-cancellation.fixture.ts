import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 8,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT11-071", as: "base" }],
      hand: [{ card: "BT25-029", as: "evolution" }],
      deck: Array<string>(8).fill("BT1-010"),
      security: ["BT1-010"],
    },
    1: {
      battleArea: [{ card: "ST1-03", as: "opponent" }],
      deck: Array<string>(8).fill("BT1-010"),
      security: ["BT1-010"],
    },
  },
};

export default fixture;
