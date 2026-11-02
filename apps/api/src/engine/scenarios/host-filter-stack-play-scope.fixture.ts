import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "host-filter-stack-play-scope",
  board: {
    0: {
      battleArea: [
        { card: "EX3-022", as: "megaseadramon", under: [{ card: "BT1-027", as: "megaseadramon-source" }] },
        { card: "BT1-037", as: "blue-host", under: [{ card: "BT1-028", as: "blue-host-source" }] },
        { card: "BT1-014", as: "red-host", under: [{ card: "BT1-027", as: "red-host-source" }] },
      ],
      deck: Array(8).fill("BT1-010"),
      security: 3,
    },
    1: {
      deck: Array(8).fill("BT1-010"),
      security: 3,
    },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};
export default fixture;
