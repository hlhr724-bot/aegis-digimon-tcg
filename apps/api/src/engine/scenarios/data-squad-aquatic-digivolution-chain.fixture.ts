import type { CardSpec, ScenarioFixture } from "../scenario/types.js";

const faceDown = (card: string, alias: string): CardSpec => ({ card, as: alias, faceUp: false });

const fixture: ScenarioFixture = {
  name: "data-squad-aquatic-digivolution-chain",
  board: {
    0: {
      hand: [
        { card: "BT2-024", as: "aquaticCost" },
        { card: "BT27-028", as: "shaujinmon" },
        { card: "BT27-031", as: "jumboGamemon" },
      ],
      battleArea: [
        { card: "BT27-095", as: "homer", under: [faceDown("BT1-011", "homerFaceDown")] },
        { card: "ST24-03", as: "gaogamon" },
      ],
      deck: [{ card: "BT1-010", as: "turnDraw" }, ...Array<string>(11).fill("BT1-010")],
      eggDeck: ["BT1-001"],
      security: 3,
    },
    1: {
      battleArea: [
        { card: "BT1-009", as: "returnTarget", under: ["BT1-009"] },
        { card: "BT1-020", as: "lockTarget", under: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"] },
      ],
      deck: Array<string>(8).fill("BT1-010"),
      eggDeck: ["BT1-001"],
      security: 3,
    },
  },
  memory: 5,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
