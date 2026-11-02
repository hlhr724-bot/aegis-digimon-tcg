import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "breeding-move-preserves-main-actions",
  board: {
    0: {
      breeding: { card: "EX9-058", as: "raised-gazimon", under: ["BT15-006"] },
      hand: [{ card: "EX9-058", as: "played-gazimon" }],
      deck: ["BT1-009", "EX9-049", "EX9-010", "BT1-009", "BT1-009", "BT1-009"],
      security: 5,
    },
    1: {
      deck: Array<string>(8).fill("BT1-009"),
      security: 5,
    },
  },
  memory: 5,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
