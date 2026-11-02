import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "inherited-end-of-turn-player-attack-is-optional",
  board: {
    0: {
      battleArea: [{ card: "BT18-011", as: "hybridHost", under: ["BT18-088"] }],
      deck: Array(8).fill("BT1-010"),
    },
    1: { deck: Array(8).fill("BT1-010"), security: ["BT1-010"] },
  },
  memory: 5,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
