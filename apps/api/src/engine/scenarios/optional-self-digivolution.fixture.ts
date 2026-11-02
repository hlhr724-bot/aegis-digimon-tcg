import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 10,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "P-194", as: "host", under: ["BT24-003", "BT24-033"] }],
      hand: [
        { card: "BT24-014", as: "shaman" },
        { card: "BT24-093", as: "firstTemple" },
        { card: "BT24-093", as: "secondTemple" },
        { card: "BT24-093", as: "thirdTemple" },
        { card: "BT24-101", as: "jupitermon" },
        { card: "BT1-060", as: "nonShaman" },
      ],
      eggDeck: ["BT24-003"],
      security: ["BT1-009", "BT1-010", "BT1-011"],
      deck: ["BT1-012", "BT1-013", "BT1-014", "BT1-015", "BT1-016", "BT1-017"],
    },
    1: { deck: ["BT1-009", "BT1-010"], security: 3 },
  },
};

export default fixture;
