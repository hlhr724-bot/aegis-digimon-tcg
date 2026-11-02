import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "milled-impmon-revival-does-not-repeat",
  board: {
    0: {
      battleArea: [{ card: "EX2-043", as: "miller", under: ["EX2-040"] }],
      deck: ["BT1-009", { card: "EX2-039", as: "impmon" }, "BT1-009", "EX2-044", ...Array<string>(12).fill("BT1-009")],
      security: 5,
    },
    1: { deck: Array<string>(10).fill("BT1-009"), security: 5 },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
