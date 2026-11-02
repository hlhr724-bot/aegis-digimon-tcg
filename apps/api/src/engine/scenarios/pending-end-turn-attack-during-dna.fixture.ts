import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "pending-end-turn-attack-during-dna",
  board: {
    0: {
      battleArea: [
        { card: "BT22-013", as: "wargreymon", under: ["EX4-038"] },
        { card: "BT22-026", as: "metalgarurumon", under: ["BT22-017"] },
        { card: "BT17-081", as: "tai-and-matt" },
      ],
      hand: [{ card: "BT22-015", as: "omnimon" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 5,
    },
    1: {
      deck: Array<string>(8).fill("BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
    },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 5,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
