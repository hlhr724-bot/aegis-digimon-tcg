import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 10,
  turnSeat: 0,
  turnCount: 0,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      hand: [{ card: "ST1-16", as: "gaiaForce" }],
      battleArea: [{ card: "BT1-009", as: "redDigimon" }],
      deck: Array<string>(8).fill("ST1-03"),
      eggDeck: ["BT1-001"],
      security: 3,
    },
    1: {
      battleArea: [
        {
          card: "EX6-062",
          as: "ultimateChaosmon",
          under: [
            { card: "BT20-036", as: "yellowBlackBancholeomon" },
            { card: "EX5-055", as: "firstHeavyleomon" },
            { card: "BT27-053", as: "greenYellowBancholeomon" },
            { card: "EX5-055", as: "secondHeavyleomon" },
          ],
        },
      ],
      deck: Array<string>(8).fill("ST1-03"),
      eggDeck: ["BT1-001"],
      security: 3,
    },
  },
};

export default fixture;
