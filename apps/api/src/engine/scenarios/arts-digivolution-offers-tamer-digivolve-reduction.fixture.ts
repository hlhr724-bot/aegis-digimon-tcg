import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "arts-digivolution-offers-tamer-digivolve-reduction",
  board: {
    0: {
      battleArea: [
        { card: "BT27-030", as: "arts-base" },
        {
          card: "BT25-087",
          as: "thomas",
          under: [
            { card: "BT1-009", as: "bottom-under", faceUp: false },
            { card: "BT1-009", as: "second-under", faceUp: false },
            { card: "BT1-010", as: "third-under", faceUp: false },
            { card: "BT1-010", as: "top-under", faceUp: false },
          ],
        },
      ],
      hand: [{ card: "BT27-032", as: "mirage" }],
      deck: Array<string>(12).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [
        { card: "BT1-010", as: "returned" },
        { card: "BT1-011", as: "other" },
      ],
      deck: Array<string>(12).fill("BT1-009"),
      security: 3,
    },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
