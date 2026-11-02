import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "alliance-suspension-evolves-hisyaryumon",
  board: {
    0: {
      battleArea: [
        { card: "BT15-063", as: "hisyaryumon", under: ["BT15-087", "BT15-056", "BT15-058"] },
        { card: "BT1-009", as: "ally" },
      ],
      hand: [{ card: "BT27-015", as: "ouryumon" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [
        { card: "BT1-009", as: "target-one" },
        { card: "BT1-009", as: "target-two" },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
    },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
