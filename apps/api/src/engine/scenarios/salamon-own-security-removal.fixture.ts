import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "salamon-own-security-removal",
  memory: 3,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT1-058", as: "host", under: ["BT15-034"] }],
      hand: [{ card: "BT4-104", as: "option" }],
      security: ["BT1-009", "BT1-009"],
      deck: ["BT1-009", "BT1-009"],
    },
    1: {
      battleArea: [{ card: "BT1-060", as: "target", dp: 7000 }],
      security: ["BT1-009", "BT1-009"],
      deck: ["BT1-009", "BT1-009"],
    },
  },
};

export default fixture;
