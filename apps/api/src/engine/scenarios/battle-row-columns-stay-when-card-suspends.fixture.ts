import type { ScenarioFixture } from "../scenario/types.js";

const deck = (seat: 0 | 1) =>
  Array.from({ length: 8 }, (_, index) => ({ card: "BT1-009", as: `deck-${seat}-${index}-card` }));

const fixture: ScenarioFixture = {
  name: "battle-row-columns-stay-when-card-suspends",
  board: {
    "0": {
      deck: deck(0),
      eggDeck: [{ card: "BT1-001", as: "egg-0-card" }],
      security: [
        { card: "BT1-009", as: "security-0-0-card" },
        { card: "BT1-009", as: "security-0-1-card" },
      ],
      hand: [{ card: "BT1-011", as: "viewer-hand-card" }],
      battleArea: [
        { card: "EX7-033", as: "attacker", top: { card: "EX7-033", as: "attacker-card" } },
        { card: "BT1-010", as: "neighbour", top: { card: "BT1-010", as: "neighbour-card" } },
      ],
    },
    "1": {
      deck: deck(1),
      eggDeck: [{ card: "BT1-001", as: "egg-1-card" }],
      security: [
        { card: "BT1-009", as: "security-1-0-card" },
        { card: "BT1-009", as: "security-1-1-card" },
      ],
      hand: [{ card: "BT1-011", as: "opponent-hand-card" }],
      battleArea: [{ card: "BT1-010", as: "opponent-digimon", top: { card: "BT1-010", as: "opponent-digimon-card" } }],
    },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
