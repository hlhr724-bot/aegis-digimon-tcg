import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "dna-resets-opponent-memory",
  board: {
    0: {
      battleArea: [{ card: "BT17-069", as: "fenri", under: ["BT1-085"] }],
      hand: [{ card: "BT20-035", as: "kazuchi" }],
      trash: ["BT17-101"],
      deck: Array(8).fill("BT1-009"),
      security: 3,
    },
    1: { deck: Array(8).fill("BT1-009"), security: 3 },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
