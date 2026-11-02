import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "then-by-cost-prompt-highlights-printed-clause",
  board: {
    0: {
      battleArea: [{ card: "ST23-09", as: "glowing-dawn" }],
      hand: [{ card: "BT25-043", as: "habakirimon" }],
      deck: Array<string>(12).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [{ card: "BT13-075", as: "enemy" }],
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
