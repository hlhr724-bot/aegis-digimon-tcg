import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "arts-digivolve-inside-effect-resolves-turn-player-entry-effects-first",
  memory: 10,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        {
          card: "ST23-13",
          as: "tamer",
          under: [
            { card: "BT1-009", as: "firstCostCard" },
            { card: "BT1-009", as: "secondCostCard" },
          ],
        },
      ],
      hand: [
        { card: "ST23-04", as: "murasamemon" },
        { card: "BT25-043", as: "habakiri" },
      ],
      deck: Array.from({ length: 16 }, () => "BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
    1: {
      battleArea: [{ card: "ST16-07", as: "meramon" }],
      deck: Array.from({ length: 16 }, () => "BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009", "BT1-009"],
    },
  },
};

export default fixture;
