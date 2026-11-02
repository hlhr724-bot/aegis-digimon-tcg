import type { ScenarioFixture } from "../scenario/types.js";
import { dealtCards } from "../scenario/dealtCards.js";
import { BLUE_DECK, RED_DECK } from "../testDecks.js";

const fixture: ScenarioFixture = {
  name: "effect-target-arrow-for-restriction",
  board: {
    "0": {
      hand: [{ card: "BT11-112", as: "effect-target-tamer-card" }],
      deck: dealtCards({ deck: BLUE_DECK, seat: 0, indices: Array.from({ length: 50 }, (_, index) => index) }),
      eggDeck: dealtCards({ deck: BLUE_DECK, seat: 0, indices: [0, 1, 2, 3, 4], egg: true, aliasOffset: 50 }),
      security: [{ card: "BT1-009", as: "effect-target-security-0-card" }],
      battleArea: [
        {
          card: "EX13-022",
          as: "own-effect-target-aeroveedramon",
          top: { card: "EX13-022", as: "own-card-effect-target-aeroveedramon-card" },
          placedByEffect: false,
        },
        {
          card: "EX13-019",
          as: "own-effect-target-veedramon",
          top: { card: "EX13-019", as: "own-card-effect-target-veedramon-card" },
          placedByEffect: false,
        },
      ],
    },
    "1": {
      deck: dealtCards({ deck: RED_DECK, seat: 1, indices: Array.from({ length: 50 }, (_, index) => index) }),
      eggDeck: dealtCards({ deck: RED_DECK, seat: 1, indices: [0, 1, 2, 3, 4], egg: true, aliasOffset: 50 }),
      security: [{ card: "BT1-009", as: "effect-target-security-1-card" }],
      battleArea: [
        {
          card: "EX13-023",
          as: "opponent-effect-target-digimon",
          top: { card: "EX13-023", as: "opponent-card-effect-target-digimon-card" },
          placedByEffect: false,
        },
      ],
    },
  },
  memory: 5,
  turnSeat: 0,
  turnCount: 6,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
