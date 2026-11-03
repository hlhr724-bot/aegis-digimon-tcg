import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "direct-battle-without-defender-skips-attacker-choice",
  board: {
    0: {
      battleArea: [
        { card: "EX13-044", as: "breakdramon" },
        { card: "ST1-04", as: "dracomon" },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [{ card: "P-038", as: "delayOption" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
