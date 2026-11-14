import type { ScenarioFixture } from "#api/engine/scenario/types";

const fixture: ScenarioFixture = {
  name: "security-play-on-play-resolves-before-security-battle",
  memory: 3,
  turnSeat: 1,
  turnCount: 2,
  isFirstPlayersFirstTurn: false,
  board: {
    0: {
      security: [{ card: "BT14-038", as: "securityEtemon" }, "BT1-009", "BT1-009"],
      hand: [{ card: "EX13-035", as: "kingEtemon" }],
      trash: [
        { card: "BT14-034", as: "sukamonA" },
        { card: "BT14-034", as: "sukamonB" },
        { card: "BT14-034", as: "sukamonC" },
      ],
      deck: ["BT1-009", "BT1-009", "BT1-009"],
    },
    1: {
      battleArea: [{ card: "BT10-010", as: "attacker", top: { card: "BT10-010", as: "attackerTop" } }],
      deck: [{ card: "BT1-009", as: "turnDraw" }, "BT1-009", "BT1-009"],
      security: ["BT1-009", "BT1-009"],
    },
  },
  presentation: { opponent: { endBreeding: true, main: [{ kind: "attack" }], fallbackMain: "end" } },
};

export default fixture;
