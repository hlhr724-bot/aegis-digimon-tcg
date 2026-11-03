import type { ScenarioFixture } from "#api/engine/scenario/types";

export default {
  memory: 8,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "BT1-051", as: "base" },
        { card: "ST1-12", as: "tamer", under: [{ card: "BT1-009", as: "tamerCost", faceUp: false }] },
      ],
      hand: [
        { card: "BT25-041", as: "murasamemon" },
        { card: "ST23-13", as: "playableTamer" },
        { card: "BT1-010", as: "wrongTrait" },
      ],
      security: [{ card: "BT1-011", as: "securityCost" }],
      deck: ["BT1-012", "BT1-012", "BT1-012", "BT1-012"],
    },
    1: {
      security: ["BT1-009", "BT1-010", "BT1-011"],
      deck: ["BT1-012", "BT1-012", "BT1-012", "BT1-012"],
    },
  },
} satisfies ScenarioFixture;
