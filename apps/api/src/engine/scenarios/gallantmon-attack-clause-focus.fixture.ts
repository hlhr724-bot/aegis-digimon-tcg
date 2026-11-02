import type { ScenarioFixture } from "#api/engine/scenario/types";

export default {
  memory: 10,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT9-014", as: "base" }],
      hand: [{ card: "AD1-008", as: "gallantmon" }],
      deck: Array<string>(8).fill("ST1-03"),
      security: 3,
    },
    1: {
      battleArea: [
        { card: "BT1-010", as: "firstTarget" },
        { card: "BT1-010", as: "secondTarget" },
      ],
      deck: Array<string>(8).fill("ST1-03"),
      security: ["ST1-03", "ST1-03", "ST1-03"],
    },
  },
} satisfies ScenarioFixture;
