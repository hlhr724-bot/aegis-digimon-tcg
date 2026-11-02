import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "declined-inherited-leave-replacement",
  memory: 3,
  turnSeat: 1,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      breeding: {
        card: "BT22-079",
        as: "mother-host",
        under: [
          { card: "BT22-007", as: "first-inherited" },
          { card: "BT22-007", as: "second-inherited" },
        ],
      },
      battleArea: [
        { card: "BT22-080", as: "first-victim", suspended: true, dp: 3000 },
        { card: "BT22-080", as: "second-victim", suspended: true, dp: 3000 },
      ],
      deck: Array<string>(10).fill("BT1-010"),
      security: 5,
    },
    1: {
      battleArea: [
        { card: "BT1-019", as: "first-attacker", dp: 12000 },
        { card: "BT1-019", as: "second-attacker", dp: 12000 },
      ],
      deck: Array<string>(10).fill("BT1-010"),
      security: 5,
    },
  },
};

export default fixture;
