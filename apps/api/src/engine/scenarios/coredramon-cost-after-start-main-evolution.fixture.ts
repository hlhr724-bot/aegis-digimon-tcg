import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "coredramon-cost-after-start-main-evolution",
  board: {
    0: {
      deck: Array<string>(12).fill("BT1-009"),
      battleArea: [
        { card: "EX3-065", as: "hina" },
        { card: "LM-055", as: "training" },
      ],
      breeding: { card: "BT21-046", as: "dracomon", under: ["EX13-005"] },
      hand: [
        { card: "EX13-018", as: "coredramon" },
        { card: "EX13-024", as: "cost" },
      ],
      security: 4,
    },
    1: { deck: Array<string>(12).fill("BT1-009"), security: 5 },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
