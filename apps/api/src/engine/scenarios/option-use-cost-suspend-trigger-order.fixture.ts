import type { ScenarioFixture } from "../scenario/types.js";

const fixture: ScenarioFixture = {
  name: "option-use-cost-suspend-trigger-order",
  board: {
    "0": {
      hand: [{ card: "LM-066", as: "tempest-option" }],
      deck: ["BT1-085", "BT1-085", "BT1-085", "BT1-085", "BT1-085", "BT1-085"],
      eggDeck: ["BT1-001"],
      security: ["BT1-085", "BT1-085", "BT1-085"],
      battleArea: [{ card: "ST18-04", as: "own-cost-digimon" }],
    },
    "1": {
      hand: [{ card: "BT26-091", as: "opponent-data-squad-tamer" }],
      deck: ["BT1-085", "BT1-085", "BT1-085", "BT1-085", "BT1-085", "BT1-085"],
      eggDeck: ["BT1-001"],
      security: ["BT1-085", "BT1-085", "BT1-085"],
      battleArea: [
        { card: "BT26-049", as: "opponent-rosemon", under: ["BT1-085"] },
        { card: "ST24-04", as: "opponent-cost-digimon" },
      ],
    },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 6,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
