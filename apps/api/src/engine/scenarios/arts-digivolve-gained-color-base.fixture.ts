import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 10,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        {
          card: "BT8-084",
          as: "purpleSourcedKimeramon",
          under: [{ card: "BT26-070", as: "purpleSource" }],
        },
        {
          card: "BT8-084",
          as: "redSourcedKimeramon",
          under: [{ card: "ST1-07", as: "redSource" }],
        },
      ],
      hand: [{ card: "BT27-082", as: "nosferamon" }],
      security: ["ST1-03", "ST1-03", "ST1-03"],
      deck: Array<string>(12).fill("ST1-03"),
      eggDeck: ["BT1-001"],
    },
    1: {
      battleArea: [{ card: "ST1-03", as: "opponentAgumon" }],
      security: ["ST1-03"],
      deck: Array<string>(12).fill("ST1-03"),
    },
  },
};

export default fixture;
