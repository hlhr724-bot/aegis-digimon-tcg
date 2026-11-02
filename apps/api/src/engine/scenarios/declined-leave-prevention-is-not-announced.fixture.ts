import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "declined-leave-prevention-is-not-announced",
  memory: 3,
  turnSeat: 1,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "EX13-024", as: "slayerdramon" },
        { card: "ST8-03", as: "spareDracomon" },
        { card: "ST8-03", as: "firstDracomon", suspended: true },
        { card: "ST8-03", as: "secondDracomon", suspended: true },
        { card: "ST8-03", as: "thirdDracomon", suspended: true },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: 5,
    },
    1: {
      battleArea: [
        { card: "BT1-013", as: "firstAttacker" },
        { card: "BT1-013", as: "secondAttacker" },
        { card: "BT1-013", as: "thirdAttacker" },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: 5,
    },
  },
};

export const declinedDelayFixture: ScenarioFixture = {
  name: "declined-leave-prevention-is-not-announced-delay",
  memory: 8,
  turnSeat: 1,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "BT20-093", as: "dragonGene" },
        { card: "ST8-03", as: "endangeredDracomon" },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: 5,
    },
    1: {
      battleArea: [{ card: "BT1-009", as: "redOptionColor" }],
      hand: [{ card: "ST1-16", as: "gaiaForce" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 5,
    },
  },
};

export default fixture;
