import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "end-turn-dna-blitz-with-opponent-effect",
  memory: 3,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "EX3-010", as: "redMaterial", under: [{ card: "EX3-008", as: "endTurnDnaSource" }] },
        { card: "EX3-061", as: "purpleMaterial" },
      ],
      hand: [
        { card: "EX3-063", as: "dragonMode" },
        { card: "BT1-085", as: "turnEndingTamer" },
      ],
      deck: Array<string>(16).fill("BT1-010"),
      security: ["BT1-010", "BT1-010", "BT1-010"],
    },
    1: {
      battleArea: [{ card: "BT4-047", as: "endTurnSecurityTrash" }],
      eggDeck: ["BT1-003"],
      deck: Array<string>(16).fill("BT1-010"),
      security: ["BT1-010", "BT1-010", "BT1-010"],
    },
  },
};

export default fixture;
