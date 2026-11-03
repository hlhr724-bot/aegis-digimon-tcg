import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "monitamon-adds-two-from-either-category",
  board: {
    0: {
      hand: [{ card: "BT10-058", as: "monitamon" }],
      deck: [
        { card: "BT18-069", as: "blackKnightmon" },
        { card: "BT18-083", as: "blackLordKnightmon" },
        { card: "BT5-042", as: "yellowKnightmon" },
        { card: "BT10-060", as: "twilightSparrowmon" },
        ...Array(6).fill("BT1-009"),
      ],
      security: 3,
    },
    1: { deck: Array(8).fill("BT1-009"), security: 3 },
  },
  memory: 5,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
