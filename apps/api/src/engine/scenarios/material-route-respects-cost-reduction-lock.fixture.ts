import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "material-route-respects-cost-reduction-lock",
  board: {
    0: {
      hand: [{ card: "EX13-060", as: "alphamon" }],
      trash: [
        { card: "EX13-057", as: "chronicle-lv5" },
        { card: "EX13-055", as: "chronicle-lv4" },
        { card: "EX13-049", as: "chronicle-lv3" },
      ],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: {
      battleArea: [{ card: "ST12-03", as: "solarmon" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
  },
  memory: 0,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
