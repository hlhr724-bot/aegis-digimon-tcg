import type { ScenarioFixture } from "#api/engine/scenario/types";

const faceDown = (card: string) => ({ card, faceUp: false });

const fixture: ScenarioFixture = {
  name: "ordered-yes-preset-still-asks-later-cost-gated-choice",
  board: {
    0: {
      battleArea: [
        { card: "BT27-097", as: "firstMakoto", under: [faceDown("BT1-009"), faceDown("BT1-011")] },
        { card: "BT27-097", as: "secondMakoto", under: [faceDown("BT1-009"), faceDown("BT1-011")] },
        { card: "BT1-010", as: "attacker" },
      ],
      deck: Array(8).fill("BT1-009"),
      trash: [{ card: "BT26-075", as: "beatbreakOption" }],
      security: ["BT1-009"],
    },
    1: {
      battleArea: [{ card: "BT1-009", as: "target" }],
      deck: Array(8).fill("BT1-009"),
      security: ["BT1-009", "BT1-009"],
    },
  },
  memory: 5,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
