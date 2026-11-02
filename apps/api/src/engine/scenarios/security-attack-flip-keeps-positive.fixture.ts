import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "security-attack-flip-keeps-positive",
  board: {
    0: {
      battleArea: [
        { card: "BT1-062", as: "base" },
        { card: "EX12-048", as: "attacker" },
      ],
      hand: [{ card: "EX6-031", as: "flipper" }],
      deck: Array(10).fill("BT1-009"),
    },
    1: { deck: Array(10).fill("BT1-009"), security: Array(5).fill("BT1-009") },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
