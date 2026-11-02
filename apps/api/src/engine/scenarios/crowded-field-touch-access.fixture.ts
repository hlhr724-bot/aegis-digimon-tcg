import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "crowded-field-touch-access",
  board: {
    0: {
      deck: Array<string>(10).fill("ST1-03"),
      eggDeck: ["BT1-001"],
      security: 5,
      battleArea: Array.from({ length: 8 }, (_, index) => ({
        card: "ST1-03",
        as: `attacker-${index + 1}`,
        dp: 10000,
        placedByEffect: false,
      })),
    },
    1: {
      deck: Array<string>(10).fill("ST1-03"),
      security: 5,
      battleArea: Array.from({ length: 8 }, (_, index) => ({
        card: "ST1-03",
        as: `opponent-${index + 1}`,
        dp: 1000,
        placedByEffect: false,
      })),
    },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
