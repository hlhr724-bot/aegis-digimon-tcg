import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "dantemon-seven-link-resolution-plan",
  board: {
    0: {
      deck: Array<string>(12).fill("BT1-009"),
      security: Array<string>(5).fill("BT1-009"),
      hand: [{ card: "BT26-086", as: "dantemon" }],
      battleArea: [{ card: "BT25-098", as: "cyber-engage", placedByEffect: true }],
      trash: ["BT26-010", "BT26-019", "BT26-028", "BT26-037", "BT26-051", "BT26-063", "BT26-084"],
    },
    1: { deck: Array<string>(12).fill("BT1-009"), security: Array<string>(5).fill("BT1-009") },
  },
  memory: 3,
  turnSeat: 0,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
};

export default fixture;
