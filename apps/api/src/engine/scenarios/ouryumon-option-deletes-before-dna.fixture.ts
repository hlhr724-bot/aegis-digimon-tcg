import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "ouryumon-option-deletes-before-dna",
  board: {
    0: {
      battleArea: [
        { card: "BT27-015", as: "ouryumon" },
        { card: "BT13-075", as: "alphamon" },
      ],
      hand: [
        { card: "BT27-103", as: "used-option" },
        { card: "BT27-103", as: "unused-option" },
      ],
      deck: Array<string>(12).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [
        { card: "BT1-009", as: "first-enemy" },
        { card: "BT1-010", as: "second-enemy" },
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
