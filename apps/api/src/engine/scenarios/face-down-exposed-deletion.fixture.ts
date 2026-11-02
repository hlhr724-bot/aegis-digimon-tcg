import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "face-down-exposed-deletion",
  memory: 10,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
      hand: [{ card: "AD1-009", as: "blitz" }],
      battleArea: ["ST1-12"],
    },
    1: {
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
      battleArea: [{ card: "BT1-025", as: "hiddenStack", under: [{ card: "BT26-077", faceUp: false }] }],
    },
  },
};

export default fixture;
