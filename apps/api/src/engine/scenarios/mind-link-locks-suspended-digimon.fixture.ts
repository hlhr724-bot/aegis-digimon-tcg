import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "mind-link-locks-suspended-digimon",
  board: {
    0: {
      battleArea: [{ card: "BT24-086", as: "witch" }],
      hand: [{ card: "BT15-058", as: "ginryumon" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [{ card: "EX12-035", as: "metalgarurumon", suspended: true }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
  },
  memory: 8,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
