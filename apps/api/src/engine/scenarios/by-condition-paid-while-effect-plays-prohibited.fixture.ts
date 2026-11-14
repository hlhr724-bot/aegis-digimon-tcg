import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "by-condition-paid-while-effect-plays-prohibited",
  memory: 10,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "BT1-059", as: "attacker" }],
      hand: [{ card: "EX13-035", as: "kingEtemon" }],
      trash: Array.from({ length: 10 }, (_, index) => ({ card: "BT3-061", as: `chuumon${index}` })),
      deck: [
        { card: "BT1-009", as: "turnDraw" },
        { card: "BT1-009", as: "deckBottom" },
      ],
      security: ["BT1-009", "BT1-009"],
    },
    1: {
      security: [{ card: "BT8-097", as: "crimsonBlaze" }, "BT1-009", "BT1-009"],
      deck: ["BT1-009", "BT1-009", "BT1-009"],
    },
  },
};

export default fixture;
