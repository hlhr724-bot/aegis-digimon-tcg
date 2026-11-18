import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "arts-digivolve-entry-effects-before-opponent-digivolve-watcher",
  memory: 5,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        {
          card: "BT25-035",
          as: "artsBase",
          under: [
            { card: "BT1-009", as: "artsBaseLowerSource" },
            { card: "BT1-009", as: "artsBaseUpperSource" },
          ],
        },
        {
          card: "BT1-085",
          as: "tamer",
          under: [
            { card: "BT1-009", as: "tamerBottomSource", faceUp: false },
            { card: "BT1-009", as: "tamerTopSource", faceUp: false },
          ],
        },
      ],
      hand: [{ card: "BT25-057", as: "monarchlizamon" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [
        {
          card: "BT25-028",
          as: "dianamon",
          under: [
            { card: "BT1-009", as: "dianamonRookie" },
            { card: "BT1-014", as: "dianamonChampion" },
            { card: "BT1-020", as: "dianamonUltimate" },
          ],
        },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009"],
    },
  },
};

export default fixture;
