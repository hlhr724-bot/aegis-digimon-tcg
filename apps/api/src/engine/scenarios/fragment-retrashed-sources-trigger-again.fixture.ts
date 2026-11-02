import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "fragment-retrashed-sources-trigger-again",
  memory: 10,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      hand: [{ card: "BT25-028", as: "remover" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
    1: {
      battleArea: [
        {
          card: "EX11-044",
          as: "fragmentHolder",
          under: [
            { card: "EX8-005", as: "memorySource" },
            { card: "EX11-038", as: "drawSource" },
            { card: "P-215", as: "plainSource" },
          ],
        },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
  },
};

export default fixture;
