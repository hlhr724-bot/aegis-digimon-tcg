import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "crimson-blaze-xros-source-play",
  turnSeat: 1,
  turnCount: 4,
  memory: 10,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [
        { card: "P-224", as: "kotone", under: [{ card: "BT19-014", as: "ex6" }] },
        {
          card: "AD1-006",
          as: "x7",
          under: [
            { card: "BT21-021", as: "omniShoutmon" },
            "BT10-049",
            "BT10-034",
            "BT10-029",
            { card: "AD1-013", as: "zeigGreymon" },
          ],
        },
      ],
    },
    1: {
      hand: [
        { card: "BT8-097", as: "crimsonBlaze" },
        { card: "ST1-16", as: "gaiaForce" },
      ],
      battleArea: [{ card: "BT1-009", as: "redSource" }],
    },
  },
};

export default fixture;
