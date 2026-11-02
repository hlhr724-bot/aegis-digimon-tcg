import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "pending-deletion-trash-choice",
  board: {
    0: {
      battleArea: [
        { card: "BT18-015", as: "kimeramon" },
        { card: "BT11-072", as: "machinedramon" },
      ],
      hand: [{ card: "BT18-019", as: "millennium" }],
      deck: ["BT1-009", "BT1-009", "BT1-009"],
      security: 5,
      eggDeck: ["BT1-001"],
    },
    1: {
      battleArea: [{ card: "BT3-047", as: "pending", top: { card: "BT3-047", as: "pending-card" } }],
      trash: [{ card: "BT3-047", as: "old-card" }],
      deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
      security: 5,
      eggDeck: ["BT1-001"],
    },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
