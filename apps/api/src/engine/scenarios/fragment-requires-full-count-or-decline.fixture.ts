import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "fragment-requires-full-count-or-decline",
  memory: 3,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT1-009" }],
      hand: [{ card: "ST1-16", as: "removal" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
    1: {
      battleArea: [
        {
          card: "BT22-061",
          as: "fragmentHolder",
          under: [
            { card: "BT1-027" },
            { card: "BT1-027" },
            { card: "BT1-027" },
            { card: "BT1-027" },
            { card: "BT1-027" },
          ],
        },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
  },
};

export default fixture;
