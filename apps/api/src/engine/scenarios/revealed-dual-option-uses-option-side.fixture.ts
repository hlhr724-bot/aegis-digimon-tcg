import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "revealed-dual-option-uses-option-side",
  memory: 10,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      eggDeck: ["BT1-003"],
      battleArea: [{ card: "BT10-064", as: "base" }],
      hand: [{ card: "LM-067", as: "gundramon" }],
      deck: [
        "BT1-010",
        "BT1-010",
        { card: "LM-067", as: "revealedOption" },
        ...Array.from({ length: 18 }, () => "BT1-010"),
      ],
      security: 3,
    },
    1: {
      battleArea: [{ card: "BT2-078", as: "opponent", under: [{ card: "BT1-009", as: "opponentSource" }] }],
      deck: Array.from({ length: 20 }, () => "BT1-010"),
      security: 5,
    },
  },
};

export default fixture;
