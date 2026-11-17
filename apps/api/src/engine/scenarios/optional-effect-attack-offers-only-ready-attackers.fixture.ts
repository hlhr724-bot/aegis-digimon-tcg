import type { ScenarioFixture } from "#api/engine/scenario/types";

const optionalEffectAttackOffersOnlyReadyAttackers: ScenarioFixture = {
  memory: 5,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "ST26-04", as: "establishedHost", under: ["EX8-022"] },
        { card: "EX8-022", as: "playedThisTurn", enteredThisTurn: true },
      ],
      hand: [{ card: "ST26-05", as: "yukinamon" }],
      deck: [{ card: "BT1-010", as: "turnDraw" }, "BT1-011", "BT1-012", "BT1-013", "BT1-014"],
      eggDeck: ["BT1-001"],
      security: 3,
    },
    1: {
      deck: Array<string>(8).fill("BT1-010"),
      security: ["BT1-010", "BT1-010", "BT1-010"],
    },
  },
};

export default optionalEffectAttackOffersOnlyReadyAttackers;
