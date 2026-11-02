import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "large-trigger-resolution-plan",
  turnSeat: 0,
  turnCount: 3,
  memory: 10,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      deck: ["BT1-009", "BT1-009", "BT1-009"],
      security: ["BT1-009", "BT1-009"],
      hand: ["BT19-043"],
      battleArea: [
        { card: "BT7-111", as: "lucemon" },
        { card: "EX11-067", as: "first-dokuson-controller-digivolution-memory-effect-source" },
        { card: "EX11-067", as: "second-dokuson-controller-digivolution-memory-effect-source" },
      ],
      trash: [
        { card: "BT19-094", as: "first-divine-cruz-controller-digivolution-delay-effect-source" },
        { card: "BT19-094", as: "second-divine-cruz-controller-digivolution-delay-effect-source" },
      ],
    },
    1: {
      deck: ["BT1-009", "BT1-009", "BT1-009"],
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
  },
};

export default fixture;
