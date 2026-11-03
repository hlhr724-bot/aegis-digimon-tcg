import type { ScenarioFixture } from "../scenario/types.js";

const fixture: ScenarioFixture = {
  name: "metaletemon-redirect-player",
  board: {
    "0": {
      hand: [{ card: "BT11-041", as: "metaletemon-hand-etemon-card" }],
      deck: [
        { card: "BT1-085", as: "metaletemon-deck-0-0-card" },
        { card: "BT1-085", as: "metaletemon-deck-0-1-card" },
        { card: "BT1-085", as: "metaletemon-deck-0-2-card" },
        { card: "BT1-085", as: "metaletemon-deck-0-3-card" },
        { card: "BT1-085", as: "metaletemon-deck-0-4-card" },
        { card: "BT1-085", as: "metaletemon-deck-0-5-card" },
        { card: "BT1-085", as: "metaletemon-deck-0-6-card" },
        { card: "BT1-085", as: "metaletemon-deck-0-7-card" },
      ],
      eggDeck: [{ card: "BT1-001", as: "metaletemon-egg-0-card" }],
      security: [
        { card: "BT1-009", as: "metaletemon-security-0-0-card" },
        { card: "BT1-009", as: "metaletemon-security-0-1-card" },
        { card: "BT1-009", as: "metaletemon-security-0-2-card" },
      ],
      battleArea: [
        {
          card: "EX5-054",
          as: "own-metaletemon",
          top: { card: "EX5-054", as: "own-card-metaletemon-card" },
          dp: 12000,
          placedByEffect: false,
          suspended: true,
          under: [{ card: "BT11-041", as: "own-source-metaletemon-0-card" }],
        },
        { card: "BT1-009", as: "own-attacked-digimon", suspended: true },
      ],
    },
    "1": {
      deck: [
        { card: "BT1-085", as: "metaletemon-deck-1-0-card" },
        { card: "BT1-085", as: "metaletemon-deck-1-1-card" },
        { card: "BT1-085", as: "metaletemon-deck-1-2-card" },
        { card: "BT1-085", as: "metaletemon-deck-1-3-card" },
        { card: "BT1-085", as: "metaletemon-deck-1-4-card" },
        { card: "BT1-085", as: "metaletemon-deck-1-5-card" },
        { card: "BT1-085", as: "metaletemon-deck-1-6-card" },
        { card: "BT1-085", as: "metaletemon-deck-1-7-card" },
      ],
      eggDeck: [{ card: "BT1-001", as: "metaletemon-egg-1-card" }],
      security: [
        { card: "BT1-009", as: "metaletemon-security-1-0-card" },
        { card: "BT1-009", as: "metaletemon-security-1-1-card" },
        { card: "BT1-009", as: "metaletemon-security-1-2-card" },
      ],
      battleArea: [
        {
          card: "BT1-010",
          as: "opponent-metaletemon-agumon",
          top: { card: "BT1-010", as: "opponent-card-metaletemon-agumon-card" },
          dp: 2000,
          placedByEffect: false,
        },
      ],
    },
  },
  memory: 0,
  turnSeat: 1,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
