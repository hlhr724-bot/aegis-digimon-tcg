import type { ScenarioFixture } from "#api/engine/scenario/types";

export function dualTrashClauseOffersOrderPreset(): ScenarioFixture {
  return {
    memory: 3,
    turnSeat: 0,
    turnCount: 0,
    isFirstPlayersFirstTurn: false,
    board: {
      0: {
        battleArea: [{ card: "EX11-049", as: "evilDragonAttacker" }],
        hand: Array<string>(3).fill("BT1-010"),
        trash: [{ card: "LM-068", as: "blackSabbath" }],
        deck: Array<string>(4).fill("BT1-010"),
        eggDeck: ["BT1-001"],
        security: 3,
      },
      1: {
        battleArea: [{ card: "BT1-020", as: "levelFiveDefender" }],
        deck: Array<string>(4).fill("BT1-010"),
        eggDeck: ["BT1-001"],
        security: 3,
      },
    },
  };
}

export default dualTrashClauseOffersOrderPreset();
