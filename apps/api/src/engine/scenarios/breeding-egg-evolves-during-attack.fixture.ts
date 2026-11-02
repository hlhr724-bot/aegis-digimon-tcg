import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "breeding-egg-evolves-during-attack",
  board: {
    0: {
      breeding: { card: "P-176", as: "breedingEgg" },
      battleArea: [
        { card: "BT20-015", as: "attacker", under: ["BT20-010", "BT20-012"] },
        { card: "BT20-087", as: "tamer" },
      ],
      hand: [{ card: "BT20-018", as: "ouryumon" }],
      trash: [{ card: "EX13-049", as: "breedingEvolution" }],
      deck: ["BT1-009", "BT1-009", "BT1-009"],
    },
    1: {
      security: ["BT1-009", "BT1-009", "BT1-009"],
      deck: ["BT1-009", "BT1-009", "BT1-009"],
    },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
