import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "zero-dp-after-attack-immunity",
  board: {
    0: {
      battleArea: [
        { card: "BT1-080", as: "first-attacker", under: ["AD1-015", "AD1-015"] },
        { card: "BT1-080", as: "second-attacker", under: ["AD1-015", "AD1-015"] },
      ],
      hand: [{ card: "BT1-009", as: "next-play" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 5,
    },
    1: {
      battleArea: [{ card: "BT27-103", as: "ouryuken", under: ["BT13-075", "BT27-015"] }],
      deck: Array<string>(8).fill("BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
    },
  },
  memory: 5,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
