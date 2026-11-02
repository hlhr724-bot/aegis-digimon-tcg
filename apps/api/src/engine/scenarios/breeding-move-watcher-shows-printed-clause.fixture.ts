import type { ScenarioFixture } from "#api/engine/scenario/types";

export function breedingMoveWatcherShowsPrintedClause(): ScenarioFixture {
  return {
    memory: 3,
    turnSeat: 1,
    turnCount: 0,
    isFirstPlayersFirstTurn: false,
    board: {
      0: {
        battleArea: [{ card: "BT15-054", as: "rosemonX", under: ["BT15-048", "BT9-109"] }],
        deck: Array<string>(4).fill("BT1-010"),
        eggDeck: ["BT1-001"],
        security: 3,
      },
      1: {
        breeding: { card: "BT1-009", as: "breedingMover" },
        battleArea: [{ card: "BT1-010", as: "suspendTarget" }],
        deck: Array<string>(4).fill("BT1-010"),
        eggDeck: ["BT1-001"],
        security: 3,
      },
    },
  };
}

export default breedingMoveWatcherShowsPrintedClause();
