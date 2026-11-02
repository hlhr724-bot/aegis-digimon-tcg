import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "option-trash-respects-dual-digimon",
  memory: 5,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "AD1-025", as: "omnimon" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
    1: {
      battleArea: [
        { card: "BT26-032", as: "ceresmon", suspended: true, under: ["BT25-059"] },
        { card: "BT1-010", as: "victim", suspended: true },
        { card: "P-039", as: "option" },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
  },
};

export default fixture;
