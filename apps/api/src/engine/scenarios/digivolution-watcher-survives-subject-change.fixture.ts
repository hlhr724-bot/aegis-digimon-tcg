import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "digivolution-watcher-survives-subject-change",
  board: {
    0: {
      deck: ["BT1-009", "BT1-009", "BT1-009"],
      hand: [{ card: "EX10-052", as: "chaos-mode" }, "BT1-009"],
      battleArea: [
        { card: "EX10-013", as: "lucemon" },
        { card: "EX11-067", as: "first-dokuson" },
        { card: "EX11-067", as: "second-dokuson" },
      ],
    },
    1: {
      deck: ["BT1-009", "BT1-009"],
      hand: [{ card: "BT22-064", as: "replacement-diaboromon" }],
      battleArea: [
        { card: "BT24-065", as: "protector", under: ["EX6-041"] },
        { card: "BT22-064", as: "deletion-watcher" },
        { card: "TOKEN-Diaboromon", as: "victim" },
      ],
    },
  },
  turnSeat: 0,
  turnCount: 3,
  memory: 10,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
