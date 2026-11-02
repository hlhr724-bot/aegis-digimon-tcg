import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "nested-option-use-during-attack-evolution",
  board: {
    0: {
      battleArea: [
        { card: "BT25-049", as: "attacker", under: ["ST23-01"] },
        { card: "BT1-087", as: "tamer", under: [{ card: "BT1-009", as: "evolutionCost", faceUp: false }] },
      ],
      hand: [
        { card: "BT25-041", as: "murasamemon" },
        { card: "BT25-057", as: "outerOption" },
        { card: "BT27-067", as: "innerOption" },
      ],
      security: ["BT1-009"],
      deck: ["BT1-010", "BT1-010", "BT1-010", "BT1-010"],
    },
    1: {
      security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
      deck: ["BT1-010", "BT1-010", "BT1-010"],
    },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
