import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "hand-play-selection-hides-opponent-hand",
  board: {
    0: {
      hand: [
        { card: "BT17-094", as: "guardianDeity" },
        { card: "AD1-020", as: "ownTamer" },
      ],
      battleArea: [{ card: "AD1-019", as: "fieldTamer" }],
      deck: Array(8).fill("BT1-009"),
    },
    1: {
      hand: [
        { card: "AD1-020", as: "opponentTamer" },
        { card: "BT12-032", as: "opponentTenWarrior" },
        { card: "BT1-009", as: "opponentOther" },
      ],
      deck: Array(8).fill("BT1-009"),
    },
  },
  memory: 5,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
