import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "dna-charge-respects-pending-pillomon",
  board: {
    0: {
      battleArea: [
        {
          card: "AD1-021",
          as: "marcus",
          under: [
            { card: "BT1-009", faceUp: false },
            { card: "BT1-009", faceUp: false },
          ],
        },
      ],
      hand: [
        { card: "ST24-06", as: "rizeGreymon" },
        { card: "ST24-15", as: "dnaCharge" },
        { card: "EX13-026", as: "kudamon" },
        { card: "ST24-13", as: "tamer" },
      ],
      deck: Array.from({ length: 8 }, () => "BT1-009"),
      security: ["BT1-009", "BT1-009"],
    },
    1: {
      battleArea: [{ card: "BT9-033", as: "pillomon" }],
      security: ["BT1-009", "BT1-009"],
      deck: ["BT1-009", "BT1-009"],
    },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 1,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
