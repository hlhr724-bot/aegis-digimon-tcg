import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "this-digimon-stack-play-host-scope",
  board: {
    0: {
      battleArea: [
        {
          card: "BT17-069",
          as: "fang-host",
          under: [
            { card: "BT15-006", as: "fang-host-egg" },
            { card: "BT17-091", as: "cracker-fang" },
            { card: "BT14-087", as: "fang-host-eiji" },
          ],
        },
        {
          card: "BT1-009",
          as: "other-host",
          under: [
            { card: "BT1-001", as: "other-host-egg" },
            { card: "BT14-087", as: "other-host-eiji" },
          ],
        },
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
