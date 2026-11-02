import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "security-removal-retriggers-before-pending-reactions",
  board: {
    0: {
      battleArea: [{ card: "EX13-033", as: "mistymon", under: ["EX13-004"] }],
      hand: [{ card: "EX13-037", as: "dynasmon" }],
      deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
      security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
    },
    1: {
      battleArea: [{ card: "BT26-103", as: "wrathMode", under: ["BT26-029"] }],
      security: ["BT1-009", "BT1-009", "BT1-009"],
      deck: ["BT1-009", "BT1-009"],
    },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 1,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
