import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  memory: 10,
  turnSeat: 1,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "ST1-07", as: "tauntedAttacker" },
        { card: "BT1-009", as: "laterTauntedBystander" },
      ],
      deck: Array<string>(8).fill("ST1-03"),
      eggDeck: ["BT1-001"],
      security: 5,
    },
    1: {
      battleArea: [{ card: "BT3-075", as: "blockingCraniamon", under: [{ card: "EX13-056", as: "inheritedGiromon" }] }],
      hand: [
        { card: "BT25-054", as: "openingTaunter" },
        { card: "BT25-054", as: "blockPlayedTaunter" },
      ],
      deck: Array<string>(8).fill("ST1-03"),
      eggDeck: ["BT1-001"],
      security: 5,
    },
  },
};

export default fixture;
