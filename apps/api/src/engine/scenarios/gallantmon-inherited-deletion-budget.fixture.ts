import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "gallantmon-inherited-deletion-budget",
  turnSeat: 0,
  turnCount: 3,
  memory: 5,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      deck: ["BT1-009", "BT1-009", "BT1-009"],
      security: ["BT1-009", "BT1-009"],
      hand: [{ card: "AD1-008", as: "gallantmon" }],
      battleArea: [{ card: "EX13-013", as: "evolution-base", under: ["EX13-010"] }],
    },
    1: {
      deck: ["BT1-009", "BT1-009", "BT1-009"],
      security: ["BT1-009", "BT1-009", "BT1-009"],
      battleArea: [
        { card: "BT1-010", as: "twelve-thousand", dp: 12000 },
        { card: "BT1-010", as: "thirteen-thousand", dp: 13000 },
      ],
    },
  },
};

export default fixture;
