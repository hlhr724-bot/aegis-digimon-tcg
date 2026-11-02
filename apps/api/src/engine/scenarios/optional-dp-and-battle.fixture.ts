import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 3,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "EX12-052", as: "attacker" }],
      deck: Array<string>(8).fill("BT1-010"),
      eggDeck: ["BT1-001"],
      security: 3,
    },
    1: {
      battleArea: [{ card: "BT1-009", as: "opponent" }],
      security: ["BT1-010"],
      deck: Array<string>(8).fill("BT1-010"),
      eggDeck: ["BT1-001"],
    },
  },
};

export default fixture;
