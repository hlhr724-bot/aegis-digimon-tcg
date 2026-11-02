import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "suspension-cost-grants-rush-after-entry",
  board: {
    0: {
      battleArea: [
        { card: "LM-009", as: "airdramon" },
        { card: "LM-008", as: "base" },
        { card: "ST1-03", as: "unrelated" },
      ],
      hand: [{ card: "LM-011", as: "symbare" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: {
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
  },
  memory: 8,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
