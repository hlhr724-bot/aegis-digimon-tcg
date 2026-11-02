import type { ScenarioFixture } from "#api/engine/scenario/types";

export function multiWatcherBoxLabelsSuspendWatcher(): ScenarioFixture {
  return {
    memory: 3,
    turnSeat: 0,
    turnCount: 0,
    isFirstPlayersFirstTurn: false,
    board: {
      0: {
        battleArea: [{ card: "BT27-070", as: "craniamonX", under: ["AD1-015"] }],
        hand: Array<string>(3).fill("BT1-010"),
        deck: Array<string>(4).fill("BT1-010"),
        eggDeck: ["BT1-001"],
        security: 3,
      },
      1: {
        battleArea: [{ card: "BT1-020", as: "lowestDpDefender" }],
        deck: Array<string>(4).fill("BT1-010"),
        eggDeck: ["BT1-001"],
        security: 3,
      },
    },
  };
}

export default multiWatcherBoxLabelsSuspendWatcher();
