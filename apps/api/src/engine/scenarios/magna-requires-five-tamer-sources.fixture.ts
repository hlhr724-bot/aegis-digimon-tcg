import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "magna-requires-five-tamer-sources",
  board: {
    0: {
      battleArea: [{ card: "AD1-023", as: "tamer", under: ["BT18-037", "BT17-023", "BT18-037", "BT17-023"] }],
      hand: [
        { card: "BT18-097", as: "option" },
        { card: "BT18-042", as: "magna" },
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
