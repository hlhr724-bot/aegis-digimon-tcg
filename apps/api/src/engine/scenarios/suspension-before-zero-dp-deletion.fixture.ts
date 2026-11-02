import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "suspension-before-zero-dp-deletion",
  board: {
    0: {
      battleArea: [
        { card: "EX13-041", as: "payer" },
        { card: "EX13-045", as: "examon", under: ["EX13-024"] },
        { card: "EX13-044", as: "breakdramon" },
      ],
      deck: Array(10).fill("BT1-010"),
      security: 3,
    },
    1: {
      hand: [{ card: "BT1-106", as: "reduction" }],
      battleArea: [{ card: "BT1-048", as: "opponent" }],
      deck: Array(10).fill("BT1-010"),
      security: 3,
    },
  },
  memory: 10,
  turnSeat: 1,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
  presentation: {
    opponent: {
      main: [{ kind: "play", card: "BT1-106" }],
      decisions: [{ sourceCard: "BT1-106", kind: "chooseTargets", target: "payer" }],
      fallbackMain: "end",
    },
  },
};

export default fixture;
