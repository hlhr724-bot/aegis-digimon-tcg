import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "trait-color-waiver-excludes-breeding",
  board: {
    0: {
      breeding: { card: "BT18-030", as: "candlemon" },
      hand: [{ card: "BT18-098", as: "dragons-roar" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [{ card: "BT1-009", as: "target" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
  },
  memory: 8,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
