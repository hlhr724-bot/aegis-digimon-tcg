import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "multicolor-dna-materials",
  board: {
    0: {
      battleArea: [
        { card: "BT24-058", as: "blimpmon" },
        { card: "BT26-022", as: "sorcermon", under: ["P-197", "BT25-003"] },
      ],
      hand: [{ card: "BT25-038", as: "shakkoumon" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: { deck: Array<string>(8).fill("BT1-009"), security: 3 },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
