import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "fragment-source-trigger-resolves-after-host-deleted",
  memory: 10,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      hand: [{ card: "BT6-101", as: "dpReducer" }],
      battleArea: [{ card: "BT1-057", as: "dedigivolveTarget", under: [{ card: "BT1-009", as: "targetSource" }] }],
      deck: Array<string>(8).fill("BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
    1: {
      battleArea: [
        {
          card: "EX11-044",
          as: "fragmentHolder",
          under: [
            { card: "P-215", as: "plainSource" },
            { card: "BT1-009", as: "fillerSource" },
            { card: "P-167", as: "dedigivolveSource" },
          ],
        },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
  },
};

export default fixture;
