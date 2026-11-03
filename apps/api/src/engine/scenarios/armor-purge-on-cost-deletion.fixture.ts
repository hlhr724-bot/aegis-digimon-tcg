import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "armor-purge-on-cost-deletion",
  board: {
    0: {
      hand: [{ card: "BT27-079", as: "gizmonXt" }],
      deck: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
      battleArea: [
        { card: "BT27-098", as: "akihiro" },
        { card: "BT27-048", as: "stegomon", under: [{ card: "BT27-092", as: "kurataTamer" }] },
      ],
      security: 3,
    },
    1: { deck: ["BT1-009", "BT1-009", "BT1-009"], security: 3 },
  },
  turnSeat: 0,
  turnCount: 4,
  memory: 10,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
