import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "decode-iliad-sources",
  board: {
    0: {
      battleArea: [
        {
          card: "BT26-083",
          as: "hysteric",
          under: [{ card: "BT25-082", as: "blackgatomon" }, "BT25-083", "BT25-085"],
        },
        {
          card: "EX7-073",
          as: "otherHost",
          under: [{ card: "BT25-082", as: "otherBlackgatomon" }],
        },
      ],
      deck: Array(8).fill("BT1-010"),
      security: 3,
    },
    1: {
      hand: [{ card: "ST1-16", as: "gaiaForce" }],
      battleArea: [{ card: "BT1-085", as: "redTamer" }],
      deck: Array(8).fill("BT1-010"),
      security: 3,
    },
  },
  memory: 10,
  turnSeat: 1,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
  presentation: {
    opponent: {
      main: [{ kind: "play", card: "ST1-16" }],
      decisions: [{ sourceCard: "ST1-16", kind: "chooseTargets", target: "hysteric" }],
      fallbackMain: "end",
    },
  },
};

export default fixture;
