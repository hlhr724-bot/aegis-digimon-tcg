import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "attack-target-cannot-switch-to-current-target",
  board: {
    0: {
      battleArea: [{ card: "BT1-009", as: "attacker", dp: 14000 }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [
        { card: "EX12-019", as: "nezhamon", suspended: true, under: ["EX12-056"] },
        { card: "BT1-020", as: "otherTarget", suspended: true },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
