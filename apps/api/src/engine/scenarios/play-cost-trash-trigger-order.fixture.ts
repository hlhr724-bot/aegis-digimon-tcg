import type { ScenarioFixture } from "../scenario/types.js";

const fixture: ScenarioFixture = {
  name: "play-cost-trash-trigger-order",
  board: {
    "0": {
      hand: [
        { card: "BT25-049", as: "played-digimon" },
        { card: "BT26-091", as: "data-squad-tamer" },
      ],
      deck: ["BT1-085", "BT1-085", "BT1-085", "BT1-085", "BT1-085", "BT1-085"],
      eggDeck: ["BT1-001"],
      security: ["BT1-085", "BT1-085", "BT1-085"],
      battleArea: [
        { card: "BT26-049", as: "own-rosemon", under: ["BT1-085"] },
        {
          card: "BT25-088",
          as: "cost-tamer",
          under: [{ card: "BT1-085", as: "cost-tamer-face-down-card", faceUp: false }],
        },
      ],
    },
    "1": {
      deck: ["BT1-085", "BT1-085", "BT1-085", "BT1-085", "BT1-085", "BT1-085"],
      eggDeck: ["BT1-001"],
      security: ["BT1-085", "BT1-085", "BT1-085"],
      battleArea: [{ card: "BT1-009", as: "opponent-digimon" }],
    },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 6,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
