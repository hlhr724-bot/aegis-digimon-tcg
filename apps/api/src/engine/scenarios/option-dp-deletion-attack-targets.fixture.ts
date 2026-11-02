import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "option-dp-deletion-attack-targets",
  memory: 8,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "ST24-05", as: "attacker" }],
      hand: [{ card: "BT25-104", as: "dpOption" }],
      deck: Array.from({ length: 16 }, () => "BT1-009"),
      security: 5,
    },
    1: {
      battleArea: [
        { card: "BT1-019", as: "zeroDpTarget", suspended: true },
        { card: "BT1-024", as: "survivor", suspended: true },
      ],
      deck: Array.from({ length: 16 }, () => "BT1-009"),
      security: 5,
    },
  },
};

export default fixture;
