import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "bracketed-name-digivolve-excludes-containing-names",
  board: {
    0: {
      battleArea: [
        { card: "BT14-007", as: "agumon", under: ["BT5-001"] },
        { card: "BT1-085", as: "tai" },
      ],
      hand: [
        { card: "BT14-101", as: "warGreymon" },
        { card: "BT1-015", as: "greymon" },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [{ card: "BT1-024", as: "metalTyrannomon" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
  },
  memory: 1,
  turnSeat: 0,
  turnCount: 6,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
