import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "arts-evolution-shares-play-trigger-order",
  board: {
    0: {
      battleArea: [
        { card: "BT27-080", as: "arts-base" },
        {
          card: "BT1-087",
          as: "tamer",
          under: [
            { card: "BT1-009", as: "cost-one", faceUp: false },
            { card: "BT1-010", as: "cost-two", faceUp: false },
          ],
        },
      ],
      hand: [{ card: "BT27-082", as: "nosferamon" }],
      trash: [
        { card: "ST23-03", as: "played" },
        { card: "BT26-061", as: "other-revival" },
      ],
      deck: Array<string>(12).fill("BT1-009"),
      security: 3,
    },
    1: { deck: Array<string>(12).fill("BT1-009"), security: 3 },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
