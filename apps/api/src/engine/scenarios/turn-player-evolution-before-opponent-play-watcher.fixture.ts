import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "turn-player-evolution-before-opponent-play-watcher",
  board: {
    0: {
      battleArea: [{ card: "BT24-034", as: "base", under: ["BT26-001", "BT25-008"] }],
      hand: [
        { card: "BT26-015", as: "butenmon" },
        { card: "BT26-016", as: "chronomon" },
      ],
      trash: [{ card: "BT1-009", as: "return-cost" }],
      deck: ["BT1-010", "BT1-011", "BT1-012"],
      security: ["BT1-010", "BT1-011", "BT1-012"],
    },
    1: {
      battleArea: [
        { card: "TOKEN-Kotenken", as: "kotenken" },
        { card: "EX12-034", as: "erlangmon" },
      ],
      hand: [{ card: "EX12-012", as: "apemon" }],
      deck: ["BT1-010", "BT1-011", "BT1-012"],
      security: ["BT1-010", "BT1-011", "BT1-012"],
    },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 1,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
