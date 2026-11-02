import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "face-down-stacked-cards-are-not-playable",
  board: {
    0: {
      deck: ["BT1-009", "BT1-009"],
      battleArea: [
        {
          card: "BT7-073",
          as: "loweemonHost",
          suspended: true,
          under: [{ card: "BT7-091", as: "loweemonSource", faceUp: false }, "ST23-14", "BT18-076"],
        },
        {
          card: "BT7-073",
          as: "kazemonHost",
          suspended: true,
          under: [{ card: "BT18-091", as: "kazemonSource", faceUp: false }, "BT18-048"],
        },
        { card: "BT19-013", as: "shoutmonX5", suspended: true },
        { card: "ST23-14", as: "glowingDawnTamer", under: [{ card: "BT10-007", as: "underTamer", faceUp: false }] },
      ],
    },
    1: { deck: ["BT1-009", "BT1-009"], battleArea: [{ card: "BT1-010", as: "attacker", dp: 20000 }] },
  },
  turnSeat: 1,
  turnCount: 2,
  memory: 3,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
