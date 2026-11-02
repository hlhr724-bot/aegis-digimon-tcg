import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "granted-deletion-controller",
  memory: 7,
  turnSeat: 0,
  turnCount: 1,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      hand: [{ card: "EX7-072", as: "fascination" }],
      battleArea: [{ card: "EX7-061", as: "caster" }],
      deck: ["BT1-009", "BT1-010", "BT1-011"],
      security: ["BT1-009"],
    },
    1: {
      battleArea: [
        { card: "BT1-009", as: "first" },
        { card: "BT1-010", as: "second" },
      ],
      hand: ["BT1-011"],
      deck: ["BT1-011", "BT1-012", "BT1-013"],
      security: ["BT1-010"],
    },
  },
};

export default fixture;
