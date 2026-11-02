import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "cost-host-selection-does-not-delete",
  turnSeat: 0,
  turnCount: 3,
  memory: 4,
  isFirstPlayersFirstTurn: false,
  presentation: { timed: false },
  board: {
    0: {
      battleArea: [
        { card: "BT26-094", as: "firstKeenan" },
        { card: "BT26-094", as: "secondKeenan" },
      ],
      hand: [
        { card: "BT26-072", as: "peckmon" },
        { card: "BT1-009", as: "cost" },
      ],
      deck: ["BT1-010", "BT1-011"],
    },
    1: { deck: ["BT1-010", "BT1-011"], security: ["BT1-009"] },
  },
};

export default fixture;
