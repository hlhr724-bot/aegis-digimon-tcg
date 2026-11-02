import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "arts-partition-security-trigger-priority",
  board: {
    0: {
      battleArea: [{ card: "EX13-036", as: "base" }],
      hand: [{ card: "BT27-043", as: "dual" }, "BT1-009"],
      deck: ["BT1-009", "BT1-009"],
      security: ["BT1-009", "BT1-009"],
    },
    1: {
      battleArea: [{ card: "BT20-037", as: "valdur", under: ["EX13-036", "BT1-083"] }],
      deck: ["BT1-009", "BT1-009"],
      security: ["BT1-009", "BT1-009"],
    },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 1,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
