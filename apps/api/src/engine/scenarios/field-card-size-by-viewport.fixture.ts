import type { ScenarioFixture } from "../scenario/types.js";

const digimon = (prefix: string) =>
  Array.from({ length: 4 }, (_, index) => ({
    card: "ST1-03",
    as: `${prefix}-digimon-${index + 1}`,
    dp: 3000,
    placedByEffect: false,
  }));

const tamers = (prefix: string) =>
  Array.from({ length: 2 }, (_, index) => ({
    card: "BT1-088",
    as: `${prefix}-tamer-${index + 1}`,
    dp: 0,
    placedByEffect: false,
  }));

const fixture: ScenarioFixture = {
  name: "field-card-size-by-viewport",
  board: {
    0: {
      deck: Array<string>(20).fill("ST1-03"),
      eggDeck: ["BT1-001", "BT1-001"],
      security: 5,
      battleArea: [...digimon("own"), ...tamers("own")],
    },
    1: {
      deck: Array<string>(20).fill("ST1-03"),
      eggDeck: ["BT1-001", "BT1-001"],
      security: 5,
      battleArea: [...digimon("opponent"), ...tamers("opponent")],
    },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
