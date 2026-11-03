import type { ScenarioFixture } from "#api/engine/scenario/types";

export default {
  memory: 10,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "BT1-080", as: "green", under: ["BT1-076"] },
        { card: "ST2-10", as: "blue", under: ["BT1-038"] },
      ],
      hand: [{ card: "BT23-047", as: "examon" }],
      deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
      security: 3,
    },
    1: {
      battleArea: [
        { card: "BT1-009", as: "first" },
        { card: "BT1-010", as: "second" },
        { card: "BT1-011", as: "third" },
        { card: "ST1-12", as: "firstTamer" },
        { card: "ST2-12", as: "secondTamer" },
        { card: "BT1-012", as: "spared" },
      ],
      deck: ["BT1-009", "BT1-010", "BT1-011", "BT1-012"],
      security: 3,
    },
  },
} satisfies ScenarioFixture;
