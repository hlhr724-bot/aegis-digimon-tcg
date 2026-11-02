import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "breeding-evolution-ignores-blitz-grant",
  board: {
    0: {
      breeding: { card: "EX2-009", as: "growlmon", under: ["EX2-001", "EX2-008"] },
      battleArea: [{ card: "EX2-056", as: "takato" }],
      hand: [{ card: "BT12-016", as: "wargrowlmon" }],
      deck: ["BT1-009", "BT1-009", "BT1-009"],
    },
    1: { deck: ["BT1-009", "BT1-009", "BT1-009"], security: ["BT1-009", "BT1-009"] },
  },
  memory: 1,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
