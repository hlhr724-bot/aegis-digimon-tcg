import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "assembly-root-declaration",
  memory: 10,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      hand: [{ card: "BT26-073", as: "assemblyDigimon" }],
      trash: [
        { card: "BT26-001", as: "firstMaterial" },
        { card: "BT26-069", as: "secondMaterial" },
      ],
      security: ["BT1-009", "BT1-010"],
      deck: ["BT1-013", "BT1-014", "BT1-015", "BT1-016"],
    },
    1: {
      security: ["BT1-009", "BT1-010"],
      deck: ["BT1-013", "BT1-014", "BT1-015", "BT1-016"],
    },
  },
};

export default fixture;
