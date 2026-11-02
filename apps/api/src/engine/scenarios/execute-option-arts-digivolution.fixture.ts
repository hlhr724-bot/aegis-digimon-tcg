import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "execute-option-arts-digivolution",
  memory: 2,
  turnSeat: 0,
  turnCount: 3,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      hand: [{ card: "BT25-083", as: "ladyDevimon" }],
      trash: [
        { card: "BT26-078", as: "cherubimon" },
        { card: "BT25-085", as: "flyBullet" },
      ],
      deck: Array<string>(10).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [{ card: "BT1-010", as: "optionTarget" }],
      deck: Array<string>(10).fill("BT1-009"),
      security: 5,
    },
  },
};

export default fixture;
