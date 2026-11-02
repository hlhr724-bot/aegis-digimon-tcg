import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "dokugumon-scapegoat-payment-on-deletion",
  memory: 5,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "BT1-016", as: "attacker", dp: 20000 },
        { card: "BT1-009", as: "bystander" },
      ],
      deck: Array<string>(12).fill("BT1-009"),
      security: 5,
    },
    1: {
      battleArea: [
        { card: "EX8-059", as: "scapegoatHolder", suspended: true },
        { card: "P-163", as: "dokugumon" },
      ],
      security: [{ card: "EX8-071", as: "nightmareSoldiers", faceUp: true }, "BT1-009", "BT1-009", "BT1-009"],
      deck: Array<string>(12).fill("BT1-009"),
    },
  },
};

export default fixture;
