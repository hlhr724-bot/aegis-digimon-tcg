import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "king-drasil-omekamon-security-removal-retrigger",
  memory: 10,
  turnSeat: 0,
  turnCount: 4,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      battleArea: [{ card: "EX14-012", as: "attacker" }],
      deck: Array<string>(8).fill("BT1-009"),
      security: 3,
    },
    1: {
      breeding: { card: "BT13-007", as: "kingDrasil", under: [{ card: "BT20-083", as: "omekamon" }] },
      deck: Array<string>(8).fill("BT1-009"),
      security: ["BT1-009", "BT1-009", "BT1-009", "BT1-009"],
    },
  },
};

export default fixture;
