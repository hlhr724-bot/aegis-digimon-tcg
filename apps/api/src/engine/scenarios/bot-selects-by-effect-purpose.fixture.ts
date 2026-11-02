import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 4,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT1-009", as: "source" }],
      hand: [
        { card: "BT1-010", as: "cheapCost" },
        { card: "BT1-023", as: "valuableHand" },
      ],
      trash: [
        { card: "BT1-010", as: "smallRecovery" },
        { card: "BT1-023", as: "largeRecovery" },
      ],
      deck: ["BT1-010", "BT1-010", "BT1-010"],
      security: 3,
    },
    1: {
      battleArea: [
        { card: "BT1-010", as: "smallTarget" },
        { card: "BT1-023", as: "largeTarget" },
      ],
      deck: ["BT1-010"],
      security: 3,
    },
  },
};

export default fixture;
