import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "purge-places-bottom-source",
  board: {
    0: {
      breeding: { card: "BT13-007", as: "drasil", under: ["BT13-040", "BT13-028"] },
      hand: [
        { card: "BT13-110", as: "option" },
        { card: "BT1-045", as: "material" },
      ],
      deck: Array(8).fill("BT1-010"),
      security: 3,
    },
    1: { deck: Array(8).fill("BT1-010"), security: 3 },
  },
  memory: 10,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
