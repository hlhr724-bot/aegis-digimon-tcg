import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "option-main-prompt-highlights-resolving-clause",
  board: {
    0: {
      battleArea: [{ card: "BT25-039", as: "sirenmon" }],
      hand: [{ card: "BT26-032", as: "ceresmon" }],
      deck: Array<string>(12).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [
        { card: "BT1-009", as: "first-enemy" },
        { card: "BT1-009", as: "second-enemy" },
        { card: "BT1-009", as: "third-enemy" },
        { card: "BT1-009", as: "fourth-enemy" },
      ],
      deck: Array<string>(12).fill("BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
  },
  memory: 6,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
