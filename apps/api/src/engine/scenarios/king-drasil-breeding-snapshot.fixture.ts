import type { ScenarioFixture } from "../scenario/types.js";

const FILLER = "BT1-009";

export function kingDrasilBreedingSnapshot(): ScenarioFixture {
  return {
    name: "king-drasil-breeding-snapshot",
    memory: 10,
    turnSeat: 0,
    turnCount: 4,
    isFirstPlayersFirstTurn: false,
    board: {
      0: {
        breeding: { card: "BT13-007", under: ["BT1-001", "BT1-001"] },
        battleArea: [{ card: "BT1-014", under: [FILLER] }],
        hand: [{ card: "BT2-020", as: "royalKnight" }],
        deck: Array<string>(20).fill(FILLER),
        eggDeck: ["BT1-001"],
        security: 4,
      },
      1: {
        battleArea: [{ card: "BT1-020" }],
        hand: [FILLER, FILLER],
        deck: Array<string>(20).fill(FILLER),
        eggDeck: ["BT1-001"],
        security: 4,
      },
    },
  };
}

export default kingDrasilBreedingSnapshot();
