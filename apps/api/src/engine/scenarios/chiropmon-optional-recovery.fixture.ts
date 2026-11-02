import type { ScenarioFixture } from "#api/engine/scenario/types";

export const chiropmonOptionalRecovery: ScenarioFixture = {
  memory: 6,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT1-085", as: "tamer", under: [{ card: "ST23-03", as: "payment", faceUp: false }] }],
      hand: [{ card: "ST23-12", as: "chiropmon" }],
      trash: [{ card: "ST23-07", as: "recovery" }],
      deck: ["BT1-010", "BT1-011"],
      security: 3,
      eggDeck: ["BT1-001"],
    },
    1: { deck: ["BT1-010", "BT1-011"], security: 3 },
  },
};

export default chiropmonOptionalRecovery;
