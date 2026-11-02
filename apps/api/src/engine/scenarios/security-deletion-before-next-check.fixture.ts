import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "security-deletion-before-next-check",
  turnSeat: 0,
  turnCount: 4,
  memory: 3,
  isFirstPlayersFirstTurn: false,
  presentation: { timed: false },
  board: {
    0: {
      hand: [{ card: "BT24-037", as: "director" }],
      battleArea: [
        { card: "BT2-018", as: "attacker", dp: 22000 },
        { card: "BT19-063", as: "recruiter" },
        { card: "EX13-074", as: "tamer", under: ["EX13-048"] },
      ],
    },
    1: { security: ["BT27-082", "BT27-082", "ST1-02"] },
  },
};

export default fixture;
